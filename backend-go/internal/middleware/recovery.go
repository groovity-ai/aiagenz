package middleware

import (
	"log"
	"net/http"
	"runtime/debug"

	"github.com/aiagenz/backend/internal/handler"
)

// Recovery catches panics and returns a 500 error instead of crashing the server.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("PANIC: %v\n%s", err, debug.Stack())
				handler.JSON(w, http.StatusInternalServerError, map[string]string{
					"error": "internal server error",
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
