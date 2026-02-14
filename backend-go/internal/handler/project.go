package handler

import (
	"net/http"
	"strconv"

	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

// ProjectHandler handles project HTTP endpoints.
type ProjectHandler struct {
	svc *service.ProjectService
}

// NewProjectHandler creates a new ProjectHandler.
func NewProjectHandler(svc *service.ProjectService) *ProjectHandler {
	return &ProjectHandler{svc: svc}
}

// Create handles POST /api/projects.
func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(string)

	var req domain.CreateProjectRequest
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	project, err := h.svc.Create(r.Context(), userID, &req)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"project": project,
	})
}

// List handles GET /api/projects.
// Supports ?page=1&limit=10 query params for pagination.
func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(string)

	projects, err := h.svc.List(r.Context(), userID)
	if err != nil {
		Error(w, err)
		return
	}

	// Pagination
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	total := len(projects)
	start := (page - 1) * limit
	end := start + limit

	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	paginated := projects[start:end]
	totalPages := (total + limit - 1) / limit

	JSON(w, http.StatusOK, map[string]interface{}{
		"data":       paginated,
		"page":       page,
		"limit":      limit,
		"total":      total,
		"totalPages": totalPages,
	})
}

// GetByID handles GET /api/projects/{id}.
func (h *ProjectHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(string)
	id := chi.URLParam(r, "id")

	project, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, project)
}

// Control handles POST /api/projects/{id}/control.
func (h *ProjectHandler) Control(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(string)
	id := chi.URLParam(r, "id")

	var action domain.ControlAction
	if err := DecodeJSON(r, &action); err != nil {
		Error(w, err)
		return
	}

	if err := h.svc.Control(r.Context(), id, userID, &action); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Delete handles DELETE /api/projects/{id}.
func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(string)
	id := chi.URLParam(r, "id")

	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Logs handles GET /api/projects/{id}/logs.
func (h *ProjectHandler) Logs(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(string)
	id := chi.URLParam(r, "id")

	logs, err := h.svc.Logs(r.Context(), id, userID)
	if err != nil {
		Error(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(logs))
}
