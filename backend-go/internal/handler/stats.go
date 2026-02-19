package handler

import (
	"net/http"
	"time"

	"github.com/aiagenz/backend/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StatsHandler handles container resource monitoring endpoints.
type StatsHandler struct {
	db        *pgxpool.Pool
	container *service.ContainerService
}

// NewStatsHandler creates a new StatsHandler.
func NewStatsHandler(db *pgxpool.Pool, container *service.ContainerService) *StatsHandler {
	return &StatsHandler{db: db, container: container}
}

// ContainerStats handles GET /api/projects/{id}/stats (Live Snapshot).
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
		// Graceful degradation: return empty stats with error info instead of 500
		JSON(w, http.StatusOK, map[string]interface{}{
			"cpu_percent":     0,
			"memory_percent":  0,
			"memory_usage_mb": 0,
			"status":          "Stats unavailable",
			"error":           err.Error(),
		})
		return
	}

	JSON(w, http.StatusOK, stats)
}

// GetProjectMetrics handles GET /api/projects/{id}/metrics (Historical).
func (h *StatsHandler) GetProjectMetrics(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	rangeParam := r.URL.Query().Get("range")
	if rangeParam == "" {
		rangeParam = "1h"
	}

	// Determine time interval based on range (simple implementation for now)
	interval := "1 hour"
	if rangeParam == "24h" {
		interval = "24 hours"
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT cpu_percent, memory_percent, memory_usage_mb, timestamp
		FROM metrics
		WHERE project_id = $1 AND timestamp > NOW() - $2::interval
		ORDER BY timestamp ASC
	`, projectID, interval)
	if err != nil {
		Error(w, err)
		return
	}
	defer rows.Close()

	type MetricPoint struct {
		CpuPercent    float64 `json:"cpu"`
		MemoryPercent float64 `json:"memory"`
		MemoryUsageMB float64 `json:"memoryMb"`
		Timestamp     string  `json:"timestamp"`
	}

	var metrics []MetricPoint
	for rows.Next() {
		var m MetricPoint
		var ts time.Time
		if err := rows.Scan(&m.CpuPercent, &m.MemoryPercent, &m.MemoryUsageMB, &ts); err == nil {
			m.Timestamp = ts.Format(time.RFC3339)
			metrics = append(metrics, m)
		}
	}

	JSON(w, http.StatusOK, metrics)
}
