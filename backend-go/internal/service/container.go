package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
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

const NetworkName = "aiagenz-network"

// NewContainerService creates a new Docker client.
func NewContainerService() (*ContainerService, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	svc := &ContainerService{cli: cli}

	// Ensure shared network exists
	if err := svc.ensureNetwork(context.Background()); err != nil {
		log.Printf("⚠️ Failed to ensure network: %v", err)
	}

	return svc, nil
}

// ensureNetwork checks if the shared network exists, creating it if not.
func (s *ContainerService) ensureNetwork(ctx context.Context) error {
	networks, err := s.cli.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return err
	}

	for _, net := range networks {
		if net.Name == NetworkName {
			return nil
		}
	}

	_, err = s.cli.NetworkCreate(ctx, NetworkName, network.CreateOptions{})
	return err
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

	// Inject NODE_OPTIONS to prevent JS heap OOM
	nodeHeapMB := resources.MemoryMB * 3 / 4
	env = append(env, fmt.Sprintf("NODE_OPTIONS=--max-old-space-size=%d", nodeHeapMB))

	// Sanitize hostname (Docker doesn't like spaces or special chars in hostname)
	// We use the container name as hostname for internal DNS
	hostname := name

	resp, err := s.cli.ContainerCreate(ctx,
		&container.Config{
			Image:    image,
			Env:      env,
			Hostname: hostname,
		},
		&container.HostConfig{
			Runtime:    "runsc",
			AutoRemove: false, // Ensure container persists after exit for debugging
			Resources: container.Resources{
				Memory:            memoryBytes,
				MemoryReservation: memoryReservation,
				NanoCPUs:          nanoCPUs,
			},
			RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyUnlessStopped},
			NetworkMode:   container.NetworkMode(NetworkName), // Attach to shared network
			// DNS: handled by Docker's embedded DNS (reachable via gVisor --network=host in daemon.json)
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
		User:         "node",
		WorkingDir:   "/home/node",
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

// ExecCommand runs a command inside a container and returns stdout/stderr.
func (s *ContainerService) ExecCommand(ctx context.Context, containerID string, cmd []string) (string, error) {
	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
	}
	respID, err := s.cli.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("failed to create exec: %w", err)
	}

	resp, err := s.cli.ContainerExecAttach(ctx, respID.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to attach to exec: %w", err)
	}
	defer resp.Close()

	// Read output using stdcopy (demultiplex)
	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, resp.Reader); err != nil {
		return "", fmt.Errorf("failed to read output: %w", err)
	}

	// If command failed (cat failed), return stderr
	if stderr.Len() > 0 {
		return "", fmt.Errorf("command failed: %s", stderr.String())
	}

	return stdout.String(), nil
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
