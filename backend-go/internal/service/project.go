package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/repository"
	"github.com/aiagenz/backend/pkg/crypto"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
)

// ProjectService handles business logic for projects.
type ProjectService struct {
	repo      *repository.ProjectRepository
	container *ContainerService
	enc       *crypto.Encryptor
	validate  *validator.Validate
}

// NewProjectService creates a new ProjectService.
func NewProjectService(
	repo *repository.ProjectRepository,
	container *ContainerService,
	enc *crypto.Encryptor,
) *ProjectService {
	return &ProjectService{
		repo:      repo,
		container: container,
		enc:       enc,
		validate:  validator.New(),
	}
}

// Create deploys a new project with a Docker container.
func (s *ProjectService) Create(ctx context.Context, userID string, req *domain.CreateProjectRequest) (*domain.Project, error) {
	if err := s.validate.Struct(req); err != nil {
		return nil, domain.ErrValidation(formatValidationErrors(err))
	}

	projectID := uuid.New().String()
	containerName := fmt.Sprintf("aiagenz-%s", projectID)

	// Determine image
	image := "openclaw-starter:latest"
	if strings.Contains(strings.ToLower(req.Name), "sahabatcuan") || req.Type == "marketplace" {
		image = "sahabatcuan:latest"
	}

	// Build env vars for the container (Clean Start - No Auto Provisioning)
	env := s.buildEnvVars(projectID)

	// Encrypt config before storing
	configJSON, _ := json.Marshal(domain.ProjectConfig{
		TelegramToken: req.TelegramToken,
		APIKey:        req.APIKey,
		Provider:      req.Provider,
		Model:         req.Model,
	})
	encryptedConfig, err := s.enc.Encrypt(configJSON)
	if err != nil {
		return nil, domain.ErrInternal("failed to encrypt config", err)
	}

	project := &domain.Project{
		ID:            projectID,
		UserID:        userID,
		Name:          req.Name,
		Type:          req.Type,
		Plan:          req.Plan,
		Status:        "provisioning",
		ContainerName: &containerName,
		Config:        []byte(encryptedConfig),
		CreatedAt:     time.Now(),
	}

	// Save to DB
	if err := s.repo.Create(ctx, project); err != nil {
		return nil, domain.ErrInternal("failed to save project", err)
	}

	// Create and start Docker container with plan-based resources
	plan := domain.GetPlan(req.Plan)
	resources := ContainerResources{
		MemoryMB: 2048, // Bump to 2GB for OpenClaw stability
		CPU:      plan.CPU,
	}
	containerID, err := s.container.Create(ctx, containerName, image, env, resources)
	if err != nil {
		_ = s.repo.UpdateStatus(ctx, projectID, "failed", nil)
		return nil, domain.ErrInternal("failed to create container", err)
	}

	// Clean Start: Inject Minimal "Anti-Doctor" Config
	// This prevents OpenClaw from auto-enabling Telegram and stub providers
	minimalConfig := []byte(`{"channels": {"telegram": {"enabled": false}}}`)
	if err := s.container.CopyToContainer(ctx, containerID, "/home/node/.openclaw/openclaw.json", minimalConfig); err != nil {
		// Log warning but allow startup (might be a custom image or permission issue)
		fmt.Printf("⚠️ Failed to inject minimal config: %v\n", err)
	}

	if err := s.container.Start(ctx, containerID); err != nil {
		_ = s.repo.UpdateStatus(ctx, projectID, "failed", &containerID)
		return nil, domain.ErrInternal("failed to start container", err)
	}

	// Update status
	project.Status = "running"
	project.ContainerID = &containerID
	_ = s.repo.UpdateStatus(ctx, projectID, "running", &containerID)

	return project, nil
}

// Update updates project configuration and redeploys container if needed.
func (s *ProjectService) Update(ctx context.Context, id, userID string, req *domain.UpdateProjectRequest) (*domain.Project, error) {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, domain.ErrInternal("failed to get project", err)
	}
	if project == nil {
		return nil, domain.ErrNotFound("project not found")
	}

	// Decrypt existing config
	var currentConfig domain.ProjectConfig
	if project.Config != nil {
		decrypted, err := s.enc.Decrypt(string(project.Config))
		if err == nil {
			_ = json.Unmarshal(decrypted, &currentConfig)
		}
	}

	// Update values if provided
	if req.Name != "" {
		project.Name = req.Name
	}
	if req.TelegramToken != "" {
		currentConfig.TelegramToken = req.TelegramToken
	}
	if req.APIKey != "" {
		currentConfig.APIKey = req.APIKey
	}
	if req.Provider != "" {
		currentConfig.Provider = req.Provider
	}
	if req.Model != "" {
		currentConfig.Model = req.Model
	}

	// Encrypt updated config
	configJSON, _ := json.Marshal(currentConfig)
	encryptedConfig, err := s.enc.Encrypt(configJSON)
	if err != nil {
		return nil, domain.ErrInternal("failed to encrypt config", err)
	}
	project.Config = []byte(encryptedConfig)

	// Save to DB
	if err := s.repo.Update(ctx, project); err != nil {
		return nil, domain.ErrInternal("failed to update project", err)
	}

	return project, nil
}

// List returns projects for a user with pagination.
func (s *ProjectService) List(ctx context.Context, userID string, page, limit int) ([]*domain.ProjectResponse, int64, error) {
	projects, total, err := s.repo.List(ctx, userID, page, limit)
	if err != nil {
		return nil, 0, domain.ErrInternal("failed to list projects", err)
	}

	responses := make([]*domain.ProjectResponse, len(projects))
	for i, p := range projects {
		status := p.Status
		if p.ContainerID != nil {
			// Check real status from Docker
			info, _ := s.container.Inspect(ctx, *p.ContainerID)
			if info != nil {
				status = info.Status
			}
		}
		responses[i] = &domain.ProjectResponse{
			ID:            p.ID,
			UserID:        p.UserID,
			Name:          p.Name,
			Type:          p.Type,
			Plan:          p.Plan,
			Status:        status,
			ContainerID:   p.ContainerID,
			ContainerName: p.ContainerName,
			CreatedAt:     p.CreatedAt,
		}
	}

	return responses, total, nil
}

// GetByID returns a project with masked config.
func (s *ProjectService) GetByID(ctx context.Context, id, userID string) (*domain.ProjectResponse, error) {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, domain.ErrInternal("failed to get project", err)
	}
	if project == nil {
		return nil, domain.ErrNotFound("project not found")
	}

	status := project.Status
	if project.ContainerID != nil {
		info, _ := s.container.Inspect(ctx, *project.ContainerID)
		if info != nil {
			status = info.Status
		}
	}

	resp := &domain.ProjectResponse{
		ID:            project.ID,
		UserID:        project.UserID,
		Name:          project.Name,
		Type:          project.Type,
		Plan:          project.Plan,
		Status:        status,
		ContainerID:   project.ContainerID,
		ContainerName: project.ContainerName,
		CreatedAt:     project.CreatedAt,
	}

	if project.Config != nil {
		decrypted, err := s.enc.Decrypt(string(project.Config))
		if err == nil {
			var cfg domain.ProjectConfig
			if json.Unmarshal(decrypted, &cfg) == nil {
				resp.Config = &domain.SafeProjectConfig{
					TelegramToken: maskSecret(cfg.TelegramToken),
					APIKey:        maskSecret(cfg.APIKey),
					Provider:      cfg.Provider,
					Model:         cfg.Model,
				}
			}
		}
	}

	return resp, nil
}

// Control handles start/stop/restart.
func (s *ProjectService) Control(ctx context.Context, id, userID string, action *domain.ControlAction) error {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil || project == nil || project.ContainerID == nil {
		return domain.ErrNotFound("project or container not found")
	}

	switch action.Action {
	case "start":
		err = s.container.Start(ctx, *project.ContainerID)
	case "stop":
		err = s.container.Stop(ctx, *project.ContainerID)
	case "restart":
		err = s.container.Restart(ctx, *project.ContainerID)
	default:
		return domain.ErrBadRequest("invalid action")
	}

	if err != nil {
		return domain.ErrInternal("failed container action", err)
	}

	newStatus := "running"
	if action.Action == "stop" {
		newStatus = "exited"
	}
	_ = s.repo.UpdateStatus(ctx, id, newStatus, project.ContainerID)

	return nil
}

// GetRuntimeConfig retrieves the actual openclaw.json from the running container.
func (s *ProjectService) GetRuntimeConfig(ctx context.Context, id, userID string) (map[string]interface{}, error) {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil || project == nil || project.ContainerID == nil {
		return nil, domain.ErrNotFound("project not found or container not running")
	}

	// Read config file (use /home/node/ not /root for consistency with running user)
	output, err := s.container.ExecCommand(ctx, *project.ContainerID, []string{"cat", "/home/node/.openclaw/openclaw.json"})
	if err != nil {
		return nil, domain.ErrInternal("failed to read config from container", err)
	}

	// Parse JSON
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(output), &config); err != nil {
		return nil, domain.ErrInternal("failed to parse config JSON", err)
	}

	// --- MERGE AUTH PROFILES & STATS FROM AGENT STORE ---
	// Path: /home/node/.openclaw/agents/main/agent/auth-profiles.json
	storeOutput, err := s.container.ExecCommand(ctx, *project.ContainerID, []string{"cat", "/home/node/.openclaw/agents/main/agent/auth-profiles.json"})
	if err == nil {
		var store map[string]interface{}
		if json.Unmarshal([]byte(storeOutput), &store) == nil {
			if profiles, ok := store["profiles"].(map[string]interface{}); ok {
				// Initialize auth structure if missing
				if _, ok := config["auth"].(map[string]interface{}); !ok {
					config["auth"] = map[string]interface{}{"profiles": map[string]interface{}{}}
				}
				authObj := config["auth"].(map[string]interface{})
				if _, ok := authObj["profiles"].(map[string]interface{}); !ok {
					authObj["profiles"] = map[string]interface{}{}
				}

				mainProfiles := authObj["profiles"].(map[string]interface{})
				for k, v := range profiles {
					mainProfiles[k] = v
				}
			}
			// Pass through usage stats so UI can show health
			if stats, ok := store["usageStats"]; ok {
				if authObj, ok := config["auth"].(map[string]interface{}); ok {
					authObj["usageStats"] = stats
				}
			}
		}
	}

	return config, nil
}

// UpdateRuntimeConfig updates openclaw.json and auth-profiles.json in the container and restarts it.
func (s *ProjectService) UpdateRuntimeConfig(ctx context.Context, id, userID string, newConfig map[string]interface{}) error {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil || project == nil || project.ContainerID == nil {
		return domain.ErrNotFound("project not found or container not running")
	}

	// BUG-6 FIX: Deep copy config to avoid mutating caller's map
	configCopy := deepCopyMap(newConfig)

	// 1. Prepare Auth Profiles for Agent Store
	var profiles map[string]interface{}
	if auth, ok := configCopy["auth"].(map[string]interface{}); ok {
		if p, ok := auth["profiles"].(map[string]interface{}); ok {
			profiles = p
			delete(auth, "profiles")
		}
		// Remove usageStats from config write-back (read-only runtime data)
		delete(auth, "usageStats")
	}

	// 2. Ensure directory structure exists
	if _, err := s.container.ExecCommand(ctx, *project.ContainerID, []string{"mkdir", "-p", "/home/node/.openclaw/agents/main/agent"}); err != nil {
		return domain.ErrInternal("failed to create config directory", err)
	}

	// 3. Write openclaw.json (System Config)
	systemConfigBytes, _ := json.MarshalIndent(configCopy, "", "  ")
	if err := s.container.CopyToContainer(ctx, *project.ContainerID, "/home/node/.openclaw/openclaw.json", systemConfigBytes); err != nil {
		fmt.Printf("❌ ERROR writing openclaw.json: %v\n", err) // DEBUG
		return domain.ErrInternal("failed to write config to container", err)
	}

	// 4. Write auth-profiles.json (Credentials)
	authStore := map[string]interface{}{
		"version":  1,
		"profiles": profiles,
	}
	authStoreBytes, _ := json.MarshalIndent(authStore, "", "  ")
	if err := s.container.CopyToContainer(ctx, *project.ContainerID, "/home/node/.openclaw/agents/main/agent/auth-profiles.json", authStoreBytes); err != nil {
		return domain.ErrInternal("failed to write auth profiles to container", err)
	}

	// 5. Fix permissions (ensure node user owns the files we just injected)
	if _, err := s.container.ExecCommand(ctx, *project.ContainerID, []string{"chown", "-R", "node:node", "/home/node/.openclaw"}); err != nil {
		// Non-fatal: chown may fail in some container setups
	}

	// 6. Restart container to apply changes
	if err := s.container.Restart(ctx, *project.ContainerID); err != nil {
		return domain.ErrInternal("failed to restart container", err)
	}

	return nil
}

// GetAvailableModels retrieves list of models via openclaw CLI.
func (s *ProjectService) GetAvailableModels(ctx context.Context, id, userID string) ([]map[string]interface{}, error) {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil || project == nil || project.ContainerID == nil {
		return nil, domain.ErrNotFound("project not found or container not running")
	}

	output, err := s.container.ExecCommand(ctx, *project.ContainerID, []string{"openclaw", "models", "list", "--all", "--json"})
	if err != nil {
		return nil, domain.ErrInternal("failed to list models", err)
	}

	// BUG-3 FIX: Try parsing full output first, then extract JSON substring.
	// Handle both {} objects and [] arrays, plus trailing garbage.
	output = strings.TrimSpace(output)

	// Attempt 1: Parse full output directly
	var result struct {
		Models []map[string]interface{} `json:"models"`
	}
	if json.Unmarshal([]byte(output), &result) == nil && result.Models != nil {
		return result.Models, nil
	}

	// Attempt 2: Find JSON substring (object or array)
	jsonStr := extractJSON(output)
	if jsonStr == "" {
		return nil, domain.ErrInternal("invalid cli output format", fmt.Errorf("no json found in output"))
	}

	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		// Maybe it's a raw array
		var rawModels []map[string]interface{}
		if json.Unmarshal([]byte(jsonStr), &rawModels) == nil {
			return rawModels, nil
		}
		return nil, domain.ErrInternal("failed to parse models json", err)
	}

	return result.Models, nil
}

// GetContainerLogs returns the last N lines of Docker container logs (not openclaw commands).
func (s *ProjectService) GetContainerLogs(ctx context.Context, id, userID string) (string, error) {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil || project == nil || project.ContainerID == nil {
		return "", domain.ErrNotFound("project not found or container not running")
	}

	logs, err := s.container.Logs(ctx, *project.ContainerID, 200)
	if err != nil {
		return "", domain.ErrInternal("failed to get container logs", err)
	}
	return logs, nil
}

// RunOpenClawCommand executes an arbitrary openclaw cli command safely.
func (s *ProjectService) RunOpenClawCommand(ctx context.Context, id, userID string, args []string) (interface{}, error) {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil || project == nil || project.ContainerID == nil {
		return nil, domain.ErrNotFound("project not found or container not running")
	}

	// Whitelist allowed subcommands for security
	allowed := map[string]bool{
		// Core
		"models":   true,
		"agents":   true,
		"session":  true,
		"sessions": true,
		"config":   true,
		"status":   true,
		"auth":     true,
		"help":     true,
		"version":  true,
		"skills":   true,
		"cron":     true,
		// Channels & Messaging
		"channels": true,
		"message":  true,
		"pairing":  true,
		// Diagnostics
		"doctor": true,
		"health": true,
		"logs":   true,
		// Memory & Data
		"memory": true,
		// Extensions
		"hooks":   true,
		"plugins": true,
		// Security
		"security": true,
		// System
		"system": true,
		"nodes":  true,
	}
	if len(args) == 0 || !allowed[args[0]] {
		return nil, domain.ErrBadRequest("command not allowed or empty")
	}

	// SEC-1 FIX: Sanitize all arguments against shell metacharacters
	for _, arg := range args {
		if containsShellMeta(arg) {
			return nil, domain.ErrBadRequest("argument contains disallowed characters")
		}
	}

	// Prepend "openclaw"
	fullCmd := append([]string{"openclaw"}, args...)

	output, err := s.container.ExecCommand(ctx, *project.ContainerID, fullCmd)
	if err != nil {
		// SEC-3 FIX: Sanitize error before returning to client
		return nil, domain.ErrInternal("command failed", fmt.Errorf("%s", sanitizeError(err.Error())))
	}

	// Try to parse as JSON if it looks like one
	output = strings.TrimSpace(output)
	jsonStr := extractJSON(output)
	if jsonStr != "" {
		var jsonResult interface{}
		if json.Unmarshal([]byte(jsonStr), &jsonResult) == nil {
			return jsonResult, nil
		}
	}

	// Return as raw string
	return output, nil
}

// UpdateRepo updates the git repo linked to the project (placeholder)
func (s *ProjectService) UpdateRepo(ctx context.Context, id, userID, repoURL, webhookSecret string) error {
	return s.repo.UpdateRepo(ctx, id, repoURL, webhookSecret)
}

// OAuthGetURL starts an OAuth login flow and captures the authorization URL.
// Runs with a short timeout since the CLI prints the URL then blocks waiting for callback.
func (s *ProjectService) OAuthGetURL(ctx context.Context, projectID, userID, provider string) (string, error) {
	project, err := s.repo.FindByID(ctx, projectID, userID)
	if err != nil {
		return "", domain.ErrNotFound("project not found")
	}
	if project.ContainerID == nil || *project.ContainerID == "" {
		return "", domain.ErrBadRequest("project container not running")
	}

	cmd := []string{"openclaw", "models", "auth", "login", "--provider", provider, "--no-browser"}
	output, err := s.container.ExecCommandWithTimeout(ctx, *project.ContainerID, cmd, 10*time.Second)
	if output != "" {
		return output, nil
	}
	if err != nil {
		return "", domain.ErrInternal("failed to start OAuth", fmt.Errorf("%s", sanitizeError(err.Error())))
	}
	return output, nil
}

// OAuthSubmitCallback completes an OAuth flow by submitting the callback URL to the CLI.
// The CLI reads the callback URL from stdin to exchange the authorization code for tokens.
func (s *ProjectService) OAuthSubmitCallback(ctx context.Context, projectID, userID, provider, callbackURL string) (string, error) {
	project, err := s.repo.FindByID(ctx, projectID, userID)
	if err != nil {
		return "", domain.ErrNotFound("project not found")
	}
	if project.ContainerID == nil || *project.ContainerID == "" {
		return "", domain.ErrBadRequest("project container not running")
	}

	cmd := []string{"openclaw", "models", "auth", "login", "--provider", provider, "--no-browser"}
	output, err := s.container.ExecCommandWithStdinAndOutput(ctx, *project.ContainerID, cmd, callbackURL)
	if err != nil {
		return "", domain.ErrInternal("OAuth callback failed", fmt.Errorf("%s", sanitizeError(err.Error())))
	}
	return output, nil
}

// Delete removes a project.
func (s *ProjectService) Delete(ctx context.Context, id, userID string) error {
	project, _ := s.repo.FindByID(ctx, id, userID)
	if project != nil && project.ContainerID != nil {
		_ = s.container.Remove(ctx, *project.ContainerID)
	}
	return s.repo.Delete(ctx, id)
}

// buildEnvVars constructs the environment variables for the container.
// We stripped out auto-provisioning logic to ensure a clean start.
// User must configure Agent/Channels via GUI/CLI.
func (s *ProjectService) buildEnvVars(projectID string) []string {
	return []string{
		"NODE_ENV=production",
		"OPENCLAW_GATEWAY_PORT=18789",
		"OPENCLAW_GATEWAY_AUTH_MODE=token",
		"OPENCLAW_GATEWAY_TOKEN=" + projectID,
		"OPENCLAW_GATEWAY_BIND=auto", // Fix gVisor networking
	}
}

func maskSecret(s string) string {
	if len(s) < 8 {
		return "********"
	}
	return s[:4] + "..." + s[len(s)-4:]
}

func formatValidationErrors(err error) string {
	return err.Error()
}

// deepCopyMap creates a deep copy of a map[string]interface{} to avoid mutating the original.
func deepCopyMap(m map[string]interface{}) map[string]interface{} {
	b, _ := json.Marshal(m)
	var result map[string]interface{}
	_ = json.Unmarshal(b, &result)
	return result
}

// extractJSON finds and returns the first valid JSON object or array substring.
// Handles CLI output that has banner text before/after the JSON.
func extractJSON(s string) string {
	// Try to find { or [ start
	for i, ch := range s {
		if ch == '{' || ch == '[' {
			closing := byte('}')
			if ch == '[' {
				closing = ']'
			}
			// Find matching closing bracket, counting nesting
			depth := 0
			for j := i; j < len(s); j++ {
				if s[j] == byte(ch) {
					depth++
				} else if s[j] == closing {
					depth--
					if depth == 0 {
						return s[i : j+1]
					}
				}
			}
		}
	}
	return ""
}

// containsShellMeta returns true if the string contains shell metacharacters
// that could lead to command injection.
func containsShellMeta(s string) bool {
	dangerous := []string{";", "|", "&", "`", "$", "(", ")", "{", "}", "<", ">", "\n", "\r", "\\"}
	for _, d := range dangerous {
		if strings.Contains(s, d) {
			return true
		}
	}
	return false
}

// sanitizeError removes potential secrets (API keys, tokens) from error messages
// before returning them to the client.
func sanitizeError(msg string) string {
	// Redact anything that looks like an API key pattern
	// Common patterns: sk-..., key-..., token=..., --key ...value
	lines := strings.Split(msg, "\n")
	for i, line := range lines {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "key") || strings.Contains(lower, "token") || strings.Contains(lower, "secret") {
			// Keep the line but redact the value portion
			if idx := strings.Index(line, "sk-"); idx != -1 {
				lines[i] = line[:idx] + "sk-[REDACTED]"
			}
		}
	}
	return strings.Join(lines, "\n")
}
