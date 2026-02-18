# Changelog

All notable changes to the AiAgenz Bridge plugin.

## [1.2.0] - 2026-02-18

### Added
- **`POST /auth/login`** — OAuth login via Bridge (replaces docker exec)
  - Accepts `{ provider: string }`
  - Returns OAuth URL from `openclaw models auth login --no-browser`
- **`POST /auth/callback`** — OAuth callback via Bridge (replaces docker exec + stdin)
  - Accepts `{ provider: string, callbackUrl: string }`
  - Spawns interactive CLI, pipes callback URL to stdin, returns result

### Changed (Backend — `project.go`)
- **`CallBridge`** — 3x retry with 1s/2s backoff for non-`/command` endpoints. Retries on 5xx and connection errors. `/command` stays single-shot
- **`postStartSetup()`** — new consolidated helper for post-start sequence. Used by both `Create` and `UpdateRuntimeConfig` fallback. Sequence: wait container → fix perms → inject auth → `waitForBridge()`
- **`waitForBridge()`** — polls `GET /status` every 2s with 30s max timeout. Replaces brittle `time.Sleep(3s)` + empty config push
- **`buildEnvVars()`** — removed `OPENCLAW_CHANNELS_TELEGRAM_BOTTOKEN` and `OPENCLAW_AGENTS_DEFAULTS_MODEL_PRIMARY` from env vars. Secrets now pushed via `POST /config/update` after container start (prevents `docker inspect` leaks)
- **`validateConfigUpdate()`** — sanity checks before config writes: telegram token min length, valid provider names
- **`OAuthGetURL` / `OAuthSubmitCallback`** — Bridge-first with docker exec fallback
- **Image selection** — reads `project.ImageName` from DB instead of fragile `strings.Contains(name, "sahabatcuan")`
- **Resources** — uses `plan.MemoryMB` from plan instead of hardcoded `2048`
- **Logging** — all `fmt.Printf("⚠️ ...")` replaced with `log.Printf("[INFO/WARN] ...")`

### Changed (Entrypoint — `entrypoint.sh`)
- Config generated **without secrets** — telegram `enabled: false`, `botToken: ""`, no model env var interpolation
- Secrets pushed via Bridge after container starts

### Migration Required
```sql
-- 006_add_image.sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_name TEXT DEFAULT 'aiagenz-agent:latest';
```

### API Endpoints (Complete List)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Health check, uptime, auth profiles, sessions |
| `GET` | `/config` | Full merged config (openclaw.json + auth-profiles) |
| `POST` | `/config/update` | Deep-merge config update + optional SIGHUP reload |
| `POST` | `/auth/add` | Add API key auth profile |
| `POST` | `/auth/login` | **NEW** — Start OAuth flow, returns auth URL |
| `POST` | `/auth/callback` | **NEW** — Submit OAuth callback URL |
| `POST` | `/command` | Execute OpenClaw CLI command |


## [1.1.0] - 2026-02-17

### Added
- **`register(api)`** — OpenClaw Plugin API integration with event hooks
  - Subscribe to `session:start`, `session:end`, `command:new` events
  - Store API reference for future internal access
- **Dynamic config paths** — resolve from `context.workspacePath` instead of hard-coded `/home/node/.openclaw`
- **Live event tracking** in `/status` endpoint:
  - `activeSessions` count (from session events)
  - `recentCommands` ring buffer (last 20, shows last 5 in status)
  - `lastEvent` timestamp and type
  - `startedAt` plugin start time
  - `paths` object showing resolved config/workspace paths
  - `hasApi` flag indicating OpenClaw API availability
- **`openclaw.extensions`** field in `package.json` for proper plugin discovery
- **Query param stripping** in HTTP route matching

### Changed
- **Auth reload** (`POST /auth/add`) — now uses SIGHUP (consistent with `/config/update`)
- **`mergeDeep`** — rewritten as non-mutating recursive merge (fixes source object corruption)

### Fixed
- **Critical JS syntax error** — stray `require('child_process')` inside `handlers` object literal was breaking the entire plugin
- **Missing `execFile` import** — `POST /command` handler used `execFile` but only `exec` was imported

## [1.0.0] - 2026-02-15

### Added
- Initial release
- HTTP Control Plane on port 4444
- `GET /status` — health check and config summary
- `GET /config` — full merged config read
- `POST /config/update` — deep merge config updates with optional reload
- `POST /auth/add` — add auth profiles
- `POST /command` — execute OpenClaw CLI commands
- `POST /restart` — graceful container restart
- Atomic file writes (write to `.tmp` then rename)
- OpenClaw plugin manifest (`openclaw.plugin.json`)
