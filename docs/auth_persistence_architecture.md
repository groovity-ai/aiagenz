# Auth / API Key Persistence Architecture

Documents the complete authentication flow in AiAgenz — tracking how user-supplied API keys travel from the dashboard to the OpenClaw agent instance, focusing on how keys are persisted and securely configured.

---

## 1. File Ownership & Split Architecture

AiAgenz uses a **Split & Sanitize** pattern to manage authentication state across two files. OpenClaw exerts strict schema validation, so keys and metadata must be rigidly separated.

| File | Path | Owner | Purpose |
|---|---|---|---|
| `openclaw.json` | `/home/node/.openclaw/openclaw.json` | **OpenClaw (Strict)** | Primary config. Stores agent profile **metadata** (provider, mode). **NO KEYS ALLOWED**. |
| `auth-profiles.json` | `/home/node/.openclaw/agents/main/agent/auth-profiles.json` | **Bridge (Secure)** | Secure key store. Stores **keys** alongside provider metadata. Read by both the Bridge and OpenClaw plugin. |

> [!WARNING]
> OpenClaw heavily validates `openclaw.json`. Setting unknown keys (like `type: "api_key"`) or invalid enums (like `mode: "api_key"`) will cause OpenClaw to flag the config as **Invalid** and reset it during a SIGHUP or restart.

---

## 2. Data Flow: Adding an API Key

When a user adds an API key from the web dashboard, the data follows a precise execution path:

```
User (Dashboard Editor)
  → POST /api/projects/{id}/auth/add  { provider: "openai", key: "sk-..." }
    → Next.js (Proxy Route)
      → Go Backend (AuthAdd handler @ handler/project.go)
        → service.Update() → Encrypts and persists to PostgreSQL
        → service.UpdateRuntimeConfig() → Forwards to AiAgenz Bridge
          → Bridge POST /auth/add (Split & Sanitize logic):
            ├── 1. Writes pure metadata to openclaw.json:
            │      auth.profiles.openai:default = { provider: "openai", mode: "token" }
            ├── 2. Writes full key data to auth-profiles.json:
            │      profiles.openai:default = { provider: "openai", type: "api_key", key: "sk-..." }
            └── 3. Issues SIGHUP to OpenClaw parent process
              → OpenClaw re-reads openclaw.json (metadata) and auth-profiles.json (keys)
              → Configuration is merged internally by OpenClaw → ✅ Key active
```

---

## 3. Strict Config File Schemas

To prevent OpenClaw from flagging `Invalid Config`, these exact schemas must be followed.

### `openclaw.json` (Metadata Only — No Keys)
OpenClaw only accepts `mode: "token"` or `mode: "oauth"`. It will reject `mode: "api_key"` and the `type` field.
```json
{
  "auth": {
    "profiles": {
      "google:default": {
        "provider": "google",
        "mode": "token"
      },
      "openai:default": {
        "provider": "openai",
        "mode": "token"
      }
    }
  }
}
```

### `auth-profiles.json` (Key Store)
Uses `type: "api_key"` and requires the `version: 1` header to instruct OpenClaw to read it properly.
```json
{
  "version": 1,
  "profiles": {
    "google:default": {
      "type": "api_key",
      "provider": "google",
      "key": "AIza..."
    },
    "openai:default": {
      "type": "api_key",
      "provider": "openai",
      "key": "sk-..."
    }
  }
}
```

---

## 4. Bridge API Responsibility

The `aiagenz-bridge` plugin (node.js) orchestrates the safe-handling of keys between the frontend and OpenClaw.

| Endpoint | Action & Schema Handling |
|---|---|
| **`GET /config`** | Merges data for the Frontend. Reads `openclaw.json` (primary metadata), then injects missing keys from `auth-profiles.json` so the dashboard displays them properly. |
| **`POST /config/update`** | **Sanitization Filter:** Extracts `auth.profiles` from the payload. Writes the raw keys to `auth-profiles.json`, strips the keys/`type` field, converts `mode` to `"token"`, and writes ONLY metadata to `openclaw.json`. |
| **`POST /auth/add`** | Explicit add handler. Performs the exact same split-and-sanitize procedure as `POST /config/update` but specifically tuned for initial provisioning. |

---

## 5. Next.js Proxy Routes (Critical Path)

For the dashboard to securely communicate with the remote Go backend, missing reverse-proxy routes in Next.js will cause silent `404 Not Found` API failures during `ConfigTab` saves. 

The following routes physically map React dashboard buttons to the Go execution core:
- `frontend/app/api/projects/[id]/auth/add/route.ts` → Traverses to `POST /projects/:id/auth/add`
- `frontend/app/api/projects/[id]/auth/login/route.ts` → OAuth initiation
- `frontend/app/api/projects/[id]/auth/callback/route.ts` → OAuth resolution

---

## 6. Initialization Sequence (`entrypoint.sh`)

When a new agent container is started, the `entrypoint.sh` bash script generates the zero-state configurations.

1. **`openclaw.json`** is generated with **NO auth profiles block at all**.
2. **`auth-profiles.json`** is generated with default template placeholders.
```bash
cat > "$AUTH_PROFILES_FILE" <<EOF
{
  "version": 1,
  "profiles": {
    "google:default": { "type": "api_key", "provider": "google" },
    "openai:default": { "type": "api_key", "provider": "openai" },
    "anthropic:default": { "type": "api_key", "provider": "anthropic" }
  }
}
EOF
```
*Note: We do not put empty keys or invalid `mode` properties into `openclaw.json` during bootstrap, avoiding `openclaw doctor` strict validation warnings.*

---

## 7. Development Rules & Anti-Patterns

1. **Do not write `key` or `apiKey` into Go's GetRuntimeConfig profiles.** The Go backend should only return `mode: "token"` and `provider`. The Bridge is specifically responsible for orchestrating key injection.
2. **Do not use `mode: "api_key"` globally.** `mode: "api_key"` only exists conceptually. OpenClaw internally validates `mode: "token"`. If you write `api_key` to `openclaw.json`, the container doctor will fail.
3. **Array.isArray Guards:** The Go backend executes the `openclaw` CLI. If the CLI outputs string text (like `Invalid Config`) instead of JSON array structures, the UI will crash if it attempts `availableModels.map()`. **Always use `Array.isArray(models)`** in React components to prevent silent death.
