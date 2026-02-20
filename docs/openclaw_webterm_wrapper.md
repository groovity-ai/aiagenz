# OpenClaw WebTerm Wrapper Optimization

## Background

AiAgenz provides a Web Terminal (WebTerm) powered by `ttyd` that allows users to access the `shell` inside their running OpenClaw agent containers. This allows users to execute `openclaw` CLI commands directly against their isolated agent environments.

## The Problem: VPS OOM (Out of Memory) & Disconnects

Users reported that executing the `openclaw` command inside the WebTerm on a VPS was extremely slow, often resulting in the WebTerm hanging and eventually disconnecting.

**Root Cause Analysis:**
1. **Node.js Cold Boot & V8 Overhead:** The OpenClaw CLI is written in Node.js. Running the `openclaw` command spawns a completely new instance of the V8 JavaScript engine.
2. **NPM Overhead:** Executing global NPM binaries involves package and dependency resolution overhead, resulting in heavy file I/O operations.
3. **Memory Limits:** On a small VPS (e.g., 1GB or 2GB RAM), the container is already running the `Gateway` engine. Spawning a second, unconstrained V8 instance for the CLI can spike memory usage beyond the container or host limits, triggering the Linux OOM Killer. This terminates the `ttyd` or `node` process, appearing as a WebTerm disconnect.

## The Solution: The Wrapper Script

To solve this, we inject a lightweight wrapper script into `/usr/local/bin/openclaw` during container initialization (via `entrypoint.sh`).

### How It Works

**1. Path Priority Interception (`$PATH`)**
Linux resolves executable commands by checking directories in the `$PATH` environment variable in order. `/usr/local/bin` has a higher priority than the typical NPM global `bin` installation path.
When a user types `openclaw`, Linux discovers our wrapper at `/usr/local/bin/openclaw` first and executes it, completely bypassing the heavy `npm`/`npx` resolution layer.

**2. Direct Execution**
Instead of relying on the NPM bin symlink, the wrapper executes the core OpenClaw entrypoint directly:
`exec node /app/openclaw.mjs "$@"`
Using `exec` replaces the current shell process with the Node process, saving process tree overhead.

**3. V8 Memory Constraints**
The wrapper forcibly restricts the V8 engine's memory allocation for the CLI command:
`export NODE_OPTIONS="--max-old-space-size=128"`
This guarantees that the CLI process will not consume more than ~128MB of RAM, preventing it from exhausting the VPS memory and triggering OOM kills.

### The Wrapper Code

*(injected via `/agent-image/entrypoint.sh`)*

```bash
#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=128"
exec node /app/openclaw.mjs "$@"
```

## Summary

This optimization drastically reduces the cold boot time and memory footprint of executing `openclaw` commands inside the WebTerm, providing a stable and responsive experience even on constrained 1GB RAM virtual private servers.
