package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/aiagenz/backend/internal/contextkeys"
	"github.com/aiagenz/backend/internal/handler"
	"github.com/aiagenz/backend/internal/service"
)

// Auth creates a JWT authentication middleware.
func Auth(authSvc *service.AuthService) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				handler.JSON(w, http.StatusUnauthorized, map[string]string{"error": "no token provided"})
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				handler.JSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid authorization header"})
				return
			}

			claims, err := authSvc.VerifyToken(parts[1])
			if err != nil {
				handler.JSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid or expired token"})
				return
			}

			// Store user info in context using typed keys
			ctx := context.WithValue(r.Context(), contextkeys.UserID, claims.Sub)
			ctx = context.WithValue(ctx, contextkeys.UserEmail, claims.Email)
			ctx = context.WithValue(ctx, contextkeys.UserRole, claims.Role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
