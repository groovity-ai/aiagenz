package handler

import (
	"net/http"

	"github.com/aiagenz/backend/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
)

// HealthHandler handles the health check endpoint.
type HealthHandler struct {
	db        *pgxpool.Pool
	container *service.ContainerService
}

// NewHealthHandler creates a new HealthHandler.
func NewHealthHandler(db *pgxpool.Pool, container *service.ContainerService) *HealthHandler {
	return &HealthHandler{db: db, container: container}
}

// Check handles GET /health.
func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	status := map[string]interface{}{
		"status": "ok",
	}

	// Check DB
	if err := h.db.Ping(ctx); err != nil {
		status["database"] = "error"
		status["status"] = "degraded"
	} else {
		status["database"] = "ok"
	}

	// Check Docker
	if err := h.container.Ping(ctx); err != nil {
		status["docker"] = "error"
		status["status"] = "degraded"
	} else {
		status["docker"] = "ok"
	}

	code := http.StatusOK
	if status["status"] == "degraded" {
		code = http.StatusServiceUnavailable
	}

	JSON(w, code, status)
}
