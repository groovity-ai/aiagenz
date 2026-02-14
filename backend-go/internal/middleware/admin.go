package middleware

import (
	"net/http"

	"github.com/aiagenz/backend/internal/contextkeys"
	"github.com/aiagenz/backend/internal/handler"
)

// AdminOnly middleware ensures the user has 'admin' role.
// Must be used AFTER Auth middleware which sets contextkeys.UserRole in context.
func AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, ok := r.Context().Value(contextkeys.UserRole).(string)
		if !ok || role != "admin" {
			handler.JSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: admin access required"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
