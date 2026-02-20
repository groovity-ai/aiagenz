package ws

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/aiagenz/backend/internal/repository"
	"github.com/aiagenz/backend/internal/service"
)

// WebtermHandler proxies HTTP/WebSocket requests to a container's ttyd port.
// This avoids exposing dynamic ttyd ports directly to the browser (mixed content, firewall, etc.)
// Route: /projects/{projectId}/webterm/*
type WebtermHandler struct {
	repo      *repository.ProjectRepository
	container *service.ContainerService
	auth      *service.AuthService
}

func NewWebtermHandler(
	repo *repository.ProjectRepository,
	container *service.ContainerService,
	auth *service.AuthService,
) *WebtermHandler {
	return &WebtermHandler{repo: repo, container: container, auth: auth}
}

// Handle proxies the request to the container's ttyd internal port.
// Auth is done via ?token= query param or Authorization header.
func (h *WebtermHandler) Handle(w http.ResponseWriter, r *http.Request) {
	// Extract project ID from URL path: /projects/{projectId}/webterm/*
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 3 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	projectID := parts[2]

	// Authenticate
	token := r.URL.Query().Get("token")
	if token == "" {
		// Also accept Authorization: Bearer <token>
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			token = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if token == "" {
		http.Error(w, "token required", http.StatusUnauthorized)
		return
	}

	claims, err := h.auth.VerifyToken(token)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	// Look up project
	project, err := h.repo.FindByID(context.Background(), projectID, claims.Sub)
	if err != nil || project == nil {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}
	if project.ContainerID == nil {
		http.Error(w, "container not running", http.StatusServiceUnavailable)
		return
	}

	// Get ttyd host port from container inspect
	info, err := h.container.Inspect(context.Background(), *project.ContainerID)
	if err != nil || info == nil || info.TtydPort == "" {
		http.Error(w, "web terminal not available", http.StatusServiceUnavailable)
		return
	}

	// Proxy to ttyd. If Go is inside Docker (production), use the container's internal IP.
	// If Go is running locally on Mac (dev), use the host-mapped port on 127.0.0.1.
	var targetUrl string
	if _, err := os.Stat("/.dockerenv"); err == nil && info.IP != "" {
		targetUrl = fmt.Sprintf("http://%s:7681", info.IP) // Container-to-container
	} else {
		targetUrl = fmt.Sprintf("http://127.0.0.1:%s", info.TtydPort) // Host-to-container
	}

	target, err := url.Parse(targetUrl)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Strip /projects/{id}/webterm prefix before forwarding
	prefix := fmt.Sprintf("/projects/%s/webterm", projectID)
	r.URL.Path = strings.TrimPrefix(r.URL.Path, prefix)
	if r.URL.Path == "" {
		r.URL.Path = "/"
	}
	r.URL.RawPath = ""

	// Remove token from forwarded URL (ttyd doesn't need it)
	q := r.URL.Query()
	q.Del("token")
	r.URL.RawQuery = q.Encode()

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("webterm proxy error for project %s: %v", projectID, err)
		http.Error(w, "web terminal unreachable", http.StatusBadGateway)
	}
	// Required for WebSocket upgrade proxying
	proxy.ModifyResponse = func(resp *http.Response) error {
		// Remove X-Frame-Options from ttyd response so our iframe can load it
		resp.Header.Del("X-Frame-Options")
		return nil
	}
	proxy.ServeHTTP(w, r)
}
