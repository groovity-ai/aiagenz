package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/repository"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// AuthService handles authentication, JWT, and user management.
type AuthService struct {
	jwtSecret     string
	adminEmail    string
	adminPassword string
	userRepo      *repository.UserRepository
}

// NewAuthService creates a new AuthService.
func NewAuthService(jwtSecret, adminEmail, adminPassword string, userRepo *repository.UserRepository) *AuthService {
	return &AuthService{
		jwtSecret:     jwtSecret,
		adminEmail:    adminEmail,
		adminPassword: adminPassword,
		userRepo:      userRepo,
	}
}

// SeedAdmin creates the default admin user if it doesn't exist.
func (s *AuthService) SeedAdmin(ctx context.Context) error {
	exists, err := s.userRepo.Exists(ctx, s.adminEmail)
	if err != nil {
		return fmt.Errorf("failed to check admin existence: %w", err)
	}
	if exists {
		log.Printf("✅ Admin user already exists (%s)", s.adminEmail)
		return nil
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(s.adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash admin password: %w", err)
	}

	now := time.Now()
	admin := &domain.User{
		ID:        domain.NewUserID(),
		Email:     s.adminEmail,
		Password:  string(hashedPassword),
		Role:      "admin",
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.userRepo.Create(ctx, admin); err != nil {
		return fmt.Errorf("failed to create admin user: %w", err)
	}

	log.Printf("✅ Admin user created (%s)", s.adminEmail)
	return nil
}

// Login validates credentials against the database and returns a JWT token.
func (s *AuthService) Login(ctx context.Context, email, password string) (*domain.LoginResponse, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, domain.ErrInternal("failed to find user", err)
	}
	if user == nil {
		return nil, domain.ErrUnauthorized("invalid credentials")
	}

	// Compare bcrypt hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return nil, domain.ErrUnauthorized("invalid credentials")
	}

	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"role":  user.Role,
		"exp":   time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat":   time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return nil, domain.ErrInternal("failed to sign token", err)
	}

	return &domain.LoginResponse{
		Token: signed,
		User: domain.LoginUser{
			ID:    user.ID,
			Email: user.Email,
		},
	}, nil
}

// VerifyToken validates a JWT token and returns the claims.
func (s *AuthService) VerifyToken(tokenStr string) (*domain.JWTClaims, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return nil, domain.ErrUnauthorized("invalid or expired token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, domain.ErrUnauthorized("invalid token claims")
	}

	return &domain.JWTClaims{
		Sub:   getClaimString(claims, "sub"),
		Email: getClaimString(claims, "email"),
		Role:  getClaimString(claims, "role"),
	}, nil
}

func getClaimString(claims jwt.MapClaims, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

// ListUsers returns all users (admin only).
func (s *AuthService) ListUsers(ctx context.Context) ([]*domain.UserResponse, error) {
	users, err := s.userRepo.ListAll(ctx)
	if err != nil {
		return nil, domain.ErrInternal("failed to list users", err)
	}

	responses := make([]*domain.UserResponse, len(users))
	for i, u := range users {
		responses[i] = &domain.UserResponse{
			ID:        u.ID,
			Email:     u.Email,
			Role:      u.Role,
			CreatedAt: u.CreatedAt,
		}
	}
	return responses, nil
}

// CreateUser creates a new user with bcrypt password (admin only).
func (s *AuthService) CreateUser(ctx context.Context, req *domain.CreateUserRequest) (*domain.UserResponse, error) {
	exists, err := s.userRepo.Exists(ctx, req.Email)
	if err != nil {
		return nil, domain.ErrInternal("failed to check user", err)
	}
	if exists {
		return nil, domain.ErrBadRequest("email already registered")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, domain.ErrInternal("failed to hash password", err)
	}

	role := req.Role
	if role == "" {
		role = "user"
	}

	now := time.Now()
	user := &domain.User{
		ID:        domain.NewUserID(),
		Email:     req.Email,
		Password:  string(hashedPassword),
		Role:      role,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, domain.ErrInternal("failed to create user", err)
	}

	return &domain.UserResponse{
		ID:        user.ID,
		Email:     user.Email,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}

// DeleteUser removes a user by ID (admin only).
func (s *AuthService) DeleteUser(ctx context.Context, id string) error {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return domain.ErrInternal("failed to find user", err)
	}
	if user == nil {
		return domain.ErrNotFound("user not found")
	}
	if user.Role == "admin" {
		return domain.ErrBadRequest("cannot delete admin user")
	}

	if err := s.userRepo.Delete(ctx, id); err != nil {
		return domain.ErrInternal("failed to delete user", err)
	}
	return nil
}

// GetUserByID returns a user profile by ID (for /api/auth/me).
func (s *AuthService) GetUserByID(ctx context.Context, id string) (*domain.UserResponse, error) {
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, domain.ErrInternal("failed to find user", err)
	}
	if user == nil {
		return nil, domain.ErrNotFound("user not found")
	}
	return &domain.UserResponse{
		ID:        user.ID,
		Email:     user.Email,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}
