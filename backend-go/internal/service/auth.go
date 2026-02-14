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
