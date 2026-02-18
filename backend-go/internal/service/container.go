package service

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"path/filepath"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/docker/go-connections/nat"
)

// ContainerService wraps the Docker SDK for container operations.
type ContainerService struct {
	cli *client.Client
}

// ContainerInfo holds the runtime status of a container.
type ContainerInfo struct {
	Status     string `json:"status"`
	Uptime     string `json:"uptime,omitempty"`
	IP         string `json:"ip,omitempty"`
	BridgePort string `json:"bridgePort,omitempty"` // Host-mapped port for Bridge plugin
}

const (
	NetworkName    = "aiagenz-network"
	BridgeContPort = "4444/tcp" // Bridge plugin port inside container
)

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

	ip := ""
	if info.NetworkSettings != nil && info.NetworkSettings.Networks != nil {
		if net, ok := info.NetworkSettings.Networks[NetworkName]; ok {
			ip = net.IPAddress
		}
	}

	// Extract host-mapped Bridge port
	bridgePort := ""
	if info.NetworkSettings != nil && info.NetworkSettings.Ports != nil {
		if bindings, ok := info.NetworkSettings.Ports[nat.Port(BridgeContPort)]; ok && len(bindings) > 0 {
			bridgePort = bindings[0].HostPort
		}
	}

	return &ContainerInfo{
		Status:     info.State.Status,
		Uptime:     info.State.StartedAt,
		IP:         ip,
		BridgePort: bridgePort,
	}, nil
}

// ContainerResources defines resource limits for a container.
type ContainerResources struct {
	MemoryMB int64   // Memory limit in MB
	CPU      float64 // CPU count (e.g. 0.5, 1, 2)
}

// Create creates a new container with gVisor runtime and plan-based resources.
// Also mounts a persistent volume and exposes Bridge port for host access.
func (s *ContainerService) Create(ctx context.Context, name, image string, env []string, resources ContainerResources, volumeName string) (string, error) {
	memoryBytes := resources.MemoryMB * 1024 * 1024
	memoryReservation := memoryBytes / 2 // 50% soft guarantee
	nanoCPUs := int64(resources.CPU * 1e9)

	// Inject NODE_OPTIONS to prevent JS heap OOM
	nodeHeapMB := resources.MemoryMB * 3 / 4
	env = append(env, fmt.Sprintf("NODE_OPTIONS=--max-old-space-size=%d", nodeHeapMB))

	// Sanitize hostname (Docker doesn't like spaces or special chars in hostname)
	hostname := name

	// Bridge port mapping: container:4444 → host:auto (bound to 127.0.0.1)
	bridgePort := nat.Port(BridgeContPort)
	exposedPorts := nat.PortSet{
		bridgePort: struct{}{},
	}
	portBindings := nat.PortMap{
		bridgePort: []nat.PortBinding{
			{HostIP: "127.0.0.1", HostPort: ""}, // empty = Docker auto-assigns
		},
	}

	hostConfig := &container.HostConfig{
		Runtime:    "runsc",
		AutoRemove: false,
		Resources: container.Resources{
			Memory:            memoryBytes,
			MemoryReservation: memoryReservation,
			NanoCPUs:          nanoCPUs,
		},
		RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyUnlessStopped},
		NetworkMode:   container.NetworkMode(NetworkName),
		PortBindings:  portBindings,
	}

	// Mount persistent volume if provided
	if volumeName != "" {
		hostConfig.Binds = []string{fmt.Sprintf("%s:/home/node/.openclaw", volumeName)}
	}

	resp, err := s.cli.ContainerCreate(ctx,
		&container.Config{
			Image:        image,
			Env:          env,
			Hostname:     hostname,
			ExposedPorts: exposedPorts,
		},
		hostConfig,
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
// Uses a 30-second timeout to prevent hanging processes from blocking HTTP requests.
func (s *ContainerService) ExecCommand(ctx context.Context, containerID string, cmd []string) (string, error) {
	// IMP-1: Add timeout to prevent indefinite hangs
	execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		User:         "node",
		WorkingDir:   "/home/node",
		Env:          []string{"HOME=/home/node", "OPENCLAW_STATE_DIR=/home/node/.openclaw"},
	}
	respID, err := s.cli.ContainerExecCreate(execCtx, containerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("failed to create exec: %w", err)
	}

	resp, err := s.cli.ContainerExecAttach(execCtx, respID.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to attach to exec: %w", err)
	}
	defer resp.Close()

	// Read output using stdcopy (demultiplex)
	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, resp.Reader); err != nil {
		return "", fmt.Errorf("failed to read output: %w", err)
	}

	// BUG-2 FIX: Check exit code instead of treating all stderr as error.
	// Many CLI tools write warnings/info to stderr even on success.
	inspectResp, err := s.cli.ContainerExecInspect(execCtx, respID.ID)
	if err != nil {
		// Fallback: if we can't inspect, use stderr as indicator
		if stderr.Len() > 0 && stdout.Len() == 0 {
			return "", fmt.Errorf("command failed: %s", stderr.String())
		}
		return stdout.String(), nil
	}

	if inspectResp.ExitCode != 0 {
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = stdout.String()
		}
		return "", fmt.Errorf("command exited with code %d: %s", inspectResp.ExitCode, errMsg)
	}

	return stdout.String(), nil
}

// ExecCommandWithStdin runs a command inside a container and pipes stdinData to its stdin.
// Used for writing files safely without shell interpolation.
func (s *ContainerService) ExecCommandWithStdin(ctx context.Context, containerID string, cmd []string, stdinData string) error {
	execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		User:         "node",
		WorkingDir:   "/home/node",
		Env:          []string{"HOME=/home/node", "OPENCLAW_STATE_DIR=/home/node/.openclaw"},
	}
	respID, err := s.cli.ContainerExecCreate(execCtx, containerID, execConfig)
	if err != nil {
		return fmt.Errorf("failed to create exec: %w", err)
	}

	resp, err := s.cli.ContainerExecAttach(execCtx, respID.ID, container.ExecStartOptions{})
	if err != nil {
		return fmt.Errorf("failed to attach to exec: %w", err)
	}
	defer resp.Close()

	// Write stdin data
	if _, err := io.WriteString(resp.Conn, stdinData); err != nil {
		return fmt.Errorf("failed to write stdin: %w", err)
	}
	// Close write side to signal EOF
	resp.CloseWrite()

	// Drain output
	var stdout, stderr bytes.Buffer
	_, _ = stdcopy.StdCopy(&stdout, &stderr, resp.Reader)

	// Check exit code
	inspectResp, err := s.cli.ContainerExecInspect(execCtx, respID.ID)
	if err == nil && inspectResp.ExitCode != 0 {
		return fmt.Errorf("command exited with code %d: %s", inspectResp.ExitCode, stderr.String())
	}

	return nil
}

// ExecCommandWithTimeout runs a command with a custom timeout.
// Returns whatever stdout was captured, even if the command times out.
// Useful for interactive CLI commands that print output then block waiting for input.
func (s *ContainerService) ExecCommandWithTimeout(ctx context.Context, containerID string, cmd []string, timeout time.Duration) (string, error) {
	execCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		User:         "node",
		WorkingDir:   "/home/node",
		Env:          []string{"HOME=/home/node", "OPENCLAW_STATE_DIR=/home/node/.openclaw"},
	}
	respID, err := s.cli.ContainerExecCreate(execCtx, containerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("failed to create exec: %w", err)
	}

	resp, err := s.cli.ContainerExecAttach(execCtx, respID.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to attach to exec: %w", err)
	}
	defer resp.Close()

	// Read output — will return partial output if context times out
	var stdout, stderr bytes.Buffer
	_, _ = stdcopy.StdCopy(&stdout, &stderr, resp.Reader)

	// If we got some stdout, return it even on timeout
	output := stdout.String()
	if output == "" && stderr.Len() > 0 {
		output = stderr.String()
	}

	return output, nil
}

// ExecCommandWithStdinAndOutput runs a command, pipes stdinData to its stdin, and returns stdout.
// Used for completing interactive flows (e.g., OAuth callback submission).
func (s *ContainerService) ExecCommandWithStdinAndOutput(ctx context.Context, containerID string, cmd []string, stdinData string) (string, error) {
	execCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		User:         "node",
		WorkingDir:   "/home/node",
		Env:          []string{"HOME=/home/node", "OPENCLAW_STATE_DIR=/home/node/.openclaw"},
	}
	respID, err := s.cli.ContainerExecCreate(execCtx, containerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("failed to create exec: %w", err)
	}

	resp, err := s.cli.ContainerExecAttach(execCtx, respID.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to attach to exec: %w", err)
	}
	defer resp.Close()

	// Write stdin data
	if _, err := io.WriteString(resp.Conn, stdinData+"\n"); err != nil {
		return "", fmt.Errorf("failed to write stdin: %w", err)
	}
	resp.CloseWrite()

	// Read output
	var stdout, stderr bytes.Buffer
	_, _ = stdcopy.StdCopy(&stdout, &stderr, resp.Reader)

	// Check exit code
	inspectResp, err := s.cli.ContainerExecInspect(execCtx, respID.ID)
	if err == nil && inspectResp.ExitCode != 0 {
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = stdout.String()
		}
		return "", fmt.Errorf("command exited with code %d: %s", inspectResp.ExitCode, errMsg)
	}

	return stdout.String(), nil
}

// ExecAsRoot runs a command as root user.
func (s *ContainerService) ExecAsRoot(ctx context.Context, containerID string, cmd []string) error {
	execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	execConfig := container.ExecOptions{
		Cmd:          cmd,
		User:         "root",
		AttachStdout: true,
		AttachStderr: true,
	}
	respID, err := s.cli.ContainerExecCreate(execCtx, containerID, execConfig)
	if err != nil {
		return fmt.Errorf("failed to create exec: %w", err)
	}

	resp, err := s.cli.ContainerExecAttach(execCtx, respID.ID, container.ExecStartOptions{})
	if err != nil {
		return fmt.Errorf("failed to attach to exec: %w", err)
	}
	defer resp.Close()

	// Wait for completion
	var stdout, stderr bytes.Buffer
	_, _ = stdcopy.StdCopy(&stdout, &stderr, resp.Reader)

	inspectResp, err := s.cli.ContainerExecInspect(execCtx, respID.ID)
	if err == nil && inspectResp.ExitCode != 0 {
		return fmt.Errorf("command exited with code %d: %s", inspectResp.ExitCode, stderr.String())
	}
	return nil
}

// CopyToContainer copies content to a file inside the container.
func (s *ContainerService) CopyToContainer(ctx context.Context, containerID string, destPath string, content []byte) error {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)

	header := &tar.Header{
		Typeflag: tar.TypeReg,
		Name:     path.Base(destPath),
		Mode:     0666,
		Size:     int64(len(content)),
	}
	if err := tw.WriteHeader(header); err != nil {
		return fmt.Errorf("failed to write tar header: %w", err)
	}
	if _, err := tw.Write(content); err != nil {
		return fmt.Errorf("failed to write tar body: %w", err)
	}
	if err := tw.Close(); err != nil {
		return fmt.Errorf("failed to close tar writer: %w", err)
	}

	return s.cli.CopyToContainer(ctx, containerID, path.Dir(destPath), &buf, container.CopyToContainerOptions{})
}

// CopyDirToContainer copies a local directory (recursively) to the container.
func (s *ContainerService) CopyDirToContainer(ctx context.Context, containerID string, srcDir string, destPath string) error {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)

	err := filepath.Walk(srcDir, func(filePath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		// Skip directories (tar handles them implicitly via file paths)
		if info.IsDir() {
			return nil
		}

		// Compute relative path for tar entry
		relPath, err := filepath.Rel(srcDir, filePath)
		if err != nil {
			return err
		}

		content, err := os.ReadFile(filePath)
		if err != nil {
			return err
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = relPath // Relative path preserves subdirectory structure

		if err := tw.WriteHeader(header); err != nil {
			return err
		}
		_, err = tw.Write(content)
		return err
	})
	if err != nil {
		return fmt.Errorf("failed to walk source dir: %w", err)
	}

	if err := tw.Close(); err != nil {
		return err
	}

	return s.cli.CopyToContainer(ctx, containerID, destPath, &buf, container.CopyToContainerOptions{})
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
