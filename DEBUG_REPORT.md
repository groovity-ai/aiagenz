# AiAgenz Debug Report: Bridge Networking & Config Persistence

**Date:** 2026-02-18
**Status:** Partial Success (Create OK, Update Failed)

## 🚨 Critical Issues

### 1. OpenClaw Doctor Reset
The official `openclaw-starter` image runs a `doctor` script on startup that aggressively resets `openclaw.json` if it detects changes not matching its internal state (likely derived from initial Env Vars).
- **Impact:** Any config file manually injected via `CopyToContainer` gets overwritten/reset on container restart.
- **Workaround:** We switched to **Env Var Injection** (`OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN`) which the Doctor respects.

### 2. Bridge Plugin Timeout (gVisor Networking)
We implemented a Bridge Plugin (HTTP Server on port 4444 inside container) to bypass `docker exec` slowness.
- **Status:** Plugin installs and listens (`[aiagenz-bridge] Control Plane listening on 0.0.0.0:4444`).
- **Issue:** Backend (Go) cannot connect to this port (`context deadline exceeded`).
- **Suspect:** gVisor (`runsc`) network stack isolation prevents direct container-to-container communication on non-exposed ports, or Docker DNS issue in the custom network.

### 3. Update Token Failed (Recreate Logic Bug)
Since Bridge fails, Backend falls back to **Recreating the Container** with new Env Vars (to satisfy Doctor).
- **Issue:** The logic to extract the *new* token from the incoming config map seems to fail.
- **Symptom:** Container is recreated, but Env Var `OPENCLAW_CHANNELS_...` is missing/empty.
- **Code Location:** `backend-go/internal/service/project.go` -> `UpdateRuntimeConfig`.
  ```go
  // Probable bug here: Type assertion or map traversal fails silently
  if channels, ok := configCopy["channels"].(map[string]interface{}); ok { ... }
  ```

## ✅ What Works (Current Stable State)
- **Create Project:** Successfully injects Token via Env Var. Config persists.
- **Custom Image:** `aiagenz-agent:latest` builds and runs correctly with custom entrypoint logic.

## 🛠️ Next Steps for Investigation

1.  **Fix Recreate Logic:**
    - Debug why `telegramToken` extraction in `UpdateRuntimeConfig` returns empty string.
    - Suggestion: Use a robust JSON path library or struct unmarshalling instead of deep map type assertions.

2.  **Debug Bridge Network:**
    - Try running `curl` from *inside* another container on the same network to the agent container IP.
    - Check if `OPENCLAW_GATEWAY_BIND=auto` binds to `127.0.0.1` instead of `0.0.0.0` despite plugin code saying `0.0.0.0`.
    - Consider using **Unix Domain Socket** mounted on volume instead of TCP if gVisor network remains flaky.

3.  **Alternative:**
    - If Recreate logic is fixed, Bridge might not be strictly necessary for Config updates (Recreate is safer for Doctor anyway). Bridge is still useful for CLI commands.
