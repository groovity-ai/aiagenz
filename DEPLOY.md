# 🚀 AiAgenz Deployment Guide

## Architecture

```
User → https://aiagenz.cloud → Cloudflare (SSL) → VPS:80 → Nginx (Docker)
  ├── /          → Frontend  (host:3010)
  ├── /api/      → Backend   (host:4001)
  ├── /ws/       → WebSocket (host:4001)
  └── /health    → Backend   (host:4001)
```

## Prerequisites

- VPS with Docker & Docker Compose installed
- Domain `aiagenz.cloud` pointing to VPS IP via Cloudflare DNS (Proxy ON)

---

## Step 1: Clone & Configure

```bash
cd /opt
git clone https://github.com/groovity-ai/aiagenz.git
cd aiagenz
```

### Backend `.env`

```bash
cp backend-go/.env.example backend-go/.env
nano backend-go/.env
```

> **Required values:**
> ```env
> PORT=4001
> JWT_SECRET=your-random-secret-at-least-32-chars
> DATABASE_URL=postgres://aiagenz:rahasia_bos@aiagenz-db:5432/aiagenz?sslmode=disable
> ENCRYPTION_KEY=your-32-byte-encryption-key-here
> CORS_ORIGINS=https://aiagenz.cloud,http://localhost:3010
> ADMIN_EMAIL=admin@aiagenz.cloud
> ADMIN_PASSWORD=your-secure-admin-password
> ```

### Root `.env`

```bash
cp .env.example .env
nano .env
```

> ```env
> NEXT_PUBLIC_SUPABASE_URL=https://api.groovity.id
> NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
> ```

---

## Step 2: Start Services

```bash
docker compose up -d --build
```

Verify:
```bash
docker compose ps
curl http://localhost:4001/health
curl -I http://localhost:3010
```

---

## Step 3: Setup Nginx (Docker)

Nginx runs in a **separate** Docker container via `docker-compose.nginx.yml`.

```bash
docker compose -f docker-compose.nginx.yml up -d
```

Verify:
```bash
curl -I http://localhost
```

---

## Step 4: SSL (Certbot in Docker)

```bash
# Request certificate
docker compose -f docker-compose.nginx.yml run --rm certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  -d aiagenz.cloud -d www.aiagenz.cloud

# Reload Nginx to pick up new certs
docker compose -f docker-compose.nginx.yml exec nginx nginx -s reload
```

---

## Step 5: Cloudflare DNS

1. Go to Cloudflare Dashboard → `aiagenz.cloud` → DNS
2. Add **A Record**:
   | Type | Name | Content | Proxy |
   |------|------|---------|-------|
   | A    | @    | YOUR_VPS_IP | ✅ Proxied |
   | A    | www  | YOUR_VPS_IP | ✅ Proxied |

3. **SSL/TLS** → Mode = **Full**
4. **SSL/TLS → Edge Certificates** → Enable **Always Use HTTPS**

---

## Step 6: Verify

```bash
curl https://aiagenz.cloud/health
```

Open `https://aiagenz.cloud` in browser.

---

## Updating

```bash
cd /opt/aiagenz
git pull
docker compose up -d --build

# If Nginx config changed:
docker compose -f docker-compose.nginx.yml up -d
```

---

## Performance Optimization

If the site feels sluggish behind Cloudflare:

### 1. Cloudflare Dashboard Settings
- **Speed → Optimization → Content Optimization**: 
  - Enable **Brotli**
  - Enable **Rocket Loader** (improves JS loading)
  - Enable **Auto Minify** (HTML, CSS, JS)
- **Speed → Optimization → Protocols**:
  - Enable **HTTP/3 (with QUIC)**
  - Enable **0-RTT Connection Resumption**
- **Caching → Configuration**:
  - Set **Browser Cache TTL** to 1 month

### 2. Nginx Optimizations (Included in config)
- **Gzip Compression**: Compresses text/json before sending to Cloudflare
- **Proxy Buffering**: Optimized for larger API responses
- **Static Asset Caching**: `expires 1y` for images and scripts

---

## Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Cloudflare → Nginx)
sudo ufw allow 443/tcp   # HTTPS (Cloudflare → Nginx)
sudo ufw enable
```

> ⚠️ Port 4001 and 3010 do **NOT** need to be open — Nginx proxies internally.

---

## Troubleshooting

### Quick Reference

| Symptom | Fix |
|---------|-----|
| 502 Bad Gateway | Backend not running: `docker compose logs backend` |
| WebSocket Error | Check: `tail -f /var/log/nginx/error.log` |
| CORS Error | Add domain to `CORS_ORIGINS` in `backend-go/.env` |
| SSL Error | Cloudflare SSL mode must be **Full** (not Flexible) |
| 401 after login | See **Auth Cookie + Cloudflare** below |
| Console disconnects | Backend `WriteTimeout` must be 0 for WebSocket |

---

### Auth Cookie + Cloudflare (401 Unauthorized)

**Problem:** User logs in successfully, but all API calls return 401.

**Root Cause:** Cloudflare terminates SSL, so the internal chain is HTTP:

```
Browser (HTTPS) → Cloudflare (SSL off) → Nginx (HTTP) → Next.js (HTTP)
                                                ↑
                                        $scheme = "http"
```

The JWT cookie is set with `secure: true` (HTTPS-only). Two things break:

1. **Nginx `$scheme`** resolves to `http` → Next.js sees `X-Forwarded-Proto: http`
2. **Next.js** doesn't know the real protocol is HTTPS → cookie may not be stored

**Fix (already applied in codebase):**

| File | Change |
|------|--------|
| `nginx/aiagenz.cloud.conf` | `X-Forwarded-Proto` hardcoded to `https` |
| `session/route.ts` | `secure` flag reads `X-Forwarded-Proto` dynamically |

**If still broken:**
1. Clear cookies for `aiagenz.cloud`
2. Log out → Log in again
3. Verify Nginx has `proxy_set_header X-Forwarded-Proto https;`
4. Verify `CORS_ORIGINS` includes `https://aiagenz.cloud`

---

### WebSocket Console Not Connecting

Console connects via WebSocket through Nginx at `/ws/`.

**Checklist:**
1. Nginx `/ws/` block has `Upgrade` and `Connection "upgrade"` headers
2. `proxy_read_timeout` and `proxy_send_timeout` are `3600s`
3. Backend HTTP server has **no `WriteTimeout`** (WebSocket is long-lived)
4. Port 4001 does NOT need to be exposed — Nginx handles the proxy
