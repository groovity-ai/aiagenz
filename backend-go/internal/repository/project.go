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
		INSERT INTO projects (id, user_id, name, type, plan, status, container_id, container_name, config, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	var configStr *string
	if p.Config != nil {
		s := string(p.Config)
		configStr = &s
	}

	_, err := r.db.Exec(ctx, query,
		p.ID, p.UserID, p.Name, p.Type, p.Plan, p.Status,
		p.ContainerID, p.ContainerName, configStr, p.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create project: %w", err)
	}
	return nil
}

// FindByID returns a project by ID and user ID (ownership check).
func (r *ProjectRepository) FindByID(ctx context.Context, id, userID string) (*domain.Project, error) {
	query := `
		SELECT id, user_id, name, type, plan, status, container_id, container_name, config, created_at
		FROM projects WHERE id = $1 AND user_id = $2
	`
	return r.scanOne(ctx, query, id, userID)
}

// FindAllByUser returns all projects for a user, ordered by creation date.
func (r *ProjectRepository) FindAllByUser(ctx context.Context, userID string) ([]*domain.Project, error) {
	query := `
		SELECT id, user_id, name, type, plan, status, container_id, container_name, config, created_at
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

// Delete removes a project from the database.
func (r *ProjectRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM projects WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete project: %w", err)
	}
	return nil
}

// FindByIDOnly returns a project by ID without user check (for WebSocket).
func (r *ProjectRepository) FindByIDOnly(ctx context.Context, id string) (*domain.Project, error) {
	query := `
		SELECT id, user_id, name, type, plan, status, container_id, container_name, config, created_at
		FROM projects WHERE id = $1
	`
	return r.scanOne(ctx, query, id)
}

func (r *ProjectRepository) scanOne(ctx context.Context, query string, args ...interface{}) (*domain.Project, error) {
	row := r.db.QueryRow(ctx, query, args...)
	var p domain.Project
	var configStr *string

	err := row.Scan(
		&p.ID, &p.UserID, &p.Name, &p.Type, &p.Plan, &p.Status,
		&p.ContainerID, &p.ContainerName, &configStr, &p.CreatedAt,
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
		&p.ContainerID, &p.ContainerName, &configStr, &p.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to scan project row: %w", err)
	}

	if configStr != nil {
		p.Config = []byte(*configStr)
	}
	return &p, nil
}
