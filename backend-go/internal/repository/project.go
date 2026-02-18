package repository

import (
	"context"
	"fmt"

	"github.com/aiagenz/backend/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProjectRepository handles database operations for projects.
type ProjectRepository struct {
	db *pgxpool.Pool
}

// NewProjectRepository creates a new ProjectRepository.
func NewProjectRepository(db *pgxpool.Pool) *ProjectRepository {
	return &ProjectRepository{db: db}
}

// Create inserts a new project into the database.
func (r *ProjectRepository) Create(ctx context.Context, p *domain.Project) error {
	query := `
		INSERT INTO projects (id, user_id, name, type, plan, status, container_id, container_name, image_name, repo_url, webhook_secret, config, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	var configStr *string
	if p.Config != nil {
		s := string(p.Config)
		configStr = &s
	}

	_, err := r.db.Exec(ctx, query,
		p.ID, p.UserID, p.Name, p.Type, p.Plan, p.Status,
		p.ContainerID, p.ContainerName, p.ImageName, p.RepoURL, p.WebhookSecret, configStr, p.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create project: %w", err)
	}
	return nil
}

// FindByID returns a project by ID and user ID (ownership check).
func (r *ProjectRepository) FindByID(ctx context.Context, id, userID string) (*domain.Project, error) {
	query := `
		SELECT id, user_id, name, type, plan, status, container_id, container_name, image_name, repo_url, webhook_secret, config, created_at
		FROM projects WHERE id = $1 AND user_id = $2
	`
	return r.scanOne(ctx, query, id, userID)
}

// FindAllByUser returns all projects for a user, ordered by creation date.
func (r *ProjectRepository) FindAllByUser(ctx context.Context, userID string) ([]*domain.Project, error) {
	query := `
		SELECT id, user_id, name, type, plan, status, container_id, container_name, image_name, repo_url, webhook_secret, config, created_at
		FROM projects WHERE user_id = $1 ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query projects: %w", err)
	}
	defer rows.Close()

	var projects []*domain.Project
	for rows.Next() {
		p, err := r.scanRow(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}

	if projects == nil {
		projects = []*domain.Project{}
	}
	return projects, nil
}

// UpdateStatus updates the status and container ID of a project.
func (r *ProjectRepository) UpdateStatus(ctx context.Context, id, status string, containerID *string) error {
	query := `UPDATE projects SET status = $1, container_id = $2 WHERE id = $3`
	_, err := r.db.Exec(ctx, query, status, containerID, id)
	if err != nil {
		return fmt.Errorf("failed to update project status: %w", err)
	}
	return nil
}

// UpdateRepo updates the GitHub repository details for a project.
func (r *ProjectRepository) UpdateRepo(ctx context.Context, id, repoURL, webhookSecret string) error {
	query := `UPDATE projects SET repo_url = $1, webhook_secret = $2 WHERE id = $3`
	_, err := r.db.Exec(ctx, query, repoURL, webhookSecret, id)
	if err != nil {
		return fmt.Errorf("failed to update project repo: %w", err)
	}
	return nil
}

// Update updates general project details (name, config).
func (r *ProjectRepository) Update(ctx context.Context, p *domain.Project) error {
	query := `UPDATE projects SET name = $1, config = $2 WHERE id = $3`

	var configStr *string
	if p.Config != nil {
		s := string(p.Config)
		configStr = &s
	}

	_, err := r.db.Exec(ctx, query, p.Name, configStr, p.ID)
	if err != nil {
		return fmt.Errorf("failed to update project: %w", err)
	}
	return nil
}

// List returns paginated projects for a user.
func (r *ProjectRepository) List(ctx context.Context, userID string, page, limit int) ([]*domain.Project, int64, error) {
	offset := (page - 1) * limit

	// Get total count
	var total int64
	err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM projects WHERE user_id = $1", userID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count projects: %w", err)
	}

	// Get data
	query := `
		SELECT id, user_id, name, type, plan, status, container_id, container_name, image_name, repo_url, webhook_secret, config, created_at
		FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`
	rows, err := r.db.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query projects: %w", err)
	}
	defer rows.Close()

	var projects []*domain.Project
	for rows.Next() {
		p, err := r.scanRow(rows)
		if err != nil {
			return nil, 0, err
		}
		projects = append(projects, p)
	}

	if projects == nil {
		projects = []*domain.Project{}
	}
	return projects, total, nil
}

// Delete removes a project from the database.
func (r *ProjectRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM projects WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete project: %w", err)
	}
	return nil
}

// FindByIDOnly returns a project by ID without user check (for WebSocket/Webhook).
func (r *ProjectRepository) FindByIDOnly(ctx context.Context, id string) (*domain.Project, error) {
	query := `
		SELECT id, user_id, name, type, plan, status, container_id, container_name, image_name, repo_url, webhook_secret, config, created_at
		FROM projects WHERE id = $1
	`
	return r.scanOne(ctx, query, id)
}

// FindByWebhookSecret returns a project matching the webhook secret.
func (r *ProjectRepository) FindByWebhookSecret(ctx context.Context, secret string) (*domain.Project, error) {
	query := `
		SELECT id, user_id, name, type, plan, status, container_id, container_name, image_name, repo_url, webhook_secret, config, created_at
		FROM projects WHERE webhook_secret = $1 LIMIT 1
	`
	return r.scanOne(ctx, query, secret)
}

func (r *ProjectRepository) scanOne(ctx context.Context, query string, args ...interface{}) (*domain.Project, error) {
	row := r.db.QueryRow(ctx, query, args...)
	var p domain.Project
	var configStr *string

	err := row.Scan(
		&p.ID, &p.UserID, &p.Name, &p.Type, &p.Plan, &p.Status,
		&p.ContainerID, &p.ContainerName, &p.ImageName, &p.RepoURL, &p.WebhookSecret, &configStr, &p.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to scan project: %w", err)
	}

	if configStr != nil {
		p.Config = []byte(*configStr)
	}
	return &p, nil
}

func (r *ProjectRepository) scanRow(rows pgx.Rows) (*domain.Project, error) {
	var p domain.Project
	var configStr *string

	err := rows.Scan(
		&p.ID, &p.UserID, &p.Name, &p.Type, &p.Plan, &p.Status,
		&p.ContainerID, &p.ContainerName, &p.ImageName, &p.RepoURL, &p.WebhookSecret, &configStr, &p.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to scan project row: %w", err)
	}

	if configStr != nil {
		p.Config = []byte(*configStr)
	}
	return &p, nil
}
