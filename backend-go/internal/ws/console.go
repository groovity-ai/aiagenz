package ws

import (
	"context"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/aiagenz/backend/internal/repository"
	"github.com/aiagenz/backend/internal/service"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // CORS is handled at the HTTP level
	},
}

// ConsoleHandler handles WebSocket connections for interactive container shells.
type ConsoleHandler struct {
	repo      *repository.ProjectRepository
	container *service.ContainerService
	auth      *service.AuthService
}

// NewConsoleHandler creates a new ConsoleHandler.
func NewConsoleHandler(
	repo *repository.ProjectRepository,
	container *service.ContainerService,
	auth *service.AuthService,
) *ConsoleHandler {
	return &ConsoleHandler{
		repo:      repo,
		container: container,
		auth:      auth,
	}
}

// Handle upgrades HTTP to WebSocket and attaches to a container shell.
// URL: /projects/{projectId}/console?token=JWT_TOKEN
func (h *ConsoleHandler) Handle(w http.ResponseWriter, r *http.Request) {
	// Extract project ID from URL path
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 3 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	projectID := parts[2]

	// Authenticate via query param token
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "token required", http.StatusUnauthorized)
		return
	}

	claims, err := h.auth.VerifyToken(token)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	// Look up project and verify ownership
	project, err := h.repo.FindByID(context.Background(), projectID, claims.Sub)
	if err != nil || project == nil {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}

	if project.ContainerID == nil {
		http.Error(w, "no container for this project", http.StatusNotFound)
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("🔌 Console connected to %s (user: %s)", *project.ContainerID, claims.Email)

	// Create exec session
	ctx := context.Background()
	execID, err := h.container.Exec(ctx, *project.ContainerID)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error creating exec: "+err.Error()+"\r\n"))
		return
	}

	// Attach to exec session
	hijacked, err := h.container.ExecAttach(ctx, execID)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error attaching to exec: "+err.Error()+"\r\n"))
		return
	}
	defer hijacked.Close()

	// Stream container output → WebSocket
	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			n, err := hijacked.Reader.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("exec stream read error: %v", err)
				}
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, buf[:n]); err != nil {
				return
			}
		}
	}()

	// Stream WebSocket input → container
	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if _, err := hijacked.Conn.Write(msg); err != nil {
				return
			}
		}
	}()

	<-done
}
