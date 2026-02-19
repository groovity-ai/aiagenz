# MEMORY.md - AiAgenz Long-Term Memory

## 🏗️ Architecture Overview
- **Platform:** PaaS for hosting OpenClaw agents.
- **Backend:** Go (`backend-go`). Handles project CRUD, Docker orchestration, and Bridge communication.
- **Frontend:** Next.js (`frontend`). Dashboard for users.
- **Agent Runtime:** Custom Docker Image (`aiagenz-agent:latest`) based on `openclaw-starter` but with custom entrypoint and baked-in bridge.

## 📜 History & Decisions

### 2026-02-17: The Persistence & Bridge Overhaul
**Issue:** Telegram Tokens kept disappearing on restart; Bridge plugin connection timeouts.
**Solution:**
1.  **Custom Image:** Created `aiagenz-agent` to bake in `aiagenz-bridge` plugin and replace the aggressive `docker-entrypoint.sh` with a smarter one that respects existing config.
2.  **Env Var Injection:** `Create Project` now injects secrets via Env Vars (`OPENCLAW_CHANNELS_...`) so the initial config generation is valid and accepted by OpenClaw Doctor.
3.  **Bridge Plugin:** Used for runtime config updates (hot reload).
4.  **Fallback Strategy:** If Bridge fails (timeout), Backend falls back to **Recreate Container** (Atomic update via new Env Vars).

### 2026-02-15: Initial Launch Prep
- SSL setup via Nginx/Certbot (`aiagenz.cloud`).
- Fixed Next.js Auth (Secure cookies behind proxy).
- Implemented Delta CPU monitoring.

## ⚠️ Known Issues
- **gVisor Networking:** Direct HTTP communication from Backend to Agent Container (Bridge) on port 4444 is flaky/timeout-prone due to gVisor's network isolation. Current reliable method is **Create with Env Var**.
- **Update Latency:** Updating tokens requires container recreation (10-30s), not instant hot-reload, due to the bridge timeout issue.

## 🔐 Credentials & Secrets
- **Database:** `postgres://aiagenz:rahasia_bos@db:5432/aiagenz`
- **JWT Secret:** Check `.env` in `backend-go`.
- **Master Admin:** `admin@aiagenz.id` / `admin123`.

## 📂 Key Files
- `backend-go/internal/service/project.go`: Core logic for container orchestration.
- `agent-image/entrypoint.sh`: The smart startup script.
- `README_ARCHITECTURE.md`: Deep dive into how everything connects.
