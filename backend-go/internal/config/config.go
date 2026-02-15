package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	Port          int
	JWTSecret     string
	DatabaseURL   string
	EncryptionKey string
	CORSOrigins   []string
	AdminEmail    string
	AdminPassword string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	port, _ := strconv.Atoi(getEnv("PORT", "4001"))

	jwtSecret := getEnv("JWT_SECRET", "")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	dbURL := getEnv("DATABASE_URL", "")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	encKey := getEnv("ENCRYPTION_KEY", "")
	if encKey == "" {
		return nil, fmt.Errorf("ENCRYPTION_KEY is required (must be exactly 32 bytes)")
	}
	if len(encKey) != 32 {
		return nil, fmt.Errorf("ENCRYPTION_KEY must be exactly 32 bytes, got %d", len(encKey))
	}

	origins := strings.Split(getEnv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3010,https://aiagenz.cloud"), ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}

	return &Config{
		Port:          port,
		JWTSecret:     jwtSecret,
		DatabaseURL:   dbURL,
		EncryptionKey: encKey,
		CORSOrigins:   origins,
		AdminEmail:    getEnv("ADMIN_EMAIL", "admin@aiagenz.id"),
		AdminPassword: getEnv("ADMIN_PASSWORD", "admin123"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
