package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
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

	// Determine image from project type (not fragile name matching)
	image := "aiagenz-agent:latest"
	if req.Type == "marketplace" {
		image = "sahabatcuan:latest"
	}

	// Build env vars for the container (no secrets — those are pushed via Bridge)
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
		ImageName:     image,
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
		MemoryMB: plan.MemoryMB,
		CPU:      plan.CPU,
	}
	volumeName := fmt.Sprintf("aiagenz-data-%s", projectID)

	// Create container
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

	// Post-start (ASYNC): wait for bridge, fix perms, inject auth, push config
	// We run this in background so the API returns "provisioning" status immediately.
	go func() {
		// Use a detached context for background work
		bgCtx := context.Background()

		profiles := initialAuth["profiles"].(map[string]interface{})
		s.postStartSetup(bgCtx, containerID, containerName, profiles)

		// Push sensitive config via Bridge (fast path if Bridge is reachable)
		if req.TelegramToken != "" || req.Model != "" {
			configPayload := map[string]interface{}{}
			if req.TelegramToken != "" {
				configPayload["channels"] = map[string]interface{}{
					"telegram": map[string]interface{}{
						"enabled": true,
						"accounts": map[string]interface{}{
							"default": map[string]interface{}{
								"botToken": req.TelegramToken,
							},
						},
					},
				}
			}
			if req.Model != "" {
				configPayload["agents"] = map[string]interface{}{
					"defaults": map[string]interface{}{
						"model": map[string]interface{}{
							"primary": req.Model,
						},
					},
				}
			}
			log.Printf("[INFO] Pushing initial config via Bridge for %s...", containerName)
			if _, err := s.CallBridge(bgCtx, containerID, "POST", "/config/update", configPayload, nil); err != nil {
				log.Printf("[WARN] Bridge config push failed for %s: %v — config already in env vars", containerName, err)
			}
		}

		// Update status to running
		log.Printf("[INFO] Project %s provisioned successfully. Setting status to running.", projectID)
		_ = s.repo.UpdateStatus(bgCtx, projectID, "running", &containerID)
	}()

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
		log.Printf("[INFO] Syncing config for project %s (Token: %s)", project.Name, maskSecret(currentConfig.TelegramToken))

		// Fetch current runtime config
		runtimeConfig, err := s.GetRuntimeConfig(ctx, id, userID)
		if err == nil {
			// Update values in runtime config based on the new DB config
			// 1. Telegram Token
			if currentConfig.TelegramToken != "" {
				log.Printf("[INFO] Applying Telegram Token to Runtime Config")
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
				log.Printf("[WARN] Failed to sync config to container after update: %v", err)
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
	ttydPort := ""
	if project.ContainerID != nil {
		info, _ := s.container.Inspect(ctx, *project.ContainerID)
		if info != nil {
			status = info.Status
			ttydPort = info.TtydPort
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
		ImageName:     project.ImageName,
		RepoURL:       project.RepoURL,
		WebhookSecret: project.WebhookSecret,
		TtydPort:      ttydPort,
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
		// Auto-Provisioning: If no container ID, create one.
		if project.ContainerID == nil || *project.ContainerID == "" {
			log.Printf("[INFO] Start requested but container missing. Provisioning new container for project %s...", id)
			return s.reprovisionContainer(ctx, project)
		}

		err = s.container.Start(ctx, *project.ContainerID)
		if err != nil {
			// Auto-Recovery: If container ID exists but Docker says missing -> Provision new
			if strings.Contains(err.Error(), "No such container") {
				log.Printf("[WARN] Container %s missing in Docker. Provisioning new container...", *project.ContainerID)
				return s.reprovisionContainer(ctx, project)
			}
			return domain.ErrInternal("failed to start container", err)
		}
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
// Includes retry logic with backoff for non-command endpoints.
// Uses host-mapped port (bypasses gVisor) when available, falls back to container IP.
func (s *ProjectService) CallBridge(ctx context.Context, containerID, method, endpoint string, body interface{}, headers map[string]string) ([]byte, error) {
	info, err := s.container.Inspect(ctx, containerID)
	if err != nil || info.Status != "running" {
		return nil, fmt.Errorf("container not running")
	}

	// Prefer container IP (Direct Docker Network) because backend runs inside Docker.
	// Host-mapped port (127.0.0.1) only works if backend runs on Host (local dev).
	var url string
	if info.IP != "" {
		url = fmt.Sprintf("http://%s:4444%s", info.IP, endpoint)
	} else if info.BridgePort != "" {
		url = fmt.Sprintf("http://127.0.0.1:%s%s", info.BridgePort, endpoint)
	} else {
		return nil, fmt.Errorf("no bridge IP or port available")
	}

	timeout := 15 * time.Second
	if endpoint == "/command" {
		timeout = 60 * time.Second
	}

	// Retry config: 3 attempts for non-command endpoints, 1 for /command
	maxAttempts := 3
	if endpoint == "/command" {
		maxAttempts = 1
	}

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt) * time.Second
			log.Printf("[INFO] Bridge retry %d/%d for %s %s (backoff %v)", attempt+1, maxAttempts, method, endpoint, backoff)
			time.Sleep(backoff)
		}

		// 1. Try Direct HTTP (Fast Path)
		var bodyReader io.Reader
		if body != nil {
			jsonBytes, _ := json.Marshal(body)
			bodyReader = bytes.NewBuffer(jsonBytes)
		}

		req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			if method == "POST" {
				req.Header.Set("x-reload", "true")
			}

			// Set custom headers
			if headers != nil {
				for k, v := range headers {
					req.Header.Set(k, v)
				}
			}

			client := &http.Client{Timeout: timeout}
			resp, err := client.Do(req)
			if err == nil {
				respBody, _ := io.ReadAll(resp.Body)
				resp.Body.Close()

				if resp.StatusCode < 500 {
					if resp.StatusCode >= 400 {
						return nil, fmt.Errorf("bridge error %d: %s", resp.StatusCode, string(respBody))
					}
					return respBody, nil
				}
				lastErr = fmt.Errorf("bridge error %d: %s", resp.StatusCode, string(respBody))
			} else {
				lastErr = fmt.Errorf("bridge request failed: %w", err)
			}
		} else {
			lastErr = err
		}
	}

	// 2. Fallback: Local Exec via 'curl' (Robust Path for gVisor/Network Isolation)
	// If direct HTTP fails (e.g. due to gVisor blocking container-to-container IP or Host Loopback),
	// we execute 'curl' INSIDE the container to hit its own 127.0.0.1 loopback.
	log.Printf("[INFO] Bridge HTTP failed (%v), falling back to local exec curl...", lastErr)

	curlCmd := []string{"curl", "-s", "-X", method}
	curlCmd = append(curlCmd, "-H", "Content-Type: application/json")
	if method == "POST" {
		curlCmd = append(curlCmd, "-H", "x-reload: true")
	}
	if body != nil {
		jsonBytes, _ := json.Marshal(body)
		curlCmd = append(curlCmd, "-d", string(jsonBytes))
	}
	// Always use internal loopback for exec
	curlCmd = append(curlCmd, fmt.Sprintf("http://127.0.0.1:4444%s", endpoint))

	output, execErr := s.container.ExecCommand(ctx, containerID, curlCmd)
	if execErr != nil {
		return nil, fmt.Errorf("bridge exec failed: %w (http err: %v)", execErr, lastErr)
	}

	return []byte(output), nil
}

// GetBridgeStatus queries the bridge /status endpoint.
func (s *ProjectService) GetBridgeStatus(ctx context.Context, containerID string) map[string]interface{} {
	resp, err := s.CallBridge(ctx, containerID, "GET", "/status", nil, nil)
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
	if err != nil || project == nil {
		return nil, domain.ErrNotFound("project not found")
	}

	var config map[string]interface{}

	// 1. Try to fetch from Container (if exists)
	if project.ContainerID != nil {
		// A. Try Bridge API (Fast Path)
		resp, err := s.CallBridge(ctx, *project.ContainerID, "GET", "/config", nil, nil)
		if err == nil {
			if json.Unmarshal(resp, &config) == nil {
				return config, nil
			}
		}

		// B. Fallback: Read config file via exec
		output, err := s.container.ExecCommand(ctx, *project.ContainerID, []string{"cat", "/home/node/.openclaw/openclaw.json"})
		if err == nil {
			// Parse JSON if read succeeded
			if err := json.Unmarshal([]byte(output), &config); err != nil {
				log.Printf("[WARN] Failed to parse config JSON from container %s (using empty default): %v", id, err)
				config = map[string]interface{}{}
			}
		} else {
			log.Printf("[WARN] Failed to read config from container %s (using empty default): %v", id, err)
			config = map[string]interface{}{}
		}
	} else {
		// Container doesn't exist, start with empty config to trigger reconstruction from DB
		config = map[string]interface{}{}
	}

	// 2. FAIL-SAFE RECONSTRUCTION: If file was missing (config is empty), reconstruct from DB
	if len(config) == 0 {
		log.Printf("[INFO] Runtime config empty/missing. Reconstructing STANDARD config from DB for project %s", id)

		// Decrypt DB config
		var dbConfig domain.ProjectConfig
		if project.Config != nil {
			decrypted, err := s.enc.Decrypt(string(project.Config))
			if err == nil {
				_ = json.Unmarshal(decrypted, &dbConfig)
			}
		}

		// 1. Base Standard Config (Mirrors OpenClaw Defaults)
		config = map[string]interface{}{
			"meta": map[string]interface{}{
				"lastTouchedVersion": "2026.2.14",
				"lastTouchedAt":      time.Now().Format(time.RFC3339),
			},
			"gateway": map[string]interface{}{
				"port": 18789,
				"mode": "local",
				"bind": "auto",
				"auth": map[string]interface{}{
					"mode":  "token",
					"token": project.ID, // Use Project ID as Gateway Token
				},
			},
			"agents": map[string]interface{}{
				"defaults": map[string]interface{}{
					"model": map[string]interface{}{
						"primary": "google/gemini-3-flash-preview", // Default fallback
					},
					"workspace": "/app/workspace",
				},
			},
			"plugins": map[string]interface{}{
				"entries": map[string]interface{}{
					"aiagenz-bridge": map[string]interface{}{"enabled": true}, // CRITICAL
					"telegram":       map[string]interface{}{"enabled": true},
				},
			},
			"channels": map[string]interface{}{},
			"auth": map[string]interface{}{
				"profiles": map[string]interface{}{},
			},
		}

		// 2. Inject Model
		if dbConfig.Model != "" {
			if agents, ok := config["agents"].(map[string]interface{}); ok {
				if defaults, ok := agents["defaults"].(map[string]interface{}); ok {
					if model, ok := defaults["model"].(map[string]interface{}); ok {
						model["primary"] = dbConfig.Model
					}
				}
			}
		}

		// 3. Inject Telegram
		if dbConfig.TelegramToken != "" {
			config["channels"] = map[string]interface{}{
				"telegram": map[string]interface{}{
					"enabled": true,
					"accounts": map[string]interface{}{
						"default": map[string]interface{}{
							"enabled":     true,
							"botToken":    dbConfig.TelegramToken,
							"groupPolicy": "allowlist",
							"allowFrom":   []string{"*"},
						},
					},
				},
			}
		}

		// 4. Inject API Key (Auth Profile)
		if dbConfig.Provider != "" && dbConfig.APIKey != "" {
			auth, _ := config["auth"].(map[string]interface{})
			if auth["profiles"] == nil {
				auth["profiles"] = map[string]interface{}{}
			}
			profiles, _ := auth["profiles"].(map[string]interface{})

			profileKey := dbConfig.Provider + ":default"
			// Only inject if not exists (preserve user edits if any)
			if profiles[profileKey] == nil {
				profiles[profileKey] = map[string]interface{}{
					"type":     "api_key",
					"provider": dbConfig.Provider,
					"key":      dbConfig.APIKey,
				}
			}
		}

		// 5. Inject Basic Agent Models Map (Standard Aliases)
		if config["agents"] != nil {
			agents, _ := config["agents"].(map[string]interface{})
			if agents["models"] == nil {
				agents["models"] = map[string]interface{}{
					"google/gemini-3-flash-preview": map[string]interface{}{"alias": "gemini-flash"},
					"google/gemini-3-pro-preview":   map[string]interface{}{"alias": "gemini"},
					"openai/gpt-4o":                 map[string]interface{}{"alias": "gpt4o"},
					"openai/gpt-4o-mini":            map[string]interface{}{"alias": "gpt4o-mini"},
					"anthropic/claude-3-5-sonnet":   map[string]interface{}{"alias": "claude"},
				}
			}
		}
	}

	// 3. MERGE AUTH PROFILES & STATS FROM AGENT STORE (only if container exists)
	if project.ContainerID != nil {
		storeOutput, err := s.container.ExecCommand(ctx, *project.ContainerID, []string{"cat", "/home/node/.openclaw/agents/main/agent/auth-profiles.json"})
		if err == nil {
			var store map[string]interface{}
			if json.Unmarshal([]byte(storeOutput), &store) == nil {
				if profiles, ok := store["profiles"].(map[string]interface{}); ok {
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
				if stats, ok := store["usageStats"]; ok {
					if authObj, ok := config["auth"].(map[string]interface{}); ok {
						authObj["usageStats"] = stats
					}
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

	// Validate config before processing
	if err := validateConfigUpdate(newConfig); err != nil {
		return domain.ErrBadRequest(fmt.Sprintf("invalid config: %v", err))
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

	headers := map[string]string{"x-strategy": "restart"} // Default strategy
	_, err = s.CallBridge(ctx, *project.ContainerID, "POST", "/config/update", bridgePayload, headers)
	if err == nil {
		s.syncTokenToDB(ctx, project, newConfig)
		return nil
	}

	// 2. Fallback: Direct File Write + Restart (Safer/Faster than Recreate)
	log.Printf("[WARN] Bridge update failed for %s, falling back to file write + restart: %v", id, err)

	// Prepare config for openclaw.json
	fullConfigJSON, _ := json.MarshalIndent(configCopy, "", "  ")

	// Write file directly
	if copyErr := s.container.CopyToContainer(ctx, *project.ContainerID, "/home/node/.openclaw/openclaw.json", fullConfigJSON); copyErr != nil {
		return domain.ErrInternal("failed to write config file", copyErr)
	}

	// Note: We skip explicit chown here because ExecAsRoot fails on stopped containers.
	// The container entrypoint.sh handles 'chown -R node:node' on startup anyway.

	// Restart container to pick up changes
	if restartErr := s.container.Restart(ctx, *project.ContainerID); restartErr != nil {
		return domain.ErrInternal("failed to restart container", restartErr)
	}

	// Update DB Status
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
	resp, err := s.CallBridge(ctx, *project.ContainerID, "POST", "/command", bridgePayload, nil)
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

// OAuthGetURL starts an OAuth flow. Tries Bridge first, falls back to docker exec.
func (s *ProjectService) OAuthGetURL(ctx context.Context, projectID, userID, provider string) (string, error) {
	project, err := s.repo.FindByID(ctx, projectID, userID)
	if err != nil {
		return "", domain.ErrNotFound("project not found")
	}
	if project.ContainerID == nil || *project.ContainerID == "" {
		return "", domain.ErrBadRequest("project container not running")
	}

	// Try Bridge first
	resp, err := s.CallBridge(ctx, *project.ContainerID, "POST", "/auth/login", map[string]interface{}{
		"provider": provider,
	}, nil)
	if err == nil {
		return string(resp), nil
	}
	log.Printf("[INFO] Bridge OAuth unavailable, falling back to docker exec: %v", err)

	// Fallback: docker exec
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

	// Try Bridge first
	resp, err := s.CallBridge(ctx, *project.ContainerID, "POST", "/auth/callback", map[string]interface{}{
		"provider":    provider,
		"callbackUrl": callbackURL,
	}, nil)
	if err == nil {
		return string(resp), nil
	}
	log.Printf("[INFO] Bridge OAuth callback unavailable, falling back to docker exec: %v", err)

	// Fallback: docker exec
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
	return s.repo.Delete(ctx, id, userID)
}

// reprovisionContainer creates a fresh container for an existing project.
func (s *ProjectService) reprovisionContainer(ctx context.Context, project *domain.Project) error {
	// 1. Decrypt Config to rebuild Env Vars
	var currentConfig domain.ProjectConfig
	if project.Config != nil {
		decrypted, err := s.enc.Decrypt(string(project.Config))
		if err == nil {
			_ = json.Unmarshal(decrypted, &currentConfig)
		}
	}

	// 2. Build Env Vars
	createReq := &domain.CreateProjectRequest{
		TelegramToken: currentConfig.TelegramToken,
		Provider:      currentConfig.Provider,
		APIKey:        currentConfig.APIKey,
		Model:         currentConfig.Model,
	}
	env := s.buildEnvVars(project.ID, createReq)

	// 3. Prepare Image & Resources
	image := project.ImageName
	if image == "" {
		image = "aiagenz-agent:latest"
	}
	plan := domain.GetPlan(project.Plan)
	resources := ContainerResources{MemoryMB: plan.MemoryMB, CPU: plan.CPU}
	volumeName := fmt.Sprintf("aiagenz-data-%s", project.ID)
	containerName := fmt.Sprintf("aiagenz-%s", project.ID)

	// 4. Create Container
	// Handle zombie/conflict first
	// Force remove by name (ignoring error if not exists)
	// Note: s.container.Remove takes ID, but Docker API allows Name.
	_ = s.container.Stop(ctx, containerName)
	_ = s.container.Remove(ctx, containerName)

	containerID, err := s.container.Create(ctx, containerName, image, env, resources, volumeName)
	if err != nil {
		return domain.ErrInternal("failed to recreate container", err)
	}

	// 5. Start Container
	if err := s.container.Start(ctx, containerID); err != nil {
		return domain.ErrInternal("failed to start new container", err)
	}

	// 6. Post-Start Setup
	// Build auth profiles map for injection
	profiles := make(map[string]interface{})
	if currentConfig.Provider != "" && currentConfig.APIKey != "" {
		profileKey := currentConfig.Provider + ":default"
		profiles[profileKey] = map[string]interface{}{
			"provider": currentConfig.Provider,
			"mode":     "api_key",
			"key":      currentConfig.APIKey,
		}
	}

	go func() {
		bgCtx := context.Background()
		s.postStartSetup(bgCtx, containerID, containerName, profiles)
	}()

	// 7. Update DB
	project.ContainerID = &containerID
	project.Status = "running"
	return s.repo.UpdateStatus(ctx, project.ID, "running", &containerID)
}

func (s *ProjectService) buildEnvVars(projectID string, req *domain.CreateProjectRequest) []string {
	// Env vars are the PRIMARY config injection path (works even when Bridge is unreachable).
	// Bridge is used as a BONUS fast-path for runtime updates when networking allows.
	env := []string{
		"NODE_ENV=production",
		"OPENCLAW_GATEWAY_PORT=18789",
		"OPENCLAW_GATEWAY_AUTH_MODE=token",
		"OPENCLAW_GATEWAY_TOKEN=" + projectID,
		"OPENCLAW_GATEWAY_BIND=auto",
		// Give each agent a unique name for Bonjour/mDNS discovery (prevents hostname conflicts)
		"OPENCLAW_GATEWAY_NAME=aiagenz-" + projectID[:8],
		"OPENCLAW_DOCTOR=false",
		"OPENCLAW_SKIP_DOCTOR=true",
	}
	if req != nil && req.TelegramToken != "" {
		env = append(env, fmt.Sprintf("OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN=%s", req.TelegramToken))
	}
	if req != nil && req.Model != "" {
		env = append(env, fmt.Sprintf("OPENCLAW_AGENTS_DEFAULTS_MODEL_PRIMARY=%s", req.Model))
	}
	if req != nil && req.APIKey != "" {
		env = append(env, fmt.Sprintf("OPENCLAW_AGENTS_DEFAULTS_API_KEY=%s", req.APIKey))
	}
	if req != nil && req.Provider != "" {
		env = append(env, fmt.Sprintf("OPENCLAW_AGENTS_DEFAULTS_PROVIDER=%s", req.Provider))
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

// deepMergeMap recursively merges src into dst (src wins on conflicts).
func deepMergeMap(dst, src map[string]interface{}) map[string]interface{} {
	result := deepCopyMap(dst)
	for k, v := range src {
		if srcMap, ok := v.(map[string]interface{}); ok {
			if dstMap, ok := result[k].(map[string]interface{}); ok {
				result[k] = deepMergeMap(dstMap, srcMap)
				continue
			}
		}
		result[k] = v
	}
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

	var provider, apiKey string
	if auth, ok := runtimeConfig["auth"].(map[string]interface{}); ok {
		if profiles, ok := auth["profiles"].(map[string]interface{}); ok {
			// Find first available profile (Simple sync for now)
			// TODO: Support multiple profiles in DB structure
			for _, v := range profiles {
				if prof, ok := v.(map[string]interface{}); ok {
					if p, ok := prof["provider"].(string); ok {
						provider = p
					}
					if k, ok := prof["key"].(string); ok {
						apiKey = k
					}
					// Break after finding one (Primary)
					if provider != "" && apiKey != "" {
						break
					}
				}
			}
		}
	}

	// Update DB if any value found
	var dbConfig domain.ProjectConfig
	if project.Config != nil {
		decrypted, err := s.enc.Decrypt(string(project.Config))
		if err == nil {
			_ = json.Unmarshal(decrypted, &dbConfig)
		}
	}

	changed := false
	if telegramToken != "" {
		dbConfig.TelegramToken = telegramToken
		changed = true
	}
	if provider != "" {
		dbConfig.Provider = provider
		changed = true
	}
	if apiKey != "" {
		dbConfig.APIKey = apiKey
		changed = true
	}

	if changed {
		configJSON, _ := json.Marshal(dbConfig)
		encryptedConfig, err := s.enc.Encrypt(configJSON)
		if err == nil {
			project.Config = []byte(encryptedConfig)
			_ = s.repo.Update(ctx, project)
		}
	}
}

// waitForBridge polls the Bridge /status endpoint until ready or timeout.
// Uses adaptive backoff: 200ms initial, increasing to 2s.
func (s *ProjectService) waitForBridge(ctx context.Context, containerID, containerName string, maxWait time.Duration) bool {
	log.Printf("[INFO] Waiting for bridge on %s (max %v)...", containerName, maxWait)
	deadline := time.Now().Add(maxWait)

	delay := 200 * time.Millisecond
	for time.Now().Before(deadline) {
		_, err := s.CallBridge(ctx, containerID, "GET", "/status", nil, nil)
		if err == nil {
			log.Printf("[INFO] Bridge ready on %s", containerName)
			return true
		}

		time.Sleep(delay)
		if delay < 2*time.Second {
			delay *= 2
		}
	}

	log.Printf("[WARN] Bridge not ready on %s after %v", containerName, maxWait)
	return false
}

// postStartSetup consolidates the post-start sequence used by both Create and UpdateRuntimeConfig fallback:
// 1. Wait for container to stabilize
// 2. Fix permissions
// 3. Inject auth profiles
// 4. Wait for Bridge readiness
func (s *ProjectService) postStartSetup(ctx context.Context, containerID, containerName string, profiles map[string]interface{}) {
	// 1. Wait for container to stabilize
	log.Printf("[INFO] Post-start setup for %s...", containerName)
	for i := 0; i < 10; i++ {
		time.Sleep(2 * time.Second)
		info, err := s.container.Inspect(ctx, containerID)
		if err == nil && info.Status == "running" {
			break
		}
	}

	// 2. Fix permissions
	_ = s.container.ExecAsRoot(ctx, containerID, []string{"chown", "-R", "node:node", "/home/node/.openclaw", "/tmp"})

	// 3. Inject auth-profiles.json
	if len(profiles) > 0 {
		initialAuth := map[string]interface{}{
			"version":  1,
			"profiles": profiles,
		}
		authPath := "/home/node/.openclaw/agents/main/agent"
		if err := s.container.ExecAsRoot(ctx, containerID, []string{"mkdir", "-p", authPath}); err == nil {
			authStoreBytes, _ := json.MarshalIndent(initialAuth, "", "  ")
			_ = s.container.CopyToContainer(ctx, containerID, authPath+"/auth-profiles.json", authStoreBytes)
			_ = s.container.ExecAsRoot(ctx, containerID, []string{"chown", "-R", "node:node", authPath})
		}
	}

	// 4. Wait for Bridge readiness (polls /status, max 90s for slow startups)
	s.waitForBridge(ctx, containerID, containerName, 90*time.Second)
}

// validateConfigUpdate performs basic sanity checks on config updates.
func validateConfigUpdate(config map[string]interface{}) error {
	// Validate telegram token format if present
	if channels, ok := config["channels"].(map[string]interface{}); ok {
		if telegram, ok := channels["telegram"].(map[string]interface{}); ok {
			if accounts, ok := telegram["accounts"].(map[string]interface{}); ok {
				if def, ok := accounts["default"].(map[string]interface{}); ok {
					if token, ok := def["botToken"].(string); ok && len(token) > 0 && len(token) < 10 {
						return fmt.Errorf("telegram token too short (min 10 chars)")
					}
				}
			}
		}
	}

	// Validate provider names
	validProviders := map[string]bool{
		"openai": true, "anthropic": true, "google": true, "google-antigravity": true,
		"groq": true, "deepseek": true, "openrouter": true, "xai": true,
		"together": true, "ollama": true, "mistral": true, "cohere": true,
		"fireworks": true,
	}
	if auth, ok := config["auth"].(map[string]interface{}); ok {
		if profs, ok := auth["profiles"].(map[string]interface{}); ok {
			for _, v := range profs {
				if prof, ok := v.(map[string]interface{}); ok {
					if provider, ok := prof["provider"].(string); ok {
						if !validProviders[strings.ToLower(provider)] {
							return fmt.Errorf("unknown provider: %s", provider)
						}
					}
				}
			}
		}
	}

	return nil
}
