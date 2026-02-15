# DEBUG REPORT: AiAgenz gVisor Network Issue 🚨

**Date:** 2026-02-15
**Status:** 90% Complete (Backend/Frontend Ready), but Agent Network Fails inside gVisor.

## 🏗️ Architecture State
- **Frontend:** Next.js 14 (App Router) + Shadcn UI. Running on port `3010`.
- **Backend:** Go (Chi Router) + PostgreSQL. Running on port `4001`.
- **Infrastructure:** Docker containers managed by Backend via `dockerode`.
- **Security:** `runsc` (gVisor) runtime for isolation.

## 🐛 The Critical Issue
Newly deployed agents (`openclaw-starter:latest` running in `gVisor`) fail to connect to Telegram API.

**Error Log (Inside Container):**
```
[telegram] deleteMyCommands failed: Network request for 'deleteMyCommands' failed!
TypeError: fetch failed
    at node:internal/deps/undici/undici:14902:13
```

**Symptoms:**
1.  Agent starts successfully (Gateway listening).
2.  Config is injected correctly (Token, Model Gemini Flash).
3.  BUT outbound HTTPS requests to `api.telegram.org` fail immediately.

## 🧪 Investigation Findings
1.  **Curl Test (Inside Container):**
    - `curl -v http://1.1.1.1` -> **SUCCESS** (Network connectivity exists).
    - `curl -I https://api.telegram.org` -> **FAIL** (`Could not resolve host`).
2.  **DNS Issue:**
    - gVisor seems to have trouble with DNS resolution, even though we force DNS servers.
3.  **IPv6 Issue:**
    - VPS/Docker network has no IPv6. Node.js prefers IPv6.
    - We patched this with `NODE_OPTIONS=--dns-result-order=ipv4first`.
    - **Result:** Still fails.

## 🛠️ Attempts Made (What Didn't Work)
1.  **Forced DNS in Docker Config:**
    - Set `DNS: []string{"103.246.107.10", "8.8.8.8"}` in `internal/service/container.go`.
    - Result: `curl` still can't resolve host.
2.  **Forced IPv4 in Node.js:**
    - Injected `NODE_OPTIONS` via `docker-entrypoint.sh` and Backend.
    - Result: Error persists (`fetch failed`).
3.  **Clean Image Rebuild:**
    - Rebuilt `openclaw-starter` from scratch (FROM ghcr.io/openclaw/openclaw:latest).
    - Config generation works, but network fails.

## 📋 Recommended Next Steps (For Next Agent)
1.  **Debug gVisor Network Config:**
    - Check `/etc/docker/daemon.json`. Is `runsc` configured with `--network=host` or specific net stack?
    - Try running container with `--network=host` (bypass gVisor net stack) to confirm if it's a gVisor issue or Docker issue.
2.  **Inspect `/etc/resolv.conf` in Container:**
    - Does it actually contain `8.8.8.8`? Or is it overwritten by gVisor?
3.  **Try `sysctl` Patch:**
    - Run container with `--sysctl net.ipv4.ping_group_range="0 2147483647"`.
4.  **Fallback to `runc`:**
    - If gVisor network is fundamentally broken on this VPS, try creating a container with `Runtime: ""` (standard Docker) to confirm functionality. If that works, the issue is 100% gVisor networking.

## 📦 Repository State
- **Backend Go:** Fully functional (API, DB, Docker Control).
- **Frontend:** Fully functional (Dashboard, Auth, Logs, Console).
- **Docker Image:** `openclaw-starter` built & ready.
