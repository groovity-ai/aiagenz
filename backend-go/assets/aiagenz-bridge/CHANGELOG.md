# Changelog

All notable changes to the AiAgenz Bridge plugin.

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
