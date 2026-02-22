# AiAgenz 🤖🚀

**The All-in-One AI Agent Hosting Platform (PaaS).**

Deploy, manage, and monetize autonomous AI agents with ease. Securely sandboxed with **gVisor**, powered by a production-grade **Go** backend and **Next.js** frontend.

---

## 🌟 Architecture & Strategy

### 1. **Core Philosophy**
*   **Serverless Feel:** User deploys agents without managing servers.
*   **Security First:** Every agent runs in **gVisor (`runsc`)** sandbox. Kernel-level isolation.
*   **One Project = One Container:** Simple scaling, dedicated resources per bot.
*   **Stateful Monitoring:** Real-time CPU/RAM usage tracking (Delta calculation).

### 2. **Security Model (IP Protection)**
*   **Starter Mode (Dev):**
    *   **Image:** `openclaw-starter:latest` (Node.js/JS Source).
    *   **Console:** ENABLED. User has full root access to debug/code inside container.
    *   **Risk:** Code is visible to user.
*   **SaaS/Premium Mode (Future):**
    *   **Image:** `sahabatcuan:latest` (Compiled Binary/Obfuscated).
    *   **Console:** DISABLED. User only interacts via UI Settings.
    *   **Benefit:** Protects proprietary algorithms (Trading Strategy, etc).

---

## 🛠️ Technical Implementation Details (Must Read!)

### 1. **Frontend (Next.js 14)**
*   **SSR Handling:** Components using browser APIs (e.g., `xterm.js` for Console) MUST utilize `dynamic(..., { ssr: false })` to prevent `ReferenceError: self is not defined` crashes on server side.
*   **API Proxy:** Next.js acts as **BFF (Backend for Frontend)**. Browser -> Next.js (`/api/*`) -> Backend Go (`http://aiagenz-backend:4001`).
    *   **Reason:** Handles Auth Token injection via HttpOnly Cookie securely.
*   **Cookie Security:**
    *   Cookies are set with `SameSite=Lax`.
    *   `Secure` flag is dynamic based on `X-Forwarded-Proto` header from Nginx (Required for Cloudflare/SSL).

### 2. **Backend (Go + Chi)**
*   **Container Management:** Uses Docker SDK to spawn containers attached to `aiagenz-network`.
*   **Env Injection Logic:**
    *   **Telegram:** If token is empty, injects `OPENCLAW_CHANNELS_TELEGRAM_ENABLED=false` AND clears default token env var.
    *   **Auth Profiles:** Injects API Keys via **JSON String** in `OPENCLAW_AUTH_PROFILES` to bypass flat-env parsing issues in OpenClaw v2.13+.
*   **WebSocket Hijack:** Middleware `Logger` implements `http.Hijacker` interface to allow WebSocket upgrades (Console).
*   **Monitoring:** Collects stats via Docker API (Snapshot) and calculates **Delta** in-memory to get accurate CPU % per minute.

### 3. **Infrastructure (Docker Compose)**
*   **Networking:**
    *   Frontend accesses Backend via Internal DNS: `http://aiagenz-backend:4001` (Container Name).
    *   Nginx Proxy accesses Frontend via Gateway IP: `http://172.17.0.1:3010`.
*   **Nginx Proxy:**
    *   **SSL:** LetsEncrypt (`certbot`) + Cloudflare Proxy.
    *   **Routing:**
        *   `/api/auth/session` -> **Frontend** (Next.js handles session cookie).
        *   `/api/` -> **Backend** (Direct API access).
        *   `/` -> **Frontend**.
    *   **Headers:** Passes `X-Forwarded-Proto $scheme` to downstream for SSL detection.

---

## 🚀 Deployment & Maintenance Cheat Sheet

### 1. Update Agent Engine (`agent-image`)
When OpenClaw releases a new version or if you update `agent-image/entrypoint.sh` or the bridge plugin:
```bash
cd ~/aiagenz

# Option A: Rebuild local changes only (faster, uses cached base image)
docker compose --profile manual build agent-image

# Option B: Pull the latest OpenClaw base engine AND rebuild
docker compose --profile manual build --pull agent-image
```
*Effect: New projects will use the new engine. Existing projects need Restart.*

### 2. Update Backend/Frontend Code
```bash
cd ~/aiagenz

# Pull latest code
git pull

# Rebuild & Restart Backend (Clean Build)
docker compose build --no-cache backend
docker compose up -d backend

# Rebuild & Restart Frontend
docker compose build --no-cache frontend
docker compose up -d frontend
```

### 3. Update Nginx Config / SSL
```bash
# 1. Edit config
nano ~/nginx-proxy/conf.d/aiagenz.cloud.conf

# 2. Test & Reload
docker exec nginx-proxy nginx -t
docker exec nginx-proxy nginx -s reload

# 3. Renew SSL (if needed)
docker run --rm -it \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/www/certbot:/var/www/certbot \
  certbot/certbot renew
```

---

## 📂 File Locations

| Component | Path | Description |
|-----------|------|-------------|
| **Project Root** | `~/aiagenz` | Backend & Frontend Source |
| **Agent Image** | `~/aiagenz/agent-image` | Dockerfile & Entrypoint for dynamic agent image |
| **Nginx Proxy** | `~/nginx-proxy` | Docker Compose for Nginx + Certbot |
| **Nginx Conf** | `~/nginx-proxy/conf.d/` | Virtual Host Configs (`aiagenz.cloud.conf`) |
| **SSL Certs** | `/etc/letsencrypt/live` | Symlinks to active certs |

---

## 🐛 Troubleshooting Guide

**1. Error 500 on Project Detail**
*   **Check:** Is Backend container running? (`docker ps`)
*   **Check:** Is `metrics` table created? (Check Backend logs for "relation metrics does not exist").
*   **Check:** Is Frontend fetching the right Backend URL? (Check `docker-compose.yml` -> `BACKEND_URL`).

**2. Error 401 Unauthorized (After Login)**
*   **Check:** Are cookies being sent? (DevTools -> Network).
*   **Check:** Is Cookie `Secure`? If accessing via HTTPS, cookie MUST be secure. Check `X-Forwarded-Proto` header in Nginx config.
*   **Check:** Does `route.ts` proxy to Backend correctly?

**3. Console "Connection Closed"**
*   **Check:** Backend logs: "WebSocket upgrade failed"?
*   **Fix:** Ensure Backend Middleware supports `http.Hijacker`.
*   **Check:** Nginx `Upgrade` headers configuration.

**4. Telegram "Configured Automatically" (Log)**
*   **Ignore:** This is cosmetic if `OPENCLAW_CHANNELS_TELEGRAM_ENABLED=false` is set.
*   **Verify:** Check if bot actually responds. If token is empty/invalid, plugin will fail silently or log error, which is expected.

---

Made with ❤️ by **Mozi & Mirza**.
