# AiAgenz 🤖🚀
**The All-in-One AI Agent Hosting Platform (PaaS).**

Deploy, manage, and monetize autonomous AI agents with ease. Securely sandboxed with **gVisor**, powered by **OpenClaw**.

---

## 🌟 Features

*   **1-Click Deploy:** Launch pre-built agents (e.g., Trading Bot, CS Bot) in seconds.
*   **Secure Sandboxing:** Every agent runs in an isolated Docker container protected by Google gVisor (`runsc`). No more neighbor noise or security breaches.
*   **Web Console:** Access your agent's terminal directly from the browser (xterm.js + WebSocket).
*   **Marketplace:** Rent high-quality agents built by community developers.
*   **Multi-Tenant:** User isolation, resource limits, and secure API key management.

---

## 🏗️ Tech Stack

### **Frontend (`/frontend`)**
*   **Framework:** Next.js 14 (App Router)
*   **UI Library:** Shadcn UI + Tailwind CSS
*   **Auth:** Custom JWT (Cookie-based session)
*   **Icons:** Lucide React

### **Backend (`/backend`)**
*   **Runtime:** Node.js (Express)
*   **Database:** PostgreSQL (Prisma ORM)
*   **Orchestration:** Dockerode (Docker API)
*   **Realtime:** WebSocket (`ws`) for Console streaming

### **Infrastructure**
*   **Host:** Linux VPS (Ubuntu/Debian)
*   **Container Engine:** Docker
*   **Security Runtime:** gVisor (`runsc`)
*   **Reverse Proxy:** Nginx / Traefik (Recommended for production)

---

## 📂 Project Structure

```bash
aiagenz/
├── frontend/           # Next.js Dashboard
│   ├── app/            # App Router (Pages & API Proxy)
│   ├── components/     # UI Components (Shadcn)
│   └── middleware.ts   # Auth Protection
│
├── backend/            # Express API Server
│   ├── prisma/         # DB Schema & Migrations
│   ├── server.js       # Main Entrypoint
│   └── middleware/     # Auth Logic
│
├── openclaw-starter/   # Docker Image: Basic OpenClaw Agent
└── sahabatcuan/        # Docker Image: Trading Bot Monolith
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites
1.  **Docker** installed & running.
2.  **gVisor (`runsc`)** installed & configured in Docker `daemon.json`.
3.  **Node.js 18+** installed.
4.  **PostgreSQL** running (or Dockerized Postgres).

### 1. Setup Backend
```bash
cd backend
npm install

# Setup Env
cp .env.example .env
# Edit DATABASE_URL & JWT_SECRET

# Migration DB
npx prisma db push

# Start Server (Port 4001)
node server.js
```

### 2. Setup Frontend
```bash
cd frontend
npm install

# Start Next.js (Port 3010)
npm run dev -- -p 3010
```

### 3. Build Docker Images (Required for Deploy)
```bash
# Build Starter Image
docker build -t openclaw-starter:latest ../openclaw-starter

# Build Trading Bot Image
docker build -t sahabatcuan:latest ../sahabatcuan
```

### 4. Access Dashboard
Open `http://localhost:3010` in your browser.
Default Admin: `admin@aiagenz.id` / `admin123`

---

## 🔌 API Reference (Backend)

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Login & Get Token | No |
| `GET` | `/api/projects` | List all projects | Yes |
| `POST` | `/api/projects` | Create/Deploy new agent | Yes |
| `GET` | `/api/projects/:id` | Get project detail | Yes |
| `POST` | `/api/projects/:id/:action` | Control (start/stop/restart) | Yes |
| `DELETE` | `/api/projects/:id` | Destroy agent container | Yes |
| `GET` | `/api/projects/:id/logs` | Fetch container logs | Yes |
| `WS` | `/projects/:id/console` | Interactive Shell WebSocket | Yes |

---

## 🛡️ Security Notes

*   **gVisor is Mandatory:** Do not run untrusted agent code without `runsc` runtime.
*   **Secrets:** API Keys are encrypted/masked in API responses.
*   **Isolation:** Frontend uses Next.js Proxy to hide Backend API from public internet.

---

Made with ❤️ by **Mozi & Mirza**.
