package service

import (
	"context"
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

// Create creates a new container with gVisor runtime and resource limits.
func (s *ContainerService) Create(ctx context.Context, name, image string, env []string) (string, error) {
	resp, err := s.cli.ContainerCreate(ctx,
		&container.Config{
			Image: image,
			Env:   env,
		},
		&container.HostConfig{
			Runtime: "runsc",
			Resources: container.Resources{
				Memory:   512 * 1024 * 1024, // 512MB
				NanoCPUs: 500000000,         // 0.5 CPU
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
