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
			var tokenString string

			authHeader := r.Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
					tokenString = parts[1]
				}
			}

			// Fallback to query parameter (common for WebSockets)
			if tokenString == "" {
				tokenString = r.URL.Query().Get("token")
			}

			// Fallback to cookie if no Authorization header is present.
			// This is needed for direct browser -> Go API calls (like SSE streaming).
			if tokenString == "" {
				// Check for common Supabase auth cookie names as well as generic ones
				cookieNames := []string{"token", "sb-localhost-auth-token", "sb-aiagenz-auth-token", "sb-auth-token"}
				for _, name := range cookieNames {
					if cookie, err := r.Cookie(name); err == nil && cookie.Value != "" {
						tokenString = cookie.Value
						break
					}
				}
			}

			if tokenString == "" {
				handler.JSON(w, http.StatusUnauthorized, map[string]string{"error": "no token provided in header or cookie"})
				return
			}

			claims, err := authSvc.VerifyToken(tokenString)
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
