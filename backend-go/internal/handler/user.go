package handler

import (
	"net/http"

	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

// UserHandler handles user management endpoints (admin only).
type UserHandler struct {
	auth *service.AuthService
}

// NewUserHandler creates a new UserHandler.
func NewUserHandler(auth *service.AuthService) *UserHandler {
	return &UserHandler{auth: auth}
}

// List handles GET /api/users.
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	users, err := h.auth.ListUsers(r.Context())
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, users)
}

// Create handles POST /api/users.
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req domain.CreateUserRequest
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	user, err := h.auth.CreateUser(r.Context(), &req)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusCreated, user)
}

// Delete handles DELETE /api/users/{id}.
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if err := h.auth.DeleteUser(r.Context(), id); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]bool{"success": true})
}
