# AiAgenz Changelog

## [Unreleased] — 2026-02-19 — Codebase Security Audit & Fixes

### Security
- **Action Injection Prevention** — `frontend/app/api/projects/[id]/control/route.ts`
  - Added `ALLOWED_ACTIONS` whitelist (`start`, `stop`, `restart`). User input no longer interpolated into URL path.
- **JWT Token Removed from WebSocket URL** — `frontend/components/Console.tsx`
  - Token no longer in `?token=` query param (leaked to logs). Sent as first WS message: `{ type: 'auth', token }`.
- **WebTerm iframe Mixed Content** — `frontend/app/dashboard/project/[id]/page.tsx`
  - Changed `http://` to `//` (protocol-relative) preventing HTTPS mixed-content blocks.
- **Rate Limiter IP Fix** — `backend-go/internal/middleware/ratelimit.go`
  - Added `extractClientIP()` — strips port via `net.SplitHostPort`, respects `X-Real-IP` / `X-Forwarded-For`.

### Added
- **Shared Auth Utility** — `frontend/lib/auth.ts` [NEW]
  - Centralized `getToken()`, replaces duplicates across 11 API route files.
- **Shared Backend URL** — `frontend/lib/api.ts` [NEW]
  - Centralized `BACKEND_URL` / `BACKEND_API`, fixes `localhost:4001` vs `aiagenz-backend:4001` mismatch.
- **TypeScript Interfaces** — `Project` (page.tsx), `CronJob` (AutomationTab.tsx), `Skill` (SkillsTab.tsx).

### Changed
- **API Routes Refactored** — 10 files updated to use shared `lib/auth.ts` + `lib/api.ts`:
  `projects/route.ts`, `[id]/route.ts`, `config/route.ts`, `control/route.ts`, `logs/route.ts`, `models/route.ts`, `stats/route.ts`, `plans/route.ts`, `auth/login/route.ts`.
- **Toast Unified to Sonner** — Replaced DOM-injection `showToast()` with `sonner` `toast()` in 4 files:
  `ConfigTab.tsx`, `AdvancedConfigTab.tsx`, `AutomationTab.tsx`, `SkillsTab.tsx`.

### Fixed
- **Debug Logs Removed** — `frontend/app/api/projects/route.ts` — removed `console.log('[Debug]...')`.
- **Empty Catch Blocks** — Added `console.error()` to silent `catch (e) {}` in `page.tsx`, `AutomationTab.tsx`, `SkillsTab.tsx`.
- **Missing Content-Type** — Added `'Content-Type': 'application/json'` to `handleControl` in `page.tsx`.

### Build Verification
- Frontend: `npx next build` — 24 routes, exit 0 ✅
- Backend: `go build ./...` — no errors ✅

---

## [Unreleased] - 2026-02-16

### Added
- **Backend:** `GET /api/projects/:id/config` endpoint to read `openclaw.json` from running container.
- **Backend:** `PUT /api/projects/:id/config` endpoint to update `openclaw.json` and restart container.
- **Frontend:** New `ConfigTab` component for visual configuration.
- **Frontend:** Refactored Project Detail page to use Tabs (Overview, Configuration, Console).

### Changed
- **Backend Service:** Implemented `ExecCommand` in `ContainerService` to capture command output.
- **Backend Service:** Upgraded config management to support dual-file storage (`openclaw.json` and `auth-profiles.json`).
- **Security:** Used `base64` encoding for safe config injection into containers.
- **Security:** Credentials are now stored in the standard OpenClaw Agent Store (`auth-profiles.json`).

### Fixed
- **UI:** Better organization of project controls and logs.
