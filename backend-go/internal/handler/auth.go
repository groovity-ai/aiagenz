package handler

import (
	"net/http"

	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/service"
)

// AuthHandler handles authentication HTTP endpoints.
type AuthHandler struct {
	auth *service.AuthService
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

// Login handles POST /api/auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req domain.LoginRequest
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	resp, err := h.auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, resp)
}
