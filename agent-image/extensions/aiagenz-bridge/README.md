# AiAgenz Bridge Plugin

**AiAgenz Bridge** adalah plugin internal (Control Plane) yang berjalan di dalam container OpenClaw. Plugin ini membuka HTTP Server di port `4444` untuk komunikasi **Zero-Latency** antara Backend AiAgenz (Go) dan Runtime OpenClaw (Node.js).

## 🏗️ Arsitektur

```
Backend (Go)  →  HTTP (port 4444)  →  Bridge Plugin (JS)  →  OpenClaw Internal API
                                                           →  File System (openclaw.json)
                                                           →  CLI (openclaw ...)
```

### Kenapa Bridge?
| | Docker Exec (Lama) | Bridge (Sekarang) |
|---|---|---|
| **Latency** | 1-2 detik | < 10ms |
| **Stabilitas** | Rawan hang di gVisor | HTTP stack Node.js mature |
| **Akses Internal** | Tidak bisa | Event hooks, API context |
| **Keamanan** | Shell injection risk | JSON-only, no shell |

## 🔌 Plugin Interface

Bridge menggunakan **hybrid pattern** sesuai OpenClaw best practices:

```javascript
module.exports = {
    // 1. register(api) — akses OpenClaw Plugin API
    register(api) {
        api.on('session:start', ...);
        api.on('command:new', ...);
    },
    
    // 2. activate(context) — start HTTP server
    activate(context) {
        // context.workspacePath → dynamic config paths
        server.listen(4444);
    },
    
    // 3. deactivate() — cleanup
    deactivate() { server.close(); }
};
```

### Plugin Discovery
- `openclaw.plugin.json` — manifest standar OpenClaw
- `package.json` → `openclaw.extensions` field untuk auto-discovery

## � API Reference

Base URL: `http://<container-ip>:4444`

### GET /status
Health check + live event data.

```json
{
  "ok": true,
  "uptime": 120.5,
  "pid": 21,
  "memory": { "rss": 123456 },
  "startedAt": "2026-02-17T...",
  "hasApi": true,
  "activeSessions": 2,
  "recentCommands": [
    { "command": "cli:agents list", "timestamp": "..." }
  ],
  "lastEvent": { "type": "session:start", "at": "..." },
  "summary": {
    "telegram": { "enabled": true, "token": "SET" },
    "auth_profiles": ["google:default"],
    "gateway_port": 3000
  },
  "paths": {
    "config": "/home/node/.openclaw/openclaw.json",
    "workspace": "/home/node/.openclaw"
  }
}
```

### GET /config
Full merged config (`openclaw.json` + `auth-profiles.json`).

### POST /config/update
Deep merge config update. Header `x-reload: true` triggers SIGHUP reload.

```json
{
  "channels": {
    "telegram": {
      "accounts": { "default": { "botToken": "NEW_TOKEN" } }
    }
  }
}
```

### POST /auth/add
Add auth profile to `auth-profiles.json`.

```json
{ "provider": "google", "key": "sk-...", "mode": "api_key" }
```

### POST /command
Execute `openclaw` CLI inside container (30s timeout).

```json
{ "args": ["agents", "list", "--json"] }
```

### POST /restart
Graceful container restart via `process.exit(0)`.

## 🛠️ Deployment

### Plugin Injection (Backend Go)
Saat `ProjectService.Create`:
1. Copy `assets/aiagenz-bridge/` → `/home/node/.openclaw/extensions/aiagenz-bridge/`
2. Inject `openclaw.json` minimal dengan:
   ```json
   { "plugins": { "entries": { "aiagenz-bridge": { "enabled": true } } } }
   ```
3. Fix permission: `chown -R node:node`

### Go Client
```go
resp, err := s.CallBridge(ctx, containerID, "POST", "/config/update", payload)
// Auto-resolves container IP, sets Content-Type, 30s timeout for /command
```

## 🐛 Troubleshooting

| Masalah | Cek |
|---|---|
| Bridge unreachable | Log container: ada `[aiagenz-bridge] Control Plane listening`? |
| No container IP | `docker inspect <id>` → NetworkSettings.IPAddress |
| Plugin not loaded | Cek `openclaw.plugin.json` dan permission folder |
| gVisor networking stuck | Restart container |

> Bridge fallback: jika unreachable, Backend otomatis fallback ke `docker exec`.
