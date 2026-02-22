package main

import (
	"context"
	"fmt"
	"io"
	"log"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

func main() {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatal(err)
	}

	containers, err := cli.ContainerList(context.Background(), container.ListOptions{})
	if err != nil {
		log.Fatal(err)
	}

	var targetID string
	for _, c := range containers {
		for _, name := range c.Names {
			if len(name) > 8 && name[1:8] == "aiagenz" {
				targetID = c.ID
				fmt.Println("Found container:", name)
				break
			}
		}
		if targetID != "" {
			break
		}
	}

	if targetID == "" {
		log.Fatal("No aiagenz container found")
	}

	execConfig := container.ExecOptions{
		Cmd:          []string{"cat", "/app/openclaw.mjs"},
		AttachStdout: true,
		AttachStderr: true,
	}
	resp, err := cli.ContainerExecCreate(context.Background(), targetID, execConfig)
	if err != nil {
		log.Fatal(err)
	}

	attachResp, err := cli.ContainerExecAttach(context.Background(), resp.ID, container.ExecStartOptions{})
	if err != nil {
		log.Fatal(err)
	}
	defer attachResp.Close()

	stdout, _ := io.ReadAll(attachResp.Reader)
	fmt.Println(string(stdout))
}
