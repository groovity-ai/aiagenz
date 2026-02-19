package handler

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/aiagenz/backend/internal/contextkeys"
	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

// modelsCache holds a cached result for one project.
type modelsCache struct {
	result   interface{}
	cachedAt time.Time
}

const modelsCacheTTL = 5 * time.Minute

// ProjectHandler handles project HTTP endpoints.
type ProjectHandler struct {
	svc    *service.ProjectService
	mu     sync.Mutex
	models map[string]*modelsCache // key: projectID
}

// NewProjectHandler creates a new ProjectHandler.
func NewProjectHandler(svc *service.ProjectService) *ProjectHandler {
	return &ProjectHandler{svc: svc, models: make(map[string]*modelsCache)}
}

// Create handles POST /api/projects.
func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)

	var req domain.CreateProjectRequest
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	project, err := h.svc.Create(r.Context(), userID, &req)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"project": project,
	})
}

// Update handles PUT /api/projects/{id}.
func (h *ProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	var req domain.UpdateProjectRequest
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	project, err := h.svc.Update(r.Context(), id, userID, &req)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"project": project,
	})
}

// List handles GET /api/projects.
func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	page := 1
	limit := 20
	// TODO: parse query params for page/limit

	projects, total, err := h.svc.List(r.Context(), userID, page, limit)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"data":       projects,
		"page":       page,
		"limit":      limit,
		"total":      total,
		"totalPages": (total + int64(limit) - 1) / int64(limit),
	})
}

// GetByID handles GET /api/projects/{id}.
func (h *ProjectHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	project, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, project)
}

// Control handles POST /api/projects/{id}/control.
func (h *ProjectHandler) Control(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	var req domain.ControlAction
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	if err := h.svc.Control(r.Context(), id, userID, &req); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// Delete handles DELETE /api/projects/{id}.
func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// Logs handles GET /api/projects/{id}/logs.
func (h *ProjectHandler) Logs(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	logs, err := h.svc.GetContainerLogs(r.Context(), id, userID)
	if err != nil {
		// Fallback: return basic info
		JSON(w, http.StatusOK, map[string]interface{}{"logs": "Container logs unavailable", "error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, logs)
}

// UpdateRepo handles PATCH /api/projects/{id}/repo.
func (h *ProjectHandler) UpdateRepo(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	var req struct {
		RepoURL       string `json:"repoUrl"`
		WebhookSecret string `json:"webhookSecret"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	if err := h.svc.UpdateRepo(r.Context(), id, userID, req.RepoURL, req.WebhookSecret); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// GetRuntimeConfig handles GET /projects/{id}/config.
func (h *ProjectHandler) GetRuntimeConfig(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	config, err := h.svc.GetRuntimeConfig(r.Context(), id, userID)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, config)
}

// UpdateRuntimeConfig handles PUT /projects/{id}/config.
func (h *ProjectHandler) UpdateRuntimeConfig(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	var config map[string]interface{}
	if err := DecodeJSON(r, &config); err != nil {
		Error(w, err)
		return
	}

	if err := h.svc.UpdateRuntimeConfig(r.Context(), id, userID, config); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Config updated and container restarted",
	})
}

// GetModels handles GET /projects/{id}/models.
// Results are cached per-project for 5 minutes (openclaw models list --all is slow: fetches from provider APIs).
func (h *ProjectHandler) GetModels(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	// Check cache first
	h.mu.Lock()
	cached, ok := h.models[id]
	h.mu.Unlock()
	if ok && time.Since(cached.cachedAt) < modelsCacheTTL {
		JSON(w, http.StatusOK, map[string]interface{}{"models": cached.result, "cached": true})
		return
	}

	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"models", "list", "--all", "--json"})
	if err != nil {
		Error(w, err)
		return
	}

	// Store in cache
	h.mu.Lock()
	h.models[id] = &modelsCache{result: result, cachedAt: time.Now()}
	h.mu.Unlock()

	JSON(w, http.StatusOK, map[string]interface{}{
		"models": result,
	})
}

// HandleCommand handles POST /projects/{id}/command.
func (h *ProjectHandler) HandleCommand(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	var req struct {
		Args []string `json:"args"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, req.Args)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

// GetAgentStatus handles GET /projects/{id}/agent-status
func (h *ProjectHandler) GetAgentStatus(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")

	project, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		Error(w, err)
		return
	}

	status := "stopped"
	if project.Status == "running" {
		status = "running"
	}

	// Try Bridge /status for richer agent insight (non-blocking)
	if status == "running" && project.ContainerID != nil {
		if bridgeStatus := h.svc.GetBridgeStatus(r.Context(), *project.ContainerID); bridgeStatus != nil {
			// Enrich with container-level status
			bridgeStatus["container_status"] = status
			JSON(w, http.StatusOK, bridgeStatus)
			return
		}
	}

	// Fallback: basic Docker status
	JSON(w, http.StatusOK, map[string]interface{}{
		"status": status,
		"agent": map[string]interface{}{
			"id":     "main",
			"status": status,
		},
		"uptime": project.Status,
	})
}

// GetAgentsList handles GET /projects/{id}/agents
// TODO: Re-enable when Bridge-based agent listing is stable (disabled to prevent overload)
func (h *ProjectHandler) GetAgentsList(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]interface{}{"agents": []interface{}{}})
}

// GetSessionsList handles GET /projects/{id}/sessions
// TODO: Re-enable when Bridge-based session listing is stable (disabled to prevent overload)
func (h *ProjectHandler) GetSessionsList(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]interface{}{"sessions": []interface{}{}})
}

// GetChannels handles GET /projects/{id}/channels
func (h *ProjectHandler) GetChannels(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	// Use config get --json to retrieve full config
	raw, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"config", "get", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	// Extract channels part (if raw is map)
	if data, ok := raw.(map[string]interface{}); ok {
		if channels, found := data["channels"]; found {
			JSON(w, http.StatusOK, map[string]interface{}{"channels": channels})
			return
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"channels": map[string]interface{}{}})
}

// AddChannel handles POST /projects/{id}/channels (Enable/Config Channel)
func (h *ProjectHandler) AddChannel(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Type   string                 `json:"type"`   // e.g. "telegram"
		Config map[string]interface{} `json:"config"` // e.g. { "botToken": "..." }
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	// DEBUG LOGGING
	fmt.Printf("🔍 AddChannel Request: Type=%s, Config=%+v\n", req.Type, req.Config)

	// APPROACH: Use Read-Modify-Write via GetRuntimeConfig/UpdateRuntimeConfig
	// This is more reliable than 'openclaw config set' CLI which can be flaky or fail on nested paths.

	// 1. Get current config
	config, err := h.svc.GetRuntimeConfig(r.Context(), id, userID)
	if err != nil {
		Error(w, err)
		return
	}

	// 2. Initialize map structure if missing (Safe Deep Map Access)
	if config["channels"] == nil {
		config["channels"] = make(map[string]interface{})
	}
	channels, ok := config["channels"].(map[string]interface{})
	if !ok {
		// Reset if invalid type
		channels = make(map[string]interface{})
		config["channels"] = channels
	}

	if channels[req.Type] == nil {
		channels[req.Type] = make(map[string]interface{})
	}
	channelObj, ok := channels[req.Type].(map[string]interface{})
	if !ok {
		channelObj = make(map[string]interface{})
		channels[req.Type] = channelObj
	}

	// 3. Set Enabled = true
	channelObj["enabled"] = true

	// 4. Set Config Values (accounts.default...)
	if len(req.Config) > 0 {
		if channelObj["accounts"] == nil {
			channelObj["accounts"] = make(map[string]interface{})
		}
		accounts, ok := channelObj["accounts"].(map[string]interface{})
		if !ok {
			accounts = make(map[string]interface{})
			channelObj["accounts"] = accounts
		}

		if accounts["default"] == nil {
			accounts["default"] = make(map[string]interface{})
		}
		defAccount, ok := accounts["default"].(map[string]interface{})
		if !ok {
			defAccount = make(map[string]interface{})
			accounts["default"] = defAccount
		}

		// Merge provided config into default account
		for k, v := range req.Config {
			if strVal, ok := v.(string); ok && strVal != "" {
				// Normalize key: if key is "token", change to "botToken" for OpenClaw v2+
				if k == "token" && req.Type == "telegram" {
					defAccount["botToken"] = strVal
				} else {
					defAccount[k] = strVal
				}
			}
		}
	}

	// 5. Save Config
	if err := h.svc.UpdateRuntimeConfig(r.Context(), id, userID, config); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// AuthAdd handles POST /projects/{id}/auth/add (Add API Key)
func (h *ProjectHandler) AuthAdd(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Provider string `json:"provider"`
		Key      string `json:"key"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}
	if req.Provider == "" {
		Error(w, domain.ErrBadRequest("provider is required"))
		return
	}
	if req.Key == "" {
		Error(w, domain.ErrBadRequest("key is required"))
		return
	}
	if len(req.Key) < 4 {
		Error(w, domain.ErrBadRequest("key is too short"))
		return
	}

	// APPROACH: Direct Config Modification (More Reliable than CLI)
	// 1. Get current config
	config, err := h.svc.GetRuntimeConfig(r.Context(), id, userID)
	if err != nil {
		Error(w, err)
		return
	}

	// 2. Initialize map structure if missing
	if config["auth"] == nil {
		config["auth"] = make(map[string]interface{})
	}
	authObj, ok := config["auth"].(map[string]interface{})
	if !ok {
		authObj = make(map[string]interface{})
		config["auth"] = authObj
	}

	if authObj["profiles"] == nil {
		authObj["profiles"] = make(map[string]interface{})
	}
	profiles, ok := authObj["profiles"].(map[string]interface{})
	if !ok {
		profiles = make(map[string]interface{})
		authObj["profiles"] = profiles
	}

	// 3. Set Profile Key
	// Convention: provider:default
	profileKey := req.Provider + ":default"
	profiles[profileKey] = map[string]interface{}{
		"provider": req.Provider,
		"mode":     "api_key", // Assume API Key mode for direct add
		"key":      req.Key,
	}

	// 4. Save Config (this handles restarting container too)
	if err := h.svc.UpdateRuntimeConfig(r.Context(), id, userID, config); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// AuthLogin handles POST /projects/{id}/auth/login (Start OAuth - Step 1: Get URL)
func (h *ProjectHandler) AuthLogin(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Provider string `json:"provider"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}
	if req.Provider == "" {
		Error(w, domain.ErrBadRequest("provider is required"))
		return
	}
	// Step 1: Start OAuth and capture the authorization URL
	output, err := h.svc.OAuthGetURL(r.Context(), id, userID, req.Provider)
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"output": output})
}

// AuthCallback handles POST /projects/{id}/auth/callback (Complete OAuth - Step 2: Submit Callback)
func (h *ProjectHandler) AuthCallback(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Provider    string `json:"provider"`
		CallbackURL string `json:"callbackUrl"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}
	if req.Provider == "" {
		Error(w, domain.ErrBadRequest("provider is required"))
		return
	}
	if req.CallbackURL == "" {
		Error(w, domain.ErrBadRequest("callbackUrl is required"))
		return
	}
	// Step 2: Submit callback URL to complete the OAuth flow
	output, err := h.svc.OAuthSubmitCallback(r.Context(), id, userID, req.Provider, req.CallbackURL)
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"success": true, "output": output})
}

// --- SKILLS MANAGEMENT ---

// GetSkills handles GET /projects/{id}/skills
func (h *ProjectHandler) GetSkills(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"skills", "list", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// InstallSkill handles POST /projects/{id}/skills
func (h *ProjectHandler) InstallSkill(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Name string `json:"name"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}
	_, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"skills", "install", req.Name})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// UninstallSkill handles DELETE /projects/{id}/skills/{name}
func (h *ProjectHandler) UninstallSkill(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	skillName := chi.URLParam(r, "name")
	_, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"skills", "remove", skillName})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// --- CRON MANAGEMENT ---

// GetCron handles GET /projects/{id}/cron
func (h *ProjectHandler) GetCron(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"cron", "list", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// AddCron handles POST /projects/{id}/cron
// Expects payload that maps to cron add flags, or simplified struct
func (h *ProjectHandler) AddCron(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Args []string `json:"args"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	// BUG-5 FIX: Validate individual args (RunOpenClawCommand also validates,
	// but double-check here since we're prepending "cron")
	for _, arg := range req.Args {
		if len(arg) > 500 {
			Error(w, domain.ErrBadRequest("argument too long"))
			return
		}
	}

	cmdArgs := append([]string{"cron"}, req.Args...)
	_, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, cmdArgs)
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// --- DIAGNOSTICS ---

// Doctor handles GET /projects/{id}/doctor
func (h *ProjectHandler) Doctor(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"doctor", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// Health handles GET /projects/{id}/health
func (h *ProjectHandler) Health(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"health", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// GetAgentLogs handles GET /projects/{id}/agent-logs
func (h *ProjectHandler) GetAgentLogs(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	// Get optional tail param
	tail := r.URL.Query().Get("tail")
	args := []string{"logs", "--json"}
	if tail != "" {
		args = append(args, "--tail", tail)
	}
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, args)
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// --- MESSAGING ---

// SendMessage handles POST /projects/{id}/message/send
func (h *ProjectHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		To      string `json:"to"`
		Message string `json:"message"`
		Channel string `json:"channel"` // optional: telegram, whatsapp, etc
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}
	if req.To == "" || req.Message == "" {
		Error(w, domain.ErrBadRequest("to and message are required"))
		return
	}
	args := []string{"message", "send", "--to", req.To, "--message", req.Message}
	if req.Channel != "" {
		args = append(args, "--channel", req.Channel)
	}
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, args)
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"success": true, "output": result})
}

// --- PAIRING ---

// ApprovePairing handles POST /projects/{id}/pairing/approve
func (h *ProjectHandler) ApprovePairing(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Channel string `json:"channel"`
		Code    string `json:"code"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}
	if req.Channel == "" || req.Code == "" {
		Error(w, domain.ErrBadRequest("channel and code are required"))
		return
	}
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"pairing", "approve", req.Channel, req.Code})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"success": true, "output": result})
}

// --- MEMORY ---

// GetMemory handles GET /projects/{id}/memory
func (h *ProjectHandler) GetMemory(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"memory", "list", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// ClearMemory handles DELETE /projects/{id}/memory
func (h *ProjectHandler) ClearMemory(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	_, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"memory", "clear", "--confirm"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// --- HOOKS ---

// GetHooks handles GET /projects/{id}/hooks
func (h *ProjectHandler) GetHooks(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"hooks", "list", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// AddHook handles POST /projects/{id}/hooks
func (h *ProjectHandler) AddHook(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Args []string `json:"args"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}
	cmdArgs := append([]string{"hooks", "add"}, req.Args...)
	_, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, cmdArgs)
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// RemoveHook handles DELETE /projects/{id}/hooks/{name}
func (h *ProjectHandler) RemoveHook(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	hookName := chi.URLParam(r, "name")
	_, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"hooks", "remove", hookName})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// --- PLUGINS ---

// GetPlugins handles GET /projects/{id}/plugins
func (h *ProjectHandler) GetPlugins(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"plugins", "list", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}

// InstallPlugin handles POST /projects/{id}/plugins
func (h *ProjectHandler) InstallPlugin(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	var req struct {
		Name string `json:"name"`
	}
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}
	_, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"plugins", "install", req.Name})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// UninstallPlugin handles DELETE /projects/{id}/plugins/{name}
func (h *ProjectHandler) UninstallPlugin(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	pluginName := chi.URLParam(r, "name")
	_, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"plugins", "remove", pluginName})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// --- SECURITY ---

// GetSecurity handles GET /projects/{id}/security
func (h *ProjectHandler) GetSecurity(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(contextkeys.UserID).(string)
	id := chi.URLParam(r, "id")
	result, err := h.svc.RunOpenClawCommand(r.Context(), id, userID, []string{"security", "list", "--json"})
	if err != nil {
		Error(w, err)
		return
	}
	JSON(w, http.StatusOK, result)
}
