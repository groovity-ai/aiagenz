# AiAgenz API Reference

## Authentication

### POST `/api/auth/login`
Login with email/password, returns JWT token.

```json
// Request
{ "email": "admin@aiagenz.id", "password": "admin123" }

// Response 200
{ "token": "jwt...", "user": { "id": "uuid", "email": "admin@aiagenz.id" } }
```

### POST `/api/auth/logout`
Invalidate session (client-side cookie cleared).
**Requires:** `Authorization: Bearer <token>`

---

## Projects

### GET `/api/projects?page=1&limit=20`
List projects with pagination.
**Requires:** `Authorization: Bearer <token>`

```json
// Response 200
{
  "data": [{ "id": "uuid", "name": "...", "type": "starter", "status": "running", "containerId": "abc123", "createdAt": "..." }],
  "page": 1, "limit": 20, "total": 5, "totalPages": 1
}
```

### POST `/api/projects`
Create and deploy a new agent.
**Requires:** `Authorization: Bearer <token>`

```json
// Request
{ "name": "My Agent", "type": "starter", "telegramToken": "123:ABC", "apiKey": "AIza..." }

// Response 201
{ "success": true, "project": { ... } }
```

### GET `/api/projects/{id}`
Get project details with masked config.

### POST `/api/projects/{id}/control`
Start/stop/restart a container.

```json
{ "action": "start" | "stop" | "restart" }
```

### DELETE `/api/projects/{id}`
Delete project and destroy container.

### GET `/api/projects/{id}/logs`
Get last 100 lines of container logs (text/plain).

### GET `/api/projects/{id}/stats`
Get live CPU/memory usage for running container.

```json
// Response 200
{ "cpu_percent": 2.5, "memory_usage_mb": 128, "memory_limit_mb": 512, "memory_percent": 25.0 }
```

---

## User Management (Admin Only)

### GET `/api/users`
List all users. **Requires:** admin role.

### POST `/api/users`
Create a new user. **Requires:** admin role.

```json
{ "email": "user@example.com", "password": "securepass", "role": "user" }
```

### DELETE `/api/users/{id}`
Delete a user (cannot delete admin). **Requires:** admin role.

---

## WebSocket Console

### `ws://host:4001/projects/{id}/console?token=JWT`
Interactive shell session inside the container. Full-duplex binary WebSocket.

---

## Health Check

### GET `/health`
No auth required.

```json
{ "status": "ok", "database": "ok", "docker": "ok" }
```
