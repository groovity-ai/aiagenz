package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// ContainerService wraps the Docker SDK for container operations.
type ContainerService struct {
	cli *client.Client
}

// ContainerInfo holds the runtime status of a container.
type ContainerInfo struct {
	Status string `json:"status"`
	Uptime string `json:"uptime,omitempty"`
}

// NewContainerService creates a new Docker client.
func NewContainerService() (*ContainerService, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}
	return &ContainerService{cli: cli}, nil
}

// Inspect returns the status of a container.
func (s *ContainerService) Inspect(ctx context.Context, containerID string) (*ContainerInfo, error) {
	if containerID == "" {
		return &ContainerInfo{Status: "stopped"}, nil
	}

	info, err := s.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return &ContainerInfo{Status: "stopped"}, nil
	}

	return &ContainerInfo{
		Status: info.State.Status,
		Uptime: info.State.StartedAt,
	}, nil
}

// ContainerResources defines resource limits for a container.
type ContainerResources struct {
	MemoryMB int64   // Memory limit in MB
	CPU      float64 // CPU count (e.g. 0.5, 1, 2)
}

// Create creates a new container with gVisor runtime and plan-based resource limits.
func (s *ContainerService) Create(ctx context.Context, name, image string, env []string, resources ContainerResources) (string, error) {
	memoryBytes := resources.MemoryMB * 1024 * 1024
	memoryReservation := memoryBytes / 2 // 50% soft guarantee
	nanoCPUs := int64(resources.CPU * 1e9)

	// Inject NODE_OPTIONS to prevent JS heap OOM.
	// Set max-old-space-size to 75% of container memory, leaving headroom for OS overhead.
	nodeHeapMB := resources.MemoryMB * 3 / 4
	env = append(env, fmt.Sprintf("NODE_OPTIONS=--max-old-space-size=%d", nodeHeapMB))

	resp, err := s.cli.ContainerCreate(ctx,
		&container.Config{
			Image: image,
			Env:   env,
		},
		&container.HostConfig{
			Runtime: "runsc",
			Resources: container.Resources{
				Memory:            memoryBytes,
				MemoryReservation: memoryReservation,
				NanoCPUs:          nanoCPUs,
			},
			RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyUnlessStopped},
		},
		nil, nil, name,
	)
	if err != nil {
		return "", fmt.Errorf("failed to create container: %w", err)
	}
	return resp.ID, nil
}

// Start starts a container.
func (s *ContainerService) Start(ctx context.Context, containerID string) error {
	return s.cli.ContainerStart(ctx, containerID, container.StartOptions{})
}

// Stop stops a container.
func (s *ContainerService) Stop(ctx context.Context, containerID string) error {
	return s.cli.ContainerStop(ctx, containerID, container.StopOptions{})
}

// Restart restarts a container.
func (s *ContainerService) Restart(ctx context.Context, containerID string) error {
	return s.cli.ContainerRestart(ctx, containerID, container.StopOptions{})
}

// Remove force-removes a container.
func (s *ContainerService) Remove(ctx context.Context, containerID string) error {
	return s.cli.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true})
}

// Logs returns the last N lines of container logs.
func (s *ContainerService) Logs(ctx context.Context, containerID string, tail int) (string, error) {
	reader, err := s.cli.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       fmt.Sprintf("%d", tail),
		Timestamps: true,
	})
	if err != nil {
		return "", fmt.Errorf("failed to get logs: %w", err)
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return "", fmt.Errorf("failed to read logs: %w", err)
	}
	return string(data), nil
}

// Exec creates an interactive exec session (for WebSocket console).
func (s *ContainerService) Exec(ctx context.Context, containerID string) (string, error) {
	exec, err := s.cli.ContainerExecCreate(ctx, containerID, container.ExecOptions{
		Cmd:          []string{"/bin/sh"},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
	})
	if err != nil {
		return "", fmt.Errorf("failed to create exec: %w", err)
	}
	return exec.ID, nil
}

// ExecAttach attaches to an exec session and returns an interactive stream.
func (s *ContainerService) ExecAttach(ctx context.Context, execID string) (*types.HijackedResponse, error) {
	resp, err := s.cli.ContainerExecAttach(ctx, execID, container.ExecStartOptions{Tty: true})
	if err != nil {
		return nil, fmt.Errorf("failed to attach to exec: %w", err)
	}
	return &resp, nil
}

// Stats returns CPU and memory usage for a container.
func (s *ContainerService) Stats(ctx context.Context, containerID string) (map[string]interface{}, error) {
	resp, err := s.cli.ContainerStats(ctx, containerID, false)
	if err != nil {
		return nil, fmt.Errorf("failed to get stats: %w", err)
	}
	defer resp.Body.Close()

	var statsJSON map[string]interface{}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read stats: %w", err)
	}

	if err := json.Unmarshal(data, &statsJSON); err != nil {
		return nil, fmt.Errorf("failed to parse stats: %w", err)
	}

	// Extract useful metrics
	result := map[string]interface{}{
		"cpu_stats":    statsJSON["cpu_stats"],
		"memory_stats": statsJSON["memory_stats"],
		"read":         statsJSON["read"],
	}

	// Calculate CPU percentage
	if cpuStats, ok := statsJSON["cpu_stats"].(map[string]interface{}); ok {
		if preCPU, ok := statsJSON["precpu_stats"].(map[string]interface{}); ok {
			cpuUsage := getNestedFloat(cpuStats, "cpu_usage", "total_usage")
			preCPUUsage := getNestedFloat(preCPU, "cpu_usage", "total_usage")
			systemUsage := getNestedFloat(cpuStats, "system_cpu_usage")
			preSystemUsage := getNestedFloat(preCPU, "system_cpu_usage")

			cpuDelta := cpuUsage - preCPUUsage
			systemDelta := systemUsage - preSystemUsage
			if systemDelta > 0 {
				result["cpu_percent"] = (cpuDelta / systemDelta) * 100.0
			}
		}
	}

	// Calculate memory percentage
	if memStats, ok := statsJSON["memory_stats"].(map[string]interface{}); ok {
		usage, _ := memStats["usage"].(float64)
		limit, _ := memStats["limit"].(float64)
		if limit > 0 {
			result["memory_usage_mb"] = usage / 1024 / 1024
			result["memory_limit_mb"] = limit / 1024 / 1024
			result["memory_percent"] = (usage / limit) * 100.0
		}
	}

	return result, nil
}

func getNestedFloat(m map[string]interface{}, keys ...string) float64 {
	current := m
	for i, key := range keys {
		if i == len(keys)-1 {
			if v, ok := current[key].(float64); ok {
				return v
			}
			return 0
		}
		if nested, ok := current[key].(map[string]interface{}); ok {
			current = nested
		} else {
			return 0
		}
	}
	return 0
}

// Ping checks if Docker daemon is reachable.
func (s *ContainerService) Ping(ctx context.Context) error {
	_, err := s.cli.Ping(ctx)
	return err
}

// Close closes the Docker client.
func (s *ContainerService) Close() {
	if err := s.cli.Close(); err != nil {
		log.Printf("failed to close Docker client: %v", err)
	}
}
