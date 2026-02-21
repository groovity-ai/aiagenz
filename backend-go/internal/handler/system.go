package handler

import (
	"net/http"

	"github.com/aiagenz/backend/internal/service"
)

// SystemHandler provides endpoints for global system configuration and state.
type SystemHandler struct {
	svc *service.SystemService
}

// NewSystemHandler creates a new SystemHandler.
func NewSystemHandler(svc *service.SystemService) *SystemHandler {
	return &SystemHandler{svc: svc}
}

// GetModels handles GET /api/models.
func (h *SystemHandler) GetModels(w http.ResponseWriter, r *http.Request) {
	models, err := h.svc.GetGlobalModels(r.Context())
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"models": models,
	})
}

// SyncModels handles POST /api/models/sync.
func (h *SystemHandler) SyncModels(w http.ResponseWriter, r *http.Request) {
	models, err := h.svc.SyncGlobalModels(r.Context())
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"models":  models,
	})
}
