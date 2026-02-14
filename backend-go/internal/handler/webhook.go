package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/aiagenz/backend/internal/repository"
	"github.com/aiagenz/backend/internal/service"
)

type WebhookHandler struct {
	projectRepo *repository.ProjectRepository
	container   *service.ContainerService
}

func NewWebhookHandler(projectRepo *repository.ProjectRepository, container *service.ContainerService) *WebhookHandler {
	return &WebhookHandler{
		projectRepo: projectRepo,
		container:   container,
	}
}

// HandleGitHub handles incoming GitHub push events.
func (h *WebhookHandler) HandleGitHub(w http.ResponseWriter, r *http.Request) {
	// 1. Get header info
	githubEvent := r.Header.Get("X-GitHub-Event")
	hubSignature := r.Header.Get("X-Hub-Signature-256")

	if githubEvent != "push" {
		// Just acknowledge ping or other events
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Ignored non-push event"))
		return
	}

	// 2. Read body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	// 3. Parse JSON to find repo url
	var payload struct {
		Ref        string `json:"ref"`
		Repository struct {
			HTMLURL  string `json:"html_url"`
			CloneURL string `json:"clone_url"`
		} `json:"repository"`
	}

	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// 4. Get projectId from query parameter
	projectID := r.URL.Query().Get("projectId")
	if projectID == "" {
		http.Error(w, "Missing projectId query param", http.StatusBadRequest)
		return
	}

	// 5. Get Project
	project, err := h.projectRepo.FindByIDOnly(r.Context(), projectID)
	if err != nil || project == nil {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	// 6. Verify Signature if secret is set
	if project.WebhookSecret != nil && *project.WebhookSecret != "" {
		if !verifySignature(hubSignature, body, *project.WebhookSecret) {
			http.Error(w, "Invalid signature", http.StatusUnauthorized)
			return
		}
	}

	// 7. Trigger Redeploy (Restart container)
	if h.container != nil && project.ContainerID != nil && *project.ContainerID != "" {
		containerID := *project.ContainerID
		log.Printf("[Webhook] Restarting project %s (%s) due to push", project.Name, project.ID)
		go func() {
			// Use context.Background() — request context will be canceled after response
			_ = h.container.Restart(context.Background(), containerID)
		}()
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Deploy triggered"))
}

func verifySignature(signature string, payload []byte, secret string) bool {
	parts := strings.Split(signature, "=")
	if len(parts) != 2 || parts[0] != "sha256" {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedMAC := mac.Sum(nil)
	expectedSignature := hex.EncodeToString(expectedMAC)

	return hmac.Equal([]byte(parts[1]), []byte(expectedSignature))
}
