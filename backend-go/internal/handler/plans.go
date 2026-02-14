package handler

import (
	"net/http"

	"github.com/aiagenz/backend/internal/domain"
)

// PlansHandler handles plan-related endpoints.
type PlansHandler struct{}

// NewPlansHandler creates a new PlansHandler.
func NewPlansHandler() *PlansHandler {
	return &PlansHandler{}
}

// List handles GET /api/plans.
func (h *PlansHandler) List(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, domain.AvailablePlans())
}
