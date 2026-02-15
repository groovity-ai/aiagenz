package domain

import (
	"time"

	"github.com/google/uuid"
)

// Project represents a deployed AI agent project.
type Project struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	Name          string    `json:"name"`
	Type          string    `json:"type"`
	Plan          string    `json:"plan"`
	Status        string    `json:"status"`
	ContainerID   *string   `json:"containerId,omitempty"`
	ContainerName *string   `json:"containerName,omitempty"`
	RepoURL       *string   `json:"repoUrl,omitempty"`
	WebhookSecret *string   `json:"webhookSecret,omitempty"`
	Config        []byte    `json:"-"` // encrypted
	CreatedAt     time.Time `json:"createdAt"`
}

// ProjectConfig holds sensitive configuration for a project.
type ProjectConfig struct {
	TelegramToken string `json:"telegramToken,omitempty"`
	APIKey        string `json:"apiKey,omitempty"`
	Provider      string `json:"provider,omitempty"`
	Model         string `json:"model,omitempty"`
}

// SafeProjectConfig returns masked config for API responses.
type SafeProjectConfig struct {
	TelegramToken string `json:"telegramToken,omitempty"`
	APIKey        string `json:"apiKey,omitempty"`
	Provider      string `json:"provider,omitempty"`
	Model         string `json:"model,omitempty"`
}

// ProjectResponse is the API response for a project.
type ProjectResponse struct {
	ID            string             `json:"id"`
	UserID        string             `json:"userId"`
	Name          string             `json:"name"`
	Type          string             `json:"type"`
	Plan          string             `json:"plan"`
	Status        string             `json:"status"`
	ContainerID   *string            `json:"containerId,omitempty"`
	ContainerName *string            `json:"containerName,omitempty"`
	RepoURL       *string            `json:"repoUrl,omitempty"`
	WebhookSecret *string            `json:"webhookSecret,omitempty"`
	Config        *SafeProjectConfig `json:"config,omitempty"`
	CreatedAt     time.Time          `json:"createdAt"`
}

// CreateProjectRequest is the validated input for creating a project.
type CreateProjectRequest struct {
	Name          string `json:"name" validate:"required,min=1,max=100"`
	Type          string `json:"type" validate:"required,oneof=starter custom marketplace"`
	Plan          string `json:"plan" validate:"required,oneof=starter pro business"`
	TelegramToken string `json:"telegramToken" validate:"required"`
	APIKey        string `json:"apiKey"`
	Provider      string `json:"provider" validate:"omitempty,oneof=google openai anthropic google-antigravity"`
	Model         string `json:"model"`
}

// ControlAction represents a container control action.
type ControlAction struct {
	Action string `json:"action" validate:"required,oneof=start stop restart"`
}

// UpdateProjectRequest is the validated input for updating a project config.
type UpdateProjectRequest struct {
	Name          string `json:"name"`
	TelegramToken string `json:"telegramToken"`
	APIKey        string `json:"apiKey"`
	Provider      string `json:"provider"`
	Model         string `json:"model"`
}

// LoginRequest is the validated input for logging in.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=1"`
}

// LoginResponse is the API response after successful login.
type LoginResponse struct {
	Token string    `json:"token"`
	User  LoginUser `json:"user"`
}

// LoginUser is the user info returned after login.
type LoginUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// JWTClaims represents the JWT payload.
type JWTClaims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// --- User Domain ---

// User represents a registered user.
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Password  string    `json:"-"` // bcrypt hash, never serialized
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// CreateUserRequest is the validated input for creating a user.
type CreateUserRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
	Role     string `json:"role" validate:"omitempty,oneof=user admin"`
}

// UserResponse is the safe API response for a user (no password).
type UserResponse struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
}

// NewUserID generates a new UUID for a user.
func NewUserID() string {
	return uuid.New().String()
}

