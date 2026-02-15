# 🚀 AiAgenz Deployment Guide

## Architecture

```
User → https://aiagenz.cloud → Cloudflare (SSL) → VPS:80 → Nginx
  ├── /          → Frontend  (127.0.0.1:3010)
  ├── /api/      → Backend   (127.0.0.1:4001)
  ├── /ws/       → WebSocket (127.0.0.1:4001)
  └── /health    → Backend   (127.0.0.1:4001)
```

## Prerequisites

- VPS with Docker & Docker Compose installed
- Domain `aiagenz.cloud` pointing to VPS IP via Cloudflare DNS (Proxy ON)
- Nginx installed on VPS (`sudo apt install nginx`)

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
# Check all containers are running
docker compose ps

# Test backend health
curl http://localhost:4001/health

# Test frontend
curl -I http://localhost:3010
```

---

## Step 3: Setup Nginx

```bash
# Copy config
sudo cp nginx/aiagenz.cloud.conf /etc/nginx/sites-available/aiagenz.cloud

# Enable site
sudo ln -sf /etc/nginx/sites-available/aiagenz.cloud /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

Verify:
```bash
curl -I http://localhost/health
# Should return 200 OK
```

---

## Step 4: Cloudflare DNS

1. Go to Cloudflare Dashboard → `aiagenz.cloud` → DNS
2. Add **A Record**:
   | Type | Name | Content | Proxy |
   |------|------|---------|-------|
   | A    | @    | YOUR_VPS_IP | ✅ Proxied |
   | A    | www  | YOUR_VPS_IP | ✅ Proxied |

3. Go to **SSL/TLS** → Set mode to **Full**
4. Go to **SSL/TLS → Edge Certificates** → Enable **Always Use HTTPS**

---

## Step 5: Verify

```bash
# From your machine (not VPS)
curl https://aiagenz.cloud/health
```

Open `https://aiagenz.cloud` in browser — should see the dashboard.

---

## Updating

```bash
cd /opt/aiagenz
git pull
docker compose up -d --build
```

---

## Firewall

Only these ports need to be open:
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Cloudflare → Nginx)
sudo ufw allow 443/tcp   # HTTPS (Cloudflare → Nginx)
sudo ufw enable
```

> ⚠️ Port 4001 and 3010 do **NOT** need to be open — Nginx proxies internally.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 502 Bad Gateway | Backend not running: `docker compose logs backend` |
| WebSocket Error | Check Nginx logs: `tail -f /var/log/nginx/error.log` |
| CORS Error | Add domain to `CORS_ORIGINS` in `backend-go/.env` |
| SSL Error | Cloudflare SSL mode must be **Full** (not Flexible) |
