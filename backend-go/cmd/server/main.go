package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aiagenz/backend/internal/config"
	"github.com/aiagenz/backend/internal/handler"
	"github.com/aiagenz/backend/internal/middleware"
	"github.com/aiagenz/backend/internal/repository"
	"github.com/aiagenz/backend/internal/service"
	"github.com/aiagenz/backend/internal/ws"
	"github.com/aiagenz/backend/pkg/crypto"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

func main() {
	// Load .env file if present (for local development)
	loadDotEnv()

	// Load config
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("❌ Config error: %v", err)
	}

	ctx := context.Background()

	// Initialize database
	db, err := repository.NewDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("❌ Database error: %v", err)
	}
	defer db.Close()

	// Run migrations
	if err := repository.RunMigrations(ctx, db); err != nil {
		log.Fatalf("❌ Migration error: %v", err)
	}
	log.Println("✅ Database connected & migrated")

	// Initialize encryptor
	enc, err := crypto.NewEncryptor(cfg.EncryptionKey)
	if err != nil {
		log.Fatalf("❌ Encryption error: %v", err)
	}

	// Initialize services
	containerSvc, err := service.NewContainerService()
	if err != nil {
		log.Printf("⚠️  Docker not available: %v (container operations will fail)", err)
		// Don't fatal — allow running without Docker for development
		containerSvc = nil
	} else {
		defer containerSvc.Close()
		log.Println("✅ Docker connected")
	}

	authSvc := service.NewAuthService(cfg.JWTSecret, cfg.AdminEmail, cfg.AdminPassword, repository.NewUserRepository(db))

	// Seed admin user on first startup
	if err := authSvc.SeedAdmin(ctx); err != nil {
		log.Fatalf("❌ Admin seed error: %v", err)
	}

	projectRepo := repository.NewProjectRepository(db)
	projectSvc := service.NewProjectService(projectRepo, containerSvc, enc)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(authSvc)
	projectHandler := handler.NewProjectHandler(projectSvc)
	healthHandler := handler.NewHealthHandler(db, containerSvc)
	consoleHandler := ws.NewConsoleHandler(projectRepo, containerSvc, authSvc)

	// Build router
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.Recovery)
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Global rate limiter (20 req/sec per IP, burst of 40)
	globalRL := middleware.NewRateLimiter(20, 40)
	r.Use(globalRL.Middleware())

	// Health check (no auth)
	r.Get("/health", healthHandler.Check)

	// Auth routes (no auth middleware, but strict rate limit)
	r.Group(func(r chi.Router) {
		r.Use(middleware.StrictRateLimiter())
		r.Post("/api/auth/login", authHandler.Login)
	})

	// Protected API routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(authSvc))

		r.Get("/api/projects", projectHandler.List)
		r.Post("/api/projects", projectHandler.Create)
		r.Get("/api/projects/{id}", projectHandler.GetByID)
		r.Post("/api/projects/{id}/control", projectHandler.Control)
		r.Delete("/api/projects/{id}", projectHandler.Delete)
		r.Get("/api/projects/{id}/logs", projectHandler.Logs)
	})

	// WebSocket console (auth via query param)
	r.HandleFunc("/projects/{projectId}/console", consoleHandler.Handle)

	// Start server
	addr := fmt.Sprintf("0.0.0.0:%d", cfg.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		log.Println("🛑 Shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("🚀 AiAgenz Backend (Go) listening at http://%s", addr)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("❌ Server error: %v", err)
	}
}

// loadDotEnv reads a .env file if it exists (simple implementation).
func loadDotEnv() {
	data, err := os.ReadFile(".env")
	if err != nil {
		return // .env file is optional
	}
	for _, line := range splitLines(string(data)) {
		line = trimString(line)
		if line == "" || line[0] == '#' {
			continue
		}
		parts := splitFirst(line, "=")
		if len(parts) == 2 {
			key := trimString(parts[0])
			value := trimString(parts[1])
			if os.Getenv(key) == "" { // don't override existing env vars
				os.Setenv(key, value)
			}
		}
	}
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func trimString(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}

func splitFirst(s, sep string) []string {
	i := 0
	for i < len(s) {
		if i+len(sep) <= len(s) && s[i:i+len(sep)] == sep {
			return []string{s[:i], s[i+len(sep):]}
		}
		i++
	}
	return []string{s}
}
