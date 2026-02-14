package handler

import (
	"net/http"

	"github.com/aiagenz/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

// StatsHandler handles container resource monitoring endpoints.
type StatsHandler struct {
	container *service.ContainerService
}

// NewStatsHandler creates a new StatsHandler.
func NewStatsHandler(container *service.ContainerService) *StatsHandler {
	return &StatsHandler{container: container}
}

// ContainerStats handles GET /api/projects/{id}/stats.
func (h *StatsHandler) ContainerStats(w http.ResponseWriter, r *http.Request) {
	containerID := chi.URLParam(r, "id")

	if h.container == nil {
		JSON(w, http.StatusOK, map[string]interface{}{
			"cpu":    "N/A",
			"memory": "N/A",
			"status": "Docker not available",
		})
		return
	}

	stats, err := h.container.Stats(r.Context(), containerID)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, stats)
}
