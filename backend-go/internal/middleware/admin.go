package middleware

import (
	"net/http"

	"github.com/aiagenz/backend/internal/handler"
)

// AdminOnly restricts access to admin users only.
func AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, _ := r.Context().Value("userRole").(string)
		if role != "admin" {
			handler.JSON(w, http.StatusForbidden, map[string]string{"error": "admin access required"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
