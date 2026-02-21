package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/aiagenz/backend/internal/repository"
)

// SystemService handles global system operations like caching models.
type SystemService struct {
	cacheRepo    *repository.CacheRepository
	containerSvc *ContainerService
}

// NewSystemService creates a new SystemService.
func NewSystemService(cacheRepo *repository.CacheRepository, containerSvc *ContainerService) *SystemService {
	return &SystemService{
		cacheRepo:    cacheRepo,
		containerSvc: containerSvc,
	}
}

// GetGlobalModels retrieves the list of OpenClaw models from the global cache, or syncs if empty/stale.
func (s *SystemService) GetGlobalModels(ctx context.Context) (interface{}, error) {
	entry, err := s.cacheRepo.Get(ctx, "openclaw_models")
	if err != nil {
		log.Printf("[ERROR] Failed to fetch system_cache: %v", err)
	}

	// Cache Hit (Valid for 24 hours)
	if entry != nil && time.Since(entry.UpdatedAt) < 24*time.Hour {
		return entry.Data, nil
	}

	// Cache Miss or Expired -> Sync
	log.Printf("[INFO] Models cache miss/expired. Syncing global models...")
	return s.SyncGlobalModels(ctx)
}

// SyncGlobalModels executes 'openclaw models list' on any running container and saves it.
func (s *SystemService) SyncGlobalModels(ctx context.Context) (interface{}, error) {
	activeIDs, err := s.containerSvc.ListRunningContainerIDs(ctx)
	if err != nil || len(activeIDs) == 0 {
		return nil, fmt.Errorf("no running project containers found to sync models. Please start at least one project")
	}

	var finalResult interface{}
	var lastErr error

	// Try the first available running container
	for _, containerID := range activeIDs {
		cmd := []string{"openclaw", "models", "list", "--all", "--json"}
		output, err := s.containerSvc.ExecCommand(ctx, containerID, cmd)
		if err != nil {
			lastErr = err
			continue // try next container if one fails
		}

		var parsed interface{}
		if err := json.Unmarshal([]byte(output), &parsed); err != nil {
			lastErr = fmt.Errorf("failed to parse models json from container %s: %v", containerID, err)
			continue
		}

		finalResult = parsed
		break // Success!
	}

	if finalResult == nil {
		return nil, fmt.Errorf("failed to sync models from any container. Last error: %v", lastErr)
	}

	// Parse the wrapped "models" key if returned by OpenClaw
	if m, ok := finalResult.(map[string]interface{}); ok {
		if list, exists := m["models"]; exists {
			finalResult = list
		}
	}

	// Save to DB
	if err := s.cacheRepo.Set(ctx, "openclaw_models", finalResult); err != nil {
		log.Printf("[ERROR] Failed to save models to system cache: %v", err)
	}

	return finalResult, nil
}
