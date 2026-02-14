package handler

import (
	"net/http"

	"github.com/aiagenz/backend/internal/contextkeys"
	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/service"
)

// AuthHandler handles authentication endpoints.
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

// Logout handles POST /api/auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Me handles GET /api/auth/me — returns the currently authenticated user's profile.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextkeys.UserID).(string)
	if !ok || userID == "" {
		JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	user, err := h.auth.GetUserByID(r.Context(), userID)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, user)
}
