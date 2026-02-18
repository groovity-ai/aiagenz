# AiAgenz Architecture Documentation

Documenting the custom infrastructure built to handle OpenClaw integration robustly.

## 🏗️ 1. Custom Agent Image (`aiagenz-agent`)

Instead of using the raw `openclaw-starter` image which has a strict `docker-entrypoint.sh` that overwrites configuration on every restart, we use a custom wrapper image.

- **Source:** `agent-image/Dockerfile`
- **Base:** `openclaw-starter:latest`
- **Modifications:**
  1. **Baked-in Bridge Plugin:** Copies `aiagenz-bridge` plugin to `/app/builtin-extensions`.
  2. **Custom Entrypoint:** Replaces `/usr/local/bin/docker-entrypoint.sh` with our own logic.

### Custom Entrypoint Logic (`agent-image/entrypoint.sh`)
1. **Smart Config Generation:**
   - Checks if `openclaw.json` exists in volume.
   - If **MISSING**: Generates a new config using Env Vars (Initial Setup).
   - If **EXISTS**: Skips generation to preserve user changes (Persistence!).
   *This solves the issue where restarting a container would reset the config.*

2. **Auto-Install Bridge:**
   - Copies `aiagenz-bridge` from `/app/builtin-extensions` to the active volume `extensions` folder on every startup. This ensures the bridge plugin is always available and updated.

## 🌉 2. AiAgenz Bridge Plugin

A custom OpenClaw plugin running inside the agent container to facilitate communication with the Backend.

- **Port:** 4444 (Internal)
- **Functions:**
  - `GET /config`: Read current config.
  - `POST /config/update`: Merge update config (hot reload).
  - `POST /command`: Execute CLI commands (`openclaw agents list`, etc) directly from within the container context.
- **Why?** Docker Exec is slow and prone to hanging in gVisor. HTTP Bridge is instant.

## ⚙️ 3. Backend Logic (`backend-go`)

### Create Project Flow
1. **Env Var Injection:** Backend injects `OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN` and other secrets into Env Vars.
2. **Container Create:** Uses image `aiagenz-agent:latest`.
3. **Startup:** Container starts -> Custom Entrypoint sees no config -> Generates config from Env Vars -> Token is persisted!

### Update Config Flow
1. **Strategy:** **Recreate Container**.
   - Since Env Vars are immutable in Docker, to update critical config (Token/Model) reliably, we must recreate the container with new Env Vars.
   - Volume is preserved (`aiagenz-data-<id>`), so Memory/Sessions are safe.
   - This aligns with the "Smart Entrypoint" logic (Env Vars are the source of truth for base config).

### Fallback
For non-critical config updates, Backend attempts to use the **Bridge Plugin API** to update config without restart. If Bridge fails, it falls back to **File Copy + Restart**.

## 🚀 How to Build & Deploy

Since we use a custom image, you must build it before running the backend.

```bash
# Build custom agent image + backend
docker compose build

# Run
docker compose up -d
```

The `docker-compose.yml` includes an `agent-image` service specifically to build and tag `aiagenz-agent:latest` locally.
