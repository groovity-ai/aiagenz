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

	// Build env vars for the container
	env := []string{
		fmt.Sprintf("TELEGRAM_BOT_TOKEN=%s", req.TelegramToken),
		fmt.Sprintf("GEMINI_API_KEY=%s", req.APIKey),
		fmt.Sprintf("PROJECT_ID=%s", projectID),
		"OPENCLAW_CONFIG_PATH=/app/config/openclaw.json",
	}

	// Encrypt config before storing
	configJSON, _ := json.Marshal(domain.ProjectConfig{
		TelegramToken: req.TelegramToken,
		APIKey:        req.APIKey,
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
		MemoryMB: plan.MemoryMB,
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

// List returns all projects for a user with live Docker status.
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

// GetByID returns a single project with masked config.
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

	// Decrypt and mask config
	if project.Config != nil {
		decrypted, err := s.enc.Decrypt(string(project.Config))
		if err == nil {
			var cfg domain.ProjectConfig
			if json.Unmarshal(decrypted, &cfg) == nil {
				resp.Config = &domain.SafeProjectConfig{
					TelegramToken: maskSecret(cfg.TelegramToken),
					APIKey:        maskSecret(cfg.APIKey),
				}
			}
		}
	}

	return resp, nil
}

// Control performs start/stop/restart on a project container.
func (s *ProjectService) Control(ctx context.Context, id, userID string, action *domain.ControlAction) error {
	if err := s.validate.Struct(action); err != nil {
		return domain.ErrValidation(formatValidationErrors(err))
	}

	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil {
		return domain.ErrInternal("failed to get project", err)
	}
	if project == nil || project.ContainerID == nil {
		return domain.ErrNotFound("project not found or no container")
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
		return domain.ErrInternal("failed to "+action.Action+" container", err)
	}

	newStatus := "running"
	if action.Action == "stop" {
		newStatus = "exited"
	}
	_ = s.repo.UpdateStatus(ctx, id, newStatus, project.ContainerID)

	return nil
}

// UpdateRepo updates the GitHub repository details for a project.
func (s *ProjectService) UpdateRepo(ctx context.Context, id, userID, repoURL, webhookSecret string) error {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil {
		return domain.ErrInternal("failed to get project", err)
	}
	if project == nil {
		return domain.ErrNotFound("project not found")
	}

	if err := s.repo.UpdateRepo(ctx, id, repoURL, webhookSecret); err != nil {
		return domain.ErrInternal("failed to update repo", err)
	}

	return nil
}

// Delete destroys a project and its container.
func (s *ProjectService) Delete(ctx context.Context, id, userID string) error {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil {
		return domain.ErrInternal("failed to get project", err)
	}
	if project == nil {
		return domain.ErrNotFound("project not found")
	}

	if project.ContainerID != nil {
		_ = s.container.Remove(ctx, *project.ContainerID)
	}

	if err := s.repo.Delete(ctx, id); err != nil {
		return domain.ErrInternal("failed to delete project", err)
	}
	return nil
}

// Logs returns the last N lines of container logs.
func (s *ProjectService) Logs(ctx context.Context, id, userID string) (string, error) {
	project, err := s.repo.FindByID(ctx, id, userID)
	if err != nil {
		return "", domain.ErrInternal("failed to get project", err)
	}
	if project == nil || project.ContainerID == nil {
		return "", domain.ErrNotFound("project not found or no container")
	}

	logs, err := s.container.Logs(ctx, *project.ContainerID, 100)
	if err != nil {
		return "", domain.ErrInternal("failed to get logs", err)
	}
	return logs, nil
}

// maskSecret masks a secret string for API responses.
func maskSecret(s string) string {
	if s == "" {
		return ""
	}
	return "******"
}

// formatValidationErrors converts validation errors to a readable string.
func formatValidationErrors(err error) string {
	if validationErrors, ok := err.(validator.ValidationErrors); ok {
		messages := make([]string, 0, len(validationErrors))
		for _, e := range validationErrors {
			messages = append(messages, fmt.Sprintf("'%s' failed on '%s'", e.Field(), e.Tag()))
		}
		return fmt.Sprintf("validation failed: %s", strings.Join(messages, ", "))
	}
	return err.Error()
}
