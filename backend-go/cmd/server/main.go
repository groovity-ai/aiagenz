package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/aiagenz/backend/internal/config"
	"github.com/aiagenz/backend/internal/handler"
	appMiddleware "github.com/aiagenz/backend/internal/middleware"
	"github.com/aiagenz/backend/internal/repository"
	"github.com/aiagenz/backend/internal/service"
	"github.com/aiagenz/backend/internal/ws"
	"github.com/aiagenz/backend/pkg/crypto"
	"github.com/aiagenz/backend/pkg/payment"
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

	userRepo := repository.NewUserRepository(db)
	authSvc := service.NewAuthService(cfg.JWTSecret, cfg.AdminEmail, cfg.AdminPassword, userRepo)

	// Seed admin user on first startup
	if err := authSvc.SeedAdmin(ctx); err != nil {
		log.Fatalf("❌ Admin seed error: %v", err)
	}

	projectRepo := repository.NewProjectRepository(db)
	projectSvc := service.NewProjectService(projectRepo, containerSvc, enc)

	// Payment / Subscription
	mockPayment := payment.NewMockGateway()
	subRepo := repository.NewSubscriptionRepository(db)
	subSvc := service.NewSubscriptionService(subRepo, userRepo, mockPayment)

	// Start Monitoring Service
	if containerSvc != nil {
		monitorService := service.NewMonitorService(db, containerSvc)
		monitorService.Start(ctx)
	}

	// Initialize handlers
	authHandler := handler.NewAuthHandler(authSvc)
	projectHandler := handler.NewProjectHandler(projectSvc)
	healthHandler := handler.NewHealthHandler(db, containerSvc)
	userHandler := handler.NewUserHandler(authSvc)
	statsHandler := handler.NewStatsHandler(db, containerSvc)
	webhookHandler := handler.NewWebhookHandler(projectRepo, containerSvc)
	plansHandler := handler.NewPlansHandler()
	paymentHandler := handler.NewPaymentHandler(subSvc)
	adminHandler := handler.NewAdminHandler(db, authSvc)
	consoleHandler := ws.NewConsoleHandler(projectRepo, containerSvc, authSvc)

	// Build router
	r := chi.NewRouter()

	// Global middleware
	r.Use(appMiddleware.Recovery)
	r.Use(appMiddleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Global rate limiter (20 req/sec per IP, burst of 40)
	globalRL := appMiddleware.NewRateLimiter(20, 40)
	r.Use(globalRL.Middleware())

	// Health check and public routes (no auth)
	r.Get("/health", healthHandler.Check)
	r.Get("/api/plans", plansHandler.List)
	r.Post("/api/webhooks/github", webhookHandler.HandleGitHub)
	r.Post("/api/payment/webhook", paymentHandler.Webhook) // Public webhook

	// Auth routes
	r.Group(func(r chi.Router) {
		r.Use(appMiddleware.StrictRateLimiter())
		r.Post("/api/auth/login", authHandler.Login)
	})

	// Protected API routes
	r.Group(func(r chi.Router) {
		r.Use(appMiddleware.Auth(authSvc))

		// Auth
		r.Post("/api/auth/logout", authHandler.Logout)
		r.Get("/api/auth/me", authHandler.Me)

		// Projects
		r.Get("/api/projects", projectHandler.List)
		r.Post("/api/projects", projectHandler.Create)
		r.Delete("/api/projects/{id}", projectHandler.Delete)

		// Specific routes BEFORE generic {id} route
		r.Get("/api/projects/{id}/config", projectHandler.GetRuntimeConfig)
		r.Put("/api/projects/{id}/config", projectHandler.UpdateRuntimeConfig)
		r.Get("/api/projects/{id}/models", projectHandler.GetModels)

		// Specific CLI Wrappers (with stricter rate limit — each spawns docker exec)
		cliRL := appMiddleware.NewRateLimiter(5, 10) // 5 req/sec, burst 10
		r.Group(func(r chi.Router) {
			r.Use(cliRL.Middleware())
			r.Post("/api/projects/{id}/command", projectHandler.HandleCommand) // Generic Gateway
			r.Get("/api/projects/{id}/agent-status", projectHandler.GetAgentStatus)
			r.Get("/api/projects/{id}/agents", projectHandler.GetAgentsList)
			r.Get("/api/projects/{id}/sessions", projectHandler.GetSessionsList)
			r.Post("/api/projects/{id}/auth/add", projectHandler.AuthAdd)
			r.Post("/api/projects/{id}/auth/login", projectHandler.AuthLogin)
			r.Post("/api/projects/{id}/auth/callback", projectHandler.AuthCallback)
			r.Get("/api/projects/{id}/channels", projectHandler.GetChannels)
			r.Post("/api/projects/{id}/channels", projectHandler.AddChannel)
			r.Get("/api/projects/{id}/skills", projectHandler.GetSkills)
			r.Post("/api/projects/{id}/skills", projectHandler.InstallSkill)
			r.Delete("/api/projects/{id}/skills/{name}", projectHandler.UninstallSkill)
			r.Get("/api/projects/{id}/cron", projectHandler.GetCron)
			r.Post("/api/projects/{id}/cron", projectHandler.AddCron)

			// Diagnostics
			r.Get("/api/projects/{id}/doctor", projectHandler.Doctor)
			r.Get("/api/projects/{id}/health", projectHandler.Health)
			r.Get("/api/projects/{id}/agent-logs", projectHandler.GetAgentLogs)

			// Messaging & Pairing
			r.Post("/api/projects/{id}/message/send", projectHandler.SendMessage)
			r.Post("/api/projects/{id}/pairing/approve", projectHandler.ApprovePairing)

			// Memory
			r.Get("/api/projects/{id}/memory", projectHandler.GetMemory)
			r.Delete("/api/projects/{id}/memory", projectHandler.ClearMemory)

			// Hooks
			r.Get("/api/projects/{id}/hooks", projectHandler.GetHooks)
			r.Post("/api/projects/{id}/hooks", projectHandler.AddHook)
			r.Delete("/api/projects/{id}/hooks/{name}", projectHandler.RemoveHook)

			// Plugins
			r.Get("/api/projects/{id}/plugins", projectHandler.GetPlugins)
			r.Post("/api/projects/{id}/plugins", projectHandler.InstallPlugin)
			r.Delete("/api/projects/{id}/plugins/{name}", projectHandler.UninstallPlugin)

			// Security
			r.Get("/api/projects/{id}/security", projectHandler.GetSecurity)
		})

		r.Get("/api/projects/{id}/logs", projectHandler.Logs)
		r.Get("/api/projects/{id}/stats", statsHandler.ContainerStats)
		r.Get("/api/projects/{id}/metrics", statsHandler.GetProjectMetrics)
		r.Post("/api/projects/{id}/control", projectHandler.Control)
		r.Patch("/api/projects/{id}/repo", projectHandler.UpdateRepo)

		// Generic routes
		r.Get("/api/projects/{id}", projectHandler.GetByID)
		r.Put("/api/projects/{id}", projectHandler.Update)
		r.Delete("/api/projects/{id}", projectHandler.Delete)

		// Payment routes
		r.Post("/api/payment/checkout", paymentHandler.CreateCheckout)
		r.Get("/api/payment/subscription", paymentHandler.GetSubscription)

		// Admin routes
		r.Group(func(r chi.Router) {
			r.Use(appMiddleware.AdminOnly)
			r.Get("/api/admin/stats", adminHandler.GetStats)
			r.Get("/api/admin/users", adminHandler.ListUsers)
			r.Get("/api/users", userHandler.List)
			r.Post("/api/users", userHandler.Create)
			r.Delete("/api/users/{id}", userHandler.Delete)
			r.Post("/api/payment/simulate", paymentHandler.Simulate) // Admin-only: dev payment simulation
		})
	})

	// WebSocket console (auth via first message)
	r.HandleFunc("/projects/{projectId}/console", consoleHandler.Handle)

	// WebTerm proxy — proxies HTTP/WS to container ttyd port (auth via ?token= or Bearer header)
	webtermHandler := ws.NewWebtermHandler(projectRepo, containerSvc, authSvc)
	r.HandleFunc("/projects/{projectId}/webterm", webtermHandler.Handle)
	r.HandleFunc("/projects/{projectId}/webterm/*", webtermHandler.Handle)

	// Start server
	addr := fmt.Sprintf("0.0.0.0:%d", cfg.Port)
	server := &http.Server{
		Addr:        addr,
		Handler:     r,
		ReadTimeout: 30 * time.Second,
		// WriteTimeout must be 0 for WebSocket connections (they are long-lived)
		IdleTimeout: 120 * time.Second,
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
// loadDotEnv reads a .env file if it exists (simple implementation).
func loadDotEnv() {
	file, err := os.Open(".env")
	if err != nil {
		// .env file not present, ignore (rely on system env)
		return
	}
	defer file.Close()

	log.Println("📂 Loading environment from .env file...")
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			// Remove quotes if present
			if len(val) > 1 && val[0] == '"' && val[len(val)-1] == '"' {
				val = val[1 : len(val)-1]
			}
			os.Setenv(key, val)
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("⚠️ Error reading .env file: %v", err)
	}
}
