# AiAgenz 🤖🚀

**The All-in-One AI Agent Hosting Platform (PaaS).**

Deploy, manage, and monetize autonomous AI agents with ease. Securely sandboxed with **gVisor**, powered by a production-grade **Go** backend.

---

## 🌟 Features

- **1-Click Deploy** — Launch pre-built agents (Trading Bot, CS Bot, etc.) in seconds
- **Secure Sandboxing** — Every agent runs in an isolated Docker container with gVisor (`runsc`)
- **Web Console** — Interactive terminal via xterm.js + WebSocket
- **Live Monitoring** — Real-time CPU & memory usage per container
- **Dark Mode** — Full dark/light theme support
- **Marketplace** — Browse and deploy community-built agents
- **Admin Panel** — User management API (create, list, delete users)
- **Pagination** — Scalable project listing with page controls
- **Toast Notifications** — Rich feedback for all actions (Sonner)
- **Skeleton Loading** — Polished loading states across all pages

---

## 🏗️ Tech Stack

### Frontend (`/frontend`)
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | Shadcn UI + Tailwind CSS |
| Auth | JWT (httpOnly Cookie) |
| Theme | next-themes (dark/light) |
| Notifications | Sonner |
| Icons | Lucide React |
| Console | xterm.js |

### Backend (`/backend-go`)
| Layer | Technology |
|-------|-----------|
| Language | Go 1.23 |
| Router | chi v5 |
| Database | PostgreSQL (pgx v5, raw SQL) |
| Auth | JWT (golang-jwt) + bcrypt |
| Encryption | AES-256-GCM (secrets at rest) |
| Containers | Docker SDK (gVisor runtime) |
| WebSocket | gorilla/websocket |
| Middleware | Rate limiting, CORS, panic recovery, logging |

### Infrastructure
- **Container Engine:** Docker with gVisor (`runsc`)
- **Reverse Proxy:** Nginx / Traefik (production)
- **Deployment:** Dockerfile included (multi-stage build)

---

## 📂 Project Structure

```
aiagenz/
├── backend-go/              # Go API Server
│   ├── cmd/server/          # Entrypoint (main.go)
│   ├── internal/
│   │   ├── config/          # Environment configuration
│   │   ├── domain/          # Models & request/response types
│   │   ├── handler/         # HTTP handlers (auth, project, user, stats)
│   │   ├── middleware/      # Auth, rate limit, admin, recovery, logger
│   │   ├── repository/      # Database queries (pgx)
│   │   ├── service/         # Business logic (auth, project, container)
│   │   └── ws/              # WebSocket console handler
│   ├── pkg/crypto/          # AES-GCM encryption
│   ├── migrations/          # SQL migration files
│   ├── Dockerfile           # Multi-stage production build
│   └── API.md               # API reference documentation
│
├── frontend/                # Next.js Dashboard
│   ├── app/                 # Pages & API proxy routes
│   ├── components/          # UI components (Shadcn + custom)
│   └── middleware.ts        # Auth route protection
│
├── openclaw-starter/        # Docker Image: Basic OpenClaw Agent
└── sahabatcuan/             # Docker Image: Trading Bot
```

---

## 🚀 Getting Started

### Prerequisites
1. **Go 1.23+** installed
2. **Node.js 18+** installed
3. **PostgreSQL** running locally
4. **Docker** installed & running
5. **gVisor** (`runsc`) installed (for production sandboxing)

### 1. Setup Backend
```bash
cd backend-go

# Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY (32 bytes)

# Run server (auto-migrates DB, seeds admin user)
go run ./cmd/server
```

### 2. Setup Frontend
```bash
cd frontend
npm install

# Configure backend URL
echo "BACKEND_URL=http://localhost:4001" > .env.local

# Start dev server
npm run dev
```

### 3. Access Dashboard
Open **http://localhost:3010**

Default admin credentials:
- **Email:** `admin@aiagenz.id`
- **Password:** `admin123`

> ⚠️ Change these in `.env` before deploying to production!

### 4. Build Docker Images (for agent deployment)
```bash
docker build -t openclaw-starter:latest ./openclaw-starter
docker build -t sahabatcuan:latest ./sahabatcuan
```

### 5. Docker Deployment (Backend)
```bash
cd backend-go
docker build -t aiagenz-backend .
docker run -p 4001:4001 --env-file .env aiagenz-backend
```

---

## 🔌 API Reference

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/auth/login` | Login & get JWT | No |
| `POST` | `/api/auth/logout` | Logout | Yes |
| `GET` | `/api/projects?page=1&limit=20` | List projects (paginated) | Yes |
| `POST` | `/api/projects` | Deploy new agent | Yes |
| `GET` | `/api/projects/{id}` | Get project detail | Yes |
| `POST` | `/api/projects/{id}/control` | Start/stop/restart | Yes |
| `DELETE` | `/api/projects/{id}` | Destroy agent | Yes |
| `GET` | `/api/projects/{id}/logs` | Container logs | Yes |
| `GET` | `/api/projects/{id}/stats` | CPU/memory usage | Yes |
| `GET` | `/api/users` | List users | Admin |
| `POST` | `/api/users` | Create user | Admin |
| `DELETE` | `/api/users/{id}` | Delete user | Admin |
| `WS` | `/projects/{id}/console?token=JWT` | Interactive shell | Yes |
| `GET` | `/health` | Health check | No |

Full documentation: [`backend-go/API.md`](backend-go/API.md)

---

## 🛡️ Security

- **gVisor Sandboxing** — All agent containers run with `runsc` runtime
- **AES-256-GCM** — API keys encrypted at rest
- **bcrypt** — Password hashing (cost 10)
- **Rate Limiting** — Per-IP with strict limits on auth endpoints
- **JWT httpOnly Cookies** — XSS-safe token storage
- **Admin Middleware** — User management restricted to admin role
- **API Proxy** — Backend never exposed directly to the internet

---

Made with ❤️ by **Mozi & Mirza**.
