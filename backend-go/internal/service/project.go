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

	// Build env vars for the container (ENV Config Mode - Patched)
	env := s.buildEnvVars(projectID, req.TelegramToken, req.APIKey, req.Provider, req.Model)

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
	needsRedeploy := false
	if req.Name != "" {
		project.Name = req.Name
	}
	if req.TelegramToken != "" && req.TelegramToken != currentConfig.TelegramToken {
		currentConfig.TelegramToken = req.TelegramToken
		needsRedeploy = true
	}
	if req.APIKey != "" && req.APIKey != currentConfig.APIKey {
		currentConfig.APIKey = req.APIKey
		needsRedeploy = true
	}
	if req.Provider != "" && req.Provider != currentConfig.Provider {
		currentConfig.Provider = req.Provider
		needsRedeploy = true
	}
	if req.Model != "" && req.Model != currentConfig.Model {
		currentConfig.Model = req.Model
		needsRedeploy = true
	}

	// Re-encrypt config
	configJSON, _ := json.Marshal(currentConfig)
	encryptedConfig, err := s.enc.Encrypt(configJSON)
	if err != nil {
		return nil, domain.ErrInternal("failed to encrypt config", err)
	}
	project.Config = []byte(encryptedConfig)

	// Redeploy Container if config changed
	if needsRedeploy && project.ContainerID != nil {
		_ = s.container.Remove(ctx, *project.ContainerID)

		image := "openclaw-starter:latest"
		if strings.Contains(strings.ToLower(project.Name), "sahabatcuan") || project.Type == "marketplace" {
			image = "sahabatcuan:latest"
		}

		env := s.buildEnvVars(project.ID, currentConfig.TelegramToken, currentConfig.APIKey, currentConfig.Provider, currentConfig.Model)
		plan := domain.GetPlan(project.Plan)
		resources := ContainerResources{MemoryMB: 2048, CPU: plan.CPU}

		newContainerID, err := s.container.Create(ctx, *project.ContainerName, image, env, resources)
		if err != nil {
			return nil, domain.ErrInternal("failed to recreate container", err)
		}
		
		if err := s.container.Start(ctx, newContainerID); err != nil {
			return nil, domain.ErrInternal("failed to start new container", err)
		}
		
		project.ContainerID = &newContainerID
		_ = s.repo.UpdateStatus(ctx, project.ID, "running", &newContainerID)
	}

	return project, nil
}

func (s *ProjectService) buildEnvVars(projectID, telegramToken, apiKey, provider, model string) []string {
	env := []string{
		fmt.Sprintf("OPENCLAW_GATEWAY_TOKEN=%s", projectID),
		"OPENCLAW_GATEWAY_AUTH_MODE=token",
		"OPENCLAW_GATEWAY_BIND=auto",
		"OPENCLAW_GATEWAY_PORT=18789",
	}

	if telegramToken != "" {
		env = append(env,
			"OPENCLAW_CHANNELS_TELEGRAM_ENABLED=true",
			fmt.Sprintf("OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN=%s", telegramToken),
		)
	} else {
		// Explicitly disable Telegram if no token provided (override image defaults)
		env = append(env, 
			"OPENCLAW_CHANNELS_TELEGRAM_ENABLED=false",
			"OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN=", // Clear any default token
		)
	}

	if provider == "" { provider = "google" }
	if model == "" { model = "google/gemini-3-flash-preview" }

	// Ensure model has prefix
	if !strings.Contains(model, "/") {
		model = fmt.Sprintf("%s/%s", provider, model)
	}

	if provider == "google-antigravity" {
		env = append(env, "OPENCLAW_ANTIGRAVITY_EMAIL=mozitop99@gmail.com")
	} else if apiKey != "" {
		// Inject Auth Profiles as JSON (More reliable than flattened env vars)
		authJSON := fmt.Sprintf(`{"profiles":{"%s:default":{"type":"api_key","provider":"%s","key":"%s"}},"lastGood":{"%s":"%s:default"}}`, 
			provider, provider, apiKey, provider, provider)
		env = append(env, fmt.Sprintf("OPENCLAW_AUTH_PROFILES=%s", authJSON))
	}

	env = append(env, fmt.Sprintf("OPENCLAW_AGENTS_DEFAULTS_MODEL_PRIMARY=%s", model))
	
	// Brute force backup
	env = append(env, fmt.Sprintf("OPENCLAW_MODEL=%s", model))

	return env
}

// List returns all projects for a user.
func (s *ProjectService) List(ctx context.Context, userID string) ([]*domain.ProjectResponse, error) {
	projects, err := s.repo.FindAllByUser(ctx, userID)
	if err != nil {
		return nil, domain.ErrInternal("failed to list projects", err)
	}

	responses := make([]*domain.ProjectResponse, len(projects))
	for i, p := range projects {
		status := p.Status
		if p.ContainerID != nil {
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

	return responses, nil
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
	case "start": err = s.container.Start(ctx, *project.ContainerID)
	case "stop": err = s.container.Stop(ctx, *project.ContainerID)
	case "restart": err = s.container.Restart(ctx, *project.ContainerID)
	default: return domain.ErrBadRequest("invalid action")
	}

	if err != nil {
		return domain.ErrInternal("failed container action", err)
	}

	newStatus := "running"
	if action.Action == "stop" { newStatus = "exited" }
	_ = s.repo.UpdateStatus(ctx, id, newStatus, project.ContainerID)

	return nil
}

func (s *ProjectService) UpdateRepo(ctx context.Context, id, userID, repoURL, webhookSecret string) error {
	return s.repo.UpdateRepo(ctx, id, repoURL, webhookSecret)
}

func (s *ProjectService) Delete(ctx context.Context, id, userID string) error {
	project, _ := s.repo.FindByID(ctx, id, userID)
	if project != nil && project.ContainerID != nil {
		_ = s.container.Remove(ctx, *project.ContainerID)
	}
	return s.repo.Delete(ctx, id)
}

func (s *ProjectService) Logs(ctx context.Context, id, userID string) (string, error) {
	project, _ := s.repo.FindByID(ctx, id, userID)
	if project == nil || project.ContainerID == nil {
		return "", domain.ErrNotFound("project not found")
	}
	return s.container.Logs(ctx, *project.ContainerID, 100)
}

func maskSecret(s string) string {
	if s == "" { return "" }
	return "******"
}

func formatValidationErrors(err error) string {
	return err.Error()
}
