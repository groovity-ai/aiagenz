package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aiagenz/backend/internal/handler"
	"golang.org/x/time/rate"
)

// RateLimiter implements a per-IP token bucket rate limiter.
type RateLimiter struct {
	visitors map[string]*visitor
	mu       sync.RWMutex
	rate     rate.Limit
	burst    int
}

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewRateLimiter creates a rate limiter with the given requests per second and burst size.
func NewRateLimiter(rps float64, burst int) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate.Limit(rps),
		burst:    burst,
	}
	// Cleanup stale entries every minute
	go rl.cleanup()
	return rl
}

// Middleware returns an HTTP middleware that rate limits by client IP.
func (rl *RateLimiter) Middleware() func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := extractClientIP(r)

			rl.mu.Lock()
			v, exists := rl.visitors[ip]
			if !exists {
				v = &visitor{limiter: rate.NewLimiter(rl.rate, rl.burst)}
				rl.visitors[ip] = v
			}
			v.lastSeen = time.Now()
			rl.mu.Unlock()

			if !v.limiter.Allow() {
				w.Header().Set("Retry-After", "1")
				handler.JSON(w, http.StatusTooManyRequests, map[string]string{
					"error": "rate limit exceeded, try again later",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// StrictMiddleware returns a stricter rate limiter (for login endpoints).
func StrictRateLimiter() func(next http.Handler) http.Handler {
	rl := NewRateLimiter(1, 5) // 1 req/sec, burst of 5
	return rl.Middleware()
}

func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(time.Minute)
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			if time.Since(v.lastSeen) > 3*time.Minute {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// extractClientIP returns the client IP, preferring proxy headers if available.
func extractClientIP(r *http.Request) string {
	// Check X-Real-IP first (set by Nginx)
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	// Check X-Forwarded-For (first entry is the original client)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.SplitN(xff, ",", 2)
		return strings.TrimSpace(parts[0])
	}
	// Fall back to RemoteAddr, stripping port
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}
