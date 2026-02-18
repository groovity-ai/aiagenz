package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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

	// Determine image (Use Custom Image by default)
	image := "aiagenz-agent:latest"
	if strings.Contains(strings.ToLower(req.Name), "sahabatcuan") || req.Type == "marketplace" {
		image = "sahabatcuan:latest"
	}

	// Build env vars for the container (Clean Start - No Auto Provisioning)
	env := s.buildEnvVars(projectID, req)

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

	// Create and start Docker container with plan-based resources and persistent volume
	plan := domain.GetPlan(req.Plan)
	resources := ContainerResources{
		MemoryMB: 2048, // Bump to 2GB for OpenClaw stability
		CPU:      plan.CPU,
	}
	volumeName := fmt.Sprintf("aiagenz-data-%s", projectID)

	// Create container using standard signature
	containerID, err := s.container.Create(ctx, containerName, image, env, resources, volumeName)
	if err != nil {
		_ = s.repo.UpdateStatus(ctx, projectID, "failed", nil)
		return nil, domain.ErrInternal("failed to create container", err)
	}

	// Prepare Initial Auth Profiles (API Key)
	initialAuth := map[string]interface{}{
		"version":  1,
		"profiles": map[string]interface{}{},
	}
	if req.Provider != "" && req.APIKey != "" {
		profileKey := req.Provider + ":default"
		initialAuth["profiles"].(map[string]interface{})[profileKey] = map[string]interface{}{
			"provider": req.Provider,
			"mode":     "api_key",
			"key":      req.APIKey,
		}
	}

	// NOTE: We do NOT inject openclaw.json manually anymore.
	// The container entrypoint generates it from Env Vars we provided.
	// This ensures consistency and prevents Doctor resets.

	// Start container
	if err := s.container.Start(ctx, containerID); err != nil {
		_ = s.repo.UpdateStatus(ctx, projectID, "failed", &containerID)
		return nil, domain.ErrInternal("failed to start container", err)
	}

	// Wait for container to be ready and stable
	fmt.Printf("⏳ Waiting for container %s to stabilize...\n", containerName)
	for i := 0; i < 10; i++ {
		time.Sleep(2 * time.Second)
		info, err := s.container.Inspect(ctx, containerID)
		if err == nil && info.Status == "running" {
			time.Sleep(1 * time.Second)
			break
		}
	}

	// FIX: Fix permissions so 'node' user can read/write state dir and /tmp (jiti cache)
	_ = s.container.ExecAsRoot(ctx, containerID, []string{"chown", "-R", "node:node", "/home/node/.openclaw", "/tmp"})

	// Inject auth-profiles.json (Env Vars can't express generic auth profiles)
	// Bridge plugin is already baked into the image via Dockerfile.
	authPath := "/home/node/.openclaw/agents/main/agent"
	if err := s.container.ExecAsRoot(ctx, containerID, []string{"mkdir", "-p", authPath}); err == nil {
		authStoreBytes, _ := json.MarshalIndent(initialAuth, "", "  ")
		_ = s.container.CopyToContainer(ctx, containerID, authPath+"/auth-profiles.json", authStoreBytes)
		_ = s.container.ExecAsRoot(ctx, containerID, []string{"chown", "-R", "node:node", authPath})
	}

	// Reload config via Bridge SIGHUP (faster than full container restart)
	// Wait briefly for bridge plugin to be ready after container start
	time.Sleep(3 * time.Second)
	if _, err := s.CallBridge(ctx, containerID, "POST", "/config/update", map[string]interface{}{}); err != nil {
		fmt.Printf("⚠️ Bridge reload failed, auth profiles may need manual restart: %v\n", err)
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

	// FIX: Sync changes to running container immediately
	if project.Status == "running" && project.ContainerID != nil {
		fmt.Printf("🔄 Syncing config for project %s (Token: %s)\n", project.Name, maskSecret(currentConfig.TelegramToken))

		// Fetch current runtime config
		runtimeConfig, err := s.GetRuntimeConfig(ctx, id, userID)
		if err == nil {
			// Update values in runtime config based on the new DB config
			// 1. Telegram Token
			if currentConfig.TelegramToken != "" {
				fmt.Println("✅ Applying Telegram Token to Runtime Config")
				if runtimeConfig["channels"] == nil {
					runtimeConfig["channels"] = make(map[string]interface{})
				}
				channels, ok := runtimeConfig["channels"].(map[string]interface{})
				if !ok {
					channels = make(map[string]interface{})
					runtimeConfig["channels"] = channels
				}

				if channels["telegram"] == nil {
					channels["telegram"] = make(map[string]interface{})
				}
				telegram, ok := channels["telegram"].(map[string]interface{})
				if !ok {
					telegram = make(map[string]interface{})
					channels["telegram"] = telegram
				}
				telegram["enabled"] = true

				if telegram["accounts"] == nil {
					telegram["accounts"] = make(map[string]interface{})
				}
				accounts, ok := telegram["accounts"].(map[string]interface{})
				if !ok {
					accounts = make(map[string]interface{})
					telegram["accounts"] = accounts
				}

				if accounts["default"] == nil {
					accounts["default"] = make(map[string]interface{})
				}
				def, ok := accounts["default"].(map[string]interface{})
				if !ok {
					def = make(map[string]interface{})
					accounts["default"] = def
				}

				// Set botToken
				def["botToken"] = currentConfig.TelegramToken
			}

			// 2. API Key / Provider (Update Auth Profiles)
			if currentConfig.APIKey != "" && currentConfig.Provider != "" {
				if runtimeConfig["auth"] == nil {
					runtimeConfig["auth"] = make(map[string]interface{})
				}
				auth, ok := runtimeConfig["auth"].(map[string]interface{})
				if !ok {
					auth = make(map[string]interface{})
					runtimeConfig["auth"] = auth
				}

				if auth["profiles"] == nil {
					auth["profiles"] = make(map[string]interface{})
				}
				profiles, ok := auth["profiles"].(map[string]interface{})
				if !ok {
					profiles = make(map[string]interface{})
					auth["profiles"] = profiles
				}

				// Standard profile key format: provider:default
				profileKey := currentConfig.Provider + ":default"
				profiles[profileKey] = map[string]interface{}{
					"provider": currentConfig.Provider,
					"mode":     "api_key",
					"key":      currentConfig.APIKey,
				}
			}

			// Apply update to container
			if err := s.UpdateRuntimeConfig(ctx, id, userID, runtimeConfig); err != nil {
				fmt.Printf("⚠️ Failed to sync config to container after update: %v\n", err)
			}
		}
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
		return domain.ErrNotFound("project not found or container not running")
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

// CallBridge executes an HTTP request to the container's internal bridge plugin.
func (s *ProjectService) CallBridge(ctx context.Context, containerID, method, endpoint string, body interface{}) ([]byte, error) {
	info, err := s.container.Inspect(ctx, containerID)
	if err != nil || info.Status != "running" || info.IP == "" {
		return nil, fmt.Errorf("container not running or ip missing")
	}

	url := fmt.Sprintf("http://%s:4444%s", info.IP, endpoint)

	var bodyReader io.Reader
	if body != nil {
		jsonBytes, _ := json.Marshal(body)
		bodyReader = bytes.NewBuffer(jsonBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if method == "POST" {
		req.Header.Set("x-reload", "true")
	}

	timeout := 5 * time.Second
	if endpoint == "/command" {
		timeout = 30 * time.Second
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bridge request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("bridge error %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// GetBridgeStatus queries the bridge /status endpoint.
func (s *ProjectService) GetBridgeStatus(ctx context.Context, containerID string) map[string]interface{} {
	resp, err := s.CallBridge(ctx, containerID, "GET", "/status", nil)
	if err != nil {
		return nil
	}
	var result map[string]interface{}
	if json.Unmarshal(resp, &result) != nil {
		return nil
	}
	return result
}

func (s *ProjectService) GetRuntimeConfig(ctx context.Context, id, userID string) (map[string]interface{}, error) {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil || project == nil || project.ContainerID == nil {
		return nil, domain.ErrNotFound("project not found or container not running")
	}

	// 1. Try Bridge API (Fast Path)
	resp, err := s.CallBridge(ctx, *project.ContainerID, "GET", "/config", nil)
	if err == nil {
		var config map[string]interface{}
		if json.Unmarshal(resp, &config) == nil {
			return config, nil
		}
	}

	// 2. Fallback: Read config file (Slow/Robust Path)
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

// UpdateRuntimeConfig updates config via Bridge API (with fallback to CopyToContainer).
func (s *ProjectService) UpdateRuntimeConfig(ctx context.Context, id, userID string, newConfig map[string]interface{}) error {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil || project == nil || project.ContainerID == nil {
		return domain.ErrNotFound("project not found or container not running")
	}

	configCopy := deepCopyMap(newConfig)
	var profiles map[string]interface{}
	if auth, ok := configCopy["auth"].(map[string]interface{}); ok {
		if p, ok := auth["profiles"].(map[string]interface{}); ok {
			profiles = p
			delete(auth, "profiles")
		}
		delete(auth, "usageStats")
	}

	// 1. Try Bridge API (Fast Path)
	bridgePayload := deepCopyMap(configCopy)
	if profiles != nil {
		if bridgePayload["auth"] == nil {
			bridgePayload["auth"] = map[string]interface{}{}
		}
		auth := bridgePayload["auth"].(map[string]interface{})
		auth["profiles"] = profiles
	}

	_, err = s.CallBridge(ctx, *project.ContainerID, "POST", "/config/update", bridgePayload)
	if err == nil {
		s.syncTokenToDB(ctx, project, newConfig)
		return nil
	}

	// 2. Fallback: Recreate Container (nuclear option when bridge is unreachable)
	fmt.Printf("⚠️ Bridge update failed for %s, falling back to container recreate: %v\n", id, err)

	// Extract ALL config values for env vars (not just token)
	var telegramToken, provider, apiKey, model string
	if channels, ok := configCopy["channels"].(map[string]interface{}); ok {
		if telegram, ok := channels["telegram"].(map[string]interface{}); ok {
			if accounts, ok := telegram["accounts"].(map[string]interface{}); ok {
				if def, ok := accounts["default"].(map[string]interface{}); ok {
					if val, ok := def["botToken"].(string); ok {
						telegramToken = val
					}
				}
			}
		}
	}
	if auth, ok := newConfig["auth"].(map[string]interface{}); ok {
		if profs, ok := auth["profiles"].(map[string]interface{}); ok {
			for _, v := range profs {
				if prof, ok := v.(map[string]interface{}); ok {
					if p, ok := prof["provider"].(string); ok && provider == "" {
						provider = p
					}
					if k, ok := prof["key"].(string); ok && apiKey == "" {
						apiKey = k
					}
				}
			}
		}
	}
	if agents, ok := configCopy["agents"].(map[string]interface{}); ok {
		if defaults, ok := agents["defaults"].(map[string]interface{}); ok {
			if m, ok := defaults["model"].(map[string]interface{}); ok {
				if primary, ok := m["primary"].(string); ok {
					model = primary
				}
			}
		}
	}

	// Build complete env vars with all extracted config
	createReq := &domain.CreateProjectRequest{
		TelegramToken: telegramToken,
		Provider:      provider,
		APIKey:        apiKey,
		Model:         model,
	}
	newEnv := s.buildEnvVars(project.ID, createReq)

	// Derive image from project type (not fragile name matching)
	image := "aiagenz-agent:latest"
	if project.Type == "marketplace" {
		image = "sahabatcuan:latest"
	}

	// Destroy old container
	if err := s.container.Remove(ctx, *project.ContainerID); err != nil {
		fmt.Printf("⚠️ Failed to remove old container: %v\n", err)
	}

	// Create new container
	containerName := fmt.Sprintf("aiagenz-%s", project.ID)
	plan := domain.GetPlan(project.Plan)
	resources := ContainerResources{MemoryMB: 2048, CPU: plan.CPU}
	volumeName := fmt.Sprintf("aiagenz-data-%s", project.ID)

	newContainerID, err := s.container.Create(ctx, containerName, image, newEnv, resources, volumeName)
	if err != nil {
		return domain.ErrInternal("failed to recreate container", err)
	}

	// Start container
	if err := s.container.Start(ctx, newContainerID); err != nil {
		return domain.ErrInternal("failed to start new container", err)
	}

	// Wait for container to stabilize (same pattern as Create flow)
	for i := 0; i < 10; i++ {
		time.Sleep(2 * time.Second)
		info, inspErr := s.container.Inspect(ctx, newContainerID)
		if inspErr == nil && info.Status == "running" {
			time.Sleep(1 * time.Second)
			break
		}
	}

	// Fix permissions
	_ = s.container.ExecAsRoot(ctx, newContainerID, []string{"chown", "-R", "node:node", "/home/node/.openclaw", "/tmp"})

	// Inject auth-profiles.json (bridge plugin is baked into image)
	if profiles != nil {
		initialAuth := map[string]interface{}{
			"version":  1,
			"profiles": profiles,
		}
		authPath := "/home/node/.openclaw/agents/main/agent"
		if err := s.container.ExecAsRoot(ctx, newContainerID, []string{"mkdir", "-p", authPath}); err == nil {
			authStoreBytes, _ := json.MarshalIndent(initialAuth, "", "  ")
			_ = s.container.CopyToContainer(ctx, newContainerID, authPath+"/auth-profiles.json", authStoreBytes)
			_ = s.container.ExecAsRoot(ctx, newContainerID, []string{"chown", "-R", "node:node", authPath})
		}
	}

	// Reload via Bridge SIGHUP (wait for bridge to be ready)
	time.Sleep(3 * time.Second)
	if _, bridgeErr := s.CallBridge(ctx, newContainerID, "POST", "/config/update", map[string]interface{}{}); bridgeErr != nil {
		fmt.Printf("⚠️ Bridge reload failed on recreated container: %v\n", bridgeErr)
	}

	// Update DB
	project.ContainerID = &newContainerID
	project.Status = "running"
	_ = s.repo.UpdateStatus(ctx, project.ID, "running", &newContainerID)
	s.syncTokenToDB(ctx, project, newConfig)

	return nil
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

	for _, arg := range args {
		if containsShellMeta(arg) {
			return nil, domain.ErrBadRequest("argument contains disallowed characters")
		}
	}

	// 1. Try Bridge API
	bridgePayload := map[string]interface{}{
		"args": args,
	}
	resp, err := s.CallBridge(ctx, *project.ContainerID, "POST", "/command", bridgePayload)
	if err == nil {
		var bridgeResp struct {
			Ok     bool        `json:"ok"`
			Data   interface{} `json:"data"`
			Error  string      `json:"error"`
			Stdout string      `json:"stdout"`
			Stderr string      `json:"stderr"`
		}
		if json.Unmarshal(resp, &bridgeResp) == nil {
			if bridgeResp.Ok {
				return bridgeResp.Data, nil
			}
			errMsg := bridgeResp.Error
			if bridgeResp.Stderr != "" {
				errMsg += ": " + bridgeResp.Stderr
			}
			return nil, domain.ErrInternal("cli execution failed", fmt.Errorf("%s", sanitizeError(errMsg)))
		}
	}

	// 2. Fallback: Docker Exec
	fullCmd := append([]string{"openclaw"}, args...)
	output, err := s.container.ExecCommand(ctx, *project.ContainerID, fullCmd)
	if err != nil {
		return nil, domain.ErrInternal("command failed", fmt.Errorf("%s", sanitizeError(err.Error())))
	}

	output = strings.TrimSpace(output)
	jsonStr := extractJSON(output)
	if jsonStr != "" {
		var jsonResult interface{}
		if json.Unmarshal([]byte(jsonStr), &jsonResult) == nil {
			return jsonResult, nil
		}
	}

	return output, nil
}

// UpdateRepo updates the git repo linked to the project (placeholder)
func (s *ProjectService) UpdateRepo(ctx context.Context, id, userID, repoURL, webhookSecret string) error {
	return s.repo.UpdateRepo(ctx, id, repoURL, webhookSecret)
}

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

func (s *ProjectService) Delete(ctx context.Context, id, userID string) error {
	project, _ := s.repo.FindByID(ctx, id, userID)
	if project != nil && project.ContainerID != nil {
		_ = s.container.Remove(ctx, *project.ContainerID)
	}
	return s.repo.Delete(ctx, id)
}

func (s *ProjectService) buildEnvVars(projectID string, req *domain.CreateProjectRequest) []string {
	env := []string{
		"NODE_ENV=production",
		"OPENCLAW_GATEWAY_PORT=18789",
		"OPENCLAW_GATEWAY_AUTH_MODE=token",
		"OPENCLAW_GATEWAY_TOKEN=" + projectID,
		"OPENCLAW_GATEWAY_BIND=auto",
		"OPENCLAW_DOCTOR=false",
		"OPENCLAW_SKIP_DOCTOR=true",
	}
	if req != nil && req.TelegramToken != "" {
		env = append(env, fmt.Sprintf("OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN=%s", req.TelegramToken))
	}
	if req != nil && req.Model != "" {
		env = append(env, fmt.Sprintf("OPENCLAW_AGENTS_DEFAULTS_MODEL_PRIMARY=%s", req.Model))
	}
	return env
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

func deepCopyMap(m map[string]interface{}) map[string]interface{} {
	b, _ := json.Marshal(m)
	var result map[string]interface{}
	_ = json.Unmarshal(b, &result)
	return result
}

func extractJSON(s string) string {
	for i, ch := range s {
		if ch == '{' || ch == '[' {
			closing := byte('}')
			if ch == '[' {
				closing = ']'
			}
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

func containsShellMeta(s string) bool {
	dangerous := []string{";", "|", "&", "`", "$", "(", ")", "{", "}", "<", ">", "\n", "\r", "\\"}
	for _, d := range dangerous {
		if strings.Contains(s, d) {
			return true
		}
	}
	return false
}

func sanitizeError(msg string) string {
	lines := strings.Split(msg, "\n")
	for i, line := range lines {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "key") || strings.Contains(lower, "token") || strings.Contains(lower, "secret") {
			if idx := strings.Index(line, "sk-"); idx != -1 {
				lines[i] = line[:idx] + "sk-[REDACTED]"
			}
		}
	}
	return strings.Join(lines, "\n")
}

func (s *ProjectService) syncTokenToDB(ctx context.Context, project *domain.Project, runtimeConfig map[string]interface{}) {
	var telegramToken string
	if channels, ok := runtimeConfig["channels"].(map[string]interface{}); ok {
		if telegram, ok := channels["telegram"].(map[string]interface{}); ok {
			if accounts, ok := telegram["accounts"].(map[string]interface{}); ok {
				if def, ok := accounts["default"].(map[string]interface{}); ok {
					if val, ok := def["botToken"].(string); ok {
						telegramToken = val
					}
				}
			}
		}
	}
	if telegramToken == "" {
		return
	}

	var dbConfig domain.ProjectConfig
	if project.Config != nil {
		decrypted, err := s.enc.Decrypt(string(project.Config))
		if err == nil {
			_ = json.Unmarshal(decrypted, &dbConfig)
		}
	}
	dbConfig.TelegramToken = telegramToken
	configJSON, _ := json.Marshal(dbConfig)
	encryptedConfig, err := s.enc.Encrypt(configJSON)
	if err == nil {
		project.Config = []byte(encryptedConfig)
		_ = s.repo.Update(ctx, project)
	}
}
