# Auth / API Key Persistence Architecture

Documents the complete auth flow in AiAgenz — from user input to OpenClaw reading the key.

---

## 1. File Ownership

Two files manage auth state inside each agent container:

| File | Path | Owner | Purpose |
|---|---|---|---|
| `openclaw.json` | `/home/node/.openclaw/openclaw.json` | **OpenClaw** | Primary config. OpenClaw reads `auth.profiles` from here on startup/reload. |
| `auth-profiles.json` | `/home/node/.openclaw/agents/main/agent/auth-profiles.json` | **Bridge** | Mirror of profiles for dashboard display. OpenClaw may also read this. |

> [!IMPORTANT]
> OpenClaw OWNS `openclaw.json`. On SIGHUP restart it will re-read this file. Any key not stored here will be lost on restart.

---

## 2. Data Flow: Adding an API Key

```
User (Dashboard)
  → POST /api/projects/{id}/auth/add  { provider: "google", key: "AIza..." }
    → Next.js (proxy)
      → Go Backend (AuthAdd handler @ handler/project.go:456)
        → service.Update() → saves to DB (encrypted)
        → service.UpdateRuntimeConfig() → calls bridge
          → Bridge POST /config/update
            ├── Writes key to openclaw.json  auth.profiles.google:default.key = "AIza..."  ← PRIMARY
            ├── Mirrors key to auth-profiles.json                                           ← DISPLAY
            └── Sends SIGHUP to OpenClaw parent process (reload)
              → OpenClaw rereads openclaw.json → key is present → uses it ✅
```

---

## 3. Config File Formats

### `openclaw.json` (Primary — OpenClaw reads this)
```json
{
  "auth": {
    "profiles": {
      "google:default": {
        "provider": "google",
        "mode": "api_key",
        "key": "AIza..."
      }
    }
  }
}
```

### `auth-profiles.json` (Mirror — Bridge reads for dashboard display)
```json
{
  "profiles": {
    "google:default": {
      "provider": "google",
      "mode": "api_key",
      "key": "AIza..."
    }
  }
}
```

> [!NOTE]
> OpenClaw's **native** format for this file has `{ "version": 1, "profiles": { ... } }` without a `key` field. If OpenClaw regenerates this file (e.g., after a clean start), it will overwrite the key. This is why keys must live in `openclaw.json`.

---

## 4. Bridge Endpoints Reference

| Endpoint | What it does |
|---|---|
| `GET /config` | Reads `openclaw.json` (primary), fills missing profiles from `auth-profiles.json`. Returns merged config. |
| `POST /config/update` | Merges incoming update into `openclaw.json`. Mirrors `auth.profiles` to `auth-profiles.json`. **Does NOT strip profiles before writing.** |
| `POST /auth/add` | Dual-writes `{ provider, mode, key }` to both `openclaw.json` auth.profiles AND `auth-profiles.json`. Sends SIGHUP. |

---

## 5. The Bug History (Root Cause for Future Reference)

Three layered bugs caused API keys to silently reset:

### Bug 1 — `entrypoint.sh` moved auth OUT of `openclaw.json`
```diff
# Changed during session — WRONG:
- "auth": { "profiles": { "google:default": {...} } }  ← removed from openclaw.json

# Fixed: auth.profiles is back inside openclaw.json
```
**Effect**: OpenClaw couldn't find `auth.profiles` in openclaw.json → regenerated with `{ version: 1, profiles: {...empty...} }` on SIGHUP.

### Bug 2 — `GET /config` overwrote openclaw.json auth with auth-profiles.json
```diff
# Wrong: this clobbers the key-bearing openclaw.json auth with the empty mirror
- config.auth.profiles = auth.profiles;  // ← blind overwrite

# Fixed: only fill MISSING keys from auth-profiles.json
+ for (const [k, v] of Object.entries(auth.profiles)) {
+     if (!config.auth.profiles[k]) config.auth.profiles[k] = v;
+ }
```

### Bug 3 — `POST /config/update` stripped profiles before writing to `openclaw.json`
```diff
# This was the critical bug: service.Update() sent the key in auth.profiles
# but bridge deleted it before writing to openclaw.json
- delete updates.auth.profiles;  // ← KEY WAS STRIPPED HERE

# Fixed: removed this line — profiles (with keys) now persist in openclaw.json
```

---

## 6. Initialization: `entrypoint.sh`

On **first container start** (when `openclaw.json` doesn't exist):
```bash
# Generates openclaw.json WITH empty auth profiles
"auth": {
    "profiles": {
        "google:default": { "provider": "google", "mode": "api_key" },
        "openai:default":  { "provider": "openai",  "mode": "api_key" },
        "anthropic:default": { "provider": "anthropic", "mode": "api_key" }
    }
}
```

On **restart** (file exists):
```bash
echo "✅ Config found. Skipping generation to preserve user changes."
# File is NOT regenerated — user keys are safe ✅
```

---

## 7. Key Points for Developers

1. **Never `delete updates.auth.profiles`** in the bridge — this strips keys before they reach openclaw.json.
2. **The `POST /auth/add` bridge endpoint** is the source of truth for saving keys. It dual-writes to both files.
3. **SIGHUP causes OpenClaw to re-read `openclaw.json`** — so the key MUST be in that file to survive a reload.
4. **`auth-profiles.json`** is for dashboard display mirroring only — do not rely on it as the primary store.
5. **The `version: 1` field** in an auth-profiles file means OpenClaw generated it natively (no key). This is a sign the file was overwritten.
