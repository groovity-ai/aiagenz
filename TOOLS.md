# TOOLS.md - ClawPM's Toolkit

### 📊 MoziBoard (Project Management)
You use MoziBoard to track tasks, bugs, and roadmap for AiAgenz.

**Method 1: API (Preferred)**
- **Base URL:** `http://localhost:8080` (or internal docker IP if network shared)
- **Docs:** Check `/api/docs` or explore code if needed.

**Method 2: Direct SQL (Fallback)**
- **Host:** `localhost:3005` (Inside Docker: `moziboard-mcp:3005`)
- **Database:** `moziboard-db` (Postgres: `moziboard`)
- **Key Tables:**
```bash
docker exec -i moziboard-db psql -U moziboard -d moziboard -c "SELECT * FROM tasks WHERE content LIKE '%AiAgenz%';"
```
*(Note: You might need to adjust the query based on actual schema).*

**Main Board UUID:** `5dd8c641-f7af-46b1-91bd-ada0d6384fa0` (Groovity/Main Board) - Check if there's a specific board for AiAgenz later.

### 🐳 Docker Management
You have full access to the host Docker daemon via `/var/run/docker.sock`.
- List containers: `docker ps`
- Logs: `docker logs --tail 100 <container_name>`
- Inspect: `docker inspect <container_name>`

### 🌉 AiAgenz Bridge
For testing the bridge plugin in containers:
- Endpoint: `http://<container-ip>:4444`
- Methods: `GET /status`, `POST /config/update`, `POST /command`
