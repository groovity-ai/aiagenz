package handler

import (
	"log"
	"net/http"

	"github.com/aiagenz/backend/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AdminHandler struct {
	db      *pgxpool.Pool
	authSvc *service.AuthService
}

func NewAdminHandler(db *pgxpool.Pool, authSvc *service.AuthService) *AdminHandler {
	return &AdminHandler{db: db, authSvc: authSvc}
}

// GetStats returns system-wide metrics.
func (h *AdminHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	// Simple count queries
	var usersCount, projectsCount, runningCount int
	var subCount int

	if err := h.db.QueryRow(r.Context(), "SELECT COUNT(*) FROM users").Scan(&usersCount); err != nil {
		log.Printf("Failed to count users: %v", err)
	}
	if err := h.db.QueryRow(r.Context(), "SELECT COUNT(*) FROM projects").Scan(&projectsCount); err != nil {
		log.Printf("Failed to count projects: %v", err)
	}
	if err := h.db.QueryRow(r.Context(), "SELECT COUNT(*) FROM projects WHERE status = 'running'").Scan(&runningCount); err != nil {
		log.Printf("Failed to count running: %v", err)
	}
	// Verify table exists first or just ignore error if migration didn't run
	_ = h.db.QueryRow(r.Context(), "SELECT COUNT(*) FROM subscriptions WHERE status = 'active'").Scan(&subCount)

	JSON(w, http.StatusOK, map[string]interface{}{
		"users":         usersCount,
		"projects":      projectsCount,
		"runningAgents": runningCount,
		"subscriptions": subCount,
	})
}

// ListUsers returns all users.
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.authSvc.ListUsers(r.Context())
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, users)
}
