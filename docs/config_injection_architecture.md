# AiAgenz Configuration Injection Architecture

This document serves as the absolute source of truth for how AiAgenz securely injects configuration—like API Keys, LLM Profiles, and Messaging Channel Tokens—into a running OpenClaw instance. 

> [!CAUTION]
> **To Future AI Agents & Developers:** Do NOT attempt to use `openclaw doctor` to fix or inject keys. `openclaw doctor` is designed to strictly enforce schemas by **deleting** unrecognized keys (like raw API keys). Our injection architecture intentionally bypasses `doctor` by utilizing a "Split & Sanitize" mechanism to store secrets safely outside OpenClaw's primary validation cone.

---

## 1. The Core Problem
OpenClaw enforces an extremely strict JSON schema for its `openclaw.json` configuration file.
- It **does not allow** raw API keys to be placed in `auth.profiles`. 
- It rejects keys like `type: "api_key"` and values like `mode: "api_key"`.
- If an invalid key is found, `openclaw doctor` issues warnings, and during automated fixes, it will outright delete the violating data.

However, AiAgenz needs a way to remotely pass user API keys from the Dashboard to the OpenClaw container.

## 2. The Solution: "Split & Sanitize" (The Bridge Plugin)

To solve this, we created the **AiAgenz Bridge Plugin** (`agent-image/extensions/aiagenz-bridge/index.js`), a Node.js HTTP server running alongside OpenClaw inside the container.

When the UI saves settings, it sends a payload to the Bridge. The Bridge acts as a "Bouncer", splitting the payload into two separate files:

| File | Path | Owner | Purpose |
|---|---|---|---|
| `openclaw.json` | `~/.openclaw/openclaw.json` | **OpenClaw (Strict)** | Primary config. Stores agent profile **metadata** (provider, mode). **NO KEYS ALLOWED**. |
| `auth-profiles.json` | `~/.openclaw/agents/main/agent/auth-profiles.json` | **Bridge (Secure)** | Secure key vault. Stores **keys** alongside provider metadata. Read internally by OpenClaw. |

### How The Bridge Processes Payloads (POST `/config/update`)
1. **Sanitization:** It extracts `auth.profiles` from the incoming payload.
2. **Key Storage:** It writes the raw keys (e.g., `sk-...`) to `auth-profiles.json`. Crucially, it merges them with **existing** keys in `auth-profiles.json` so that if a payload only contains metadata, it doesn't accidentally erase previously saved keys.
3. **Metadata Scrubbing:** It strips the `key` field, converts `mode: "api_key"` to `mode: "token"`, and removes any `type` fields.
4. **Primary Write:** It writes ONLY the scrubbed metadata to `openclaw.json`.
5. **Reload:** It issues a `SIGHUP` to OpenClaw, causing it to reload both files and merge them in memory safely without triggering schema validation errors.

---

## 3. Go Backend Fallback (Disaster Recovery)

If the Bridge API is unreachable (e.g., the container is stopped or crashing), the Go Backend (`backend-go/internal/service/project.go` -> `UpdateRuntimeConfig`) has a **File-Write Fallback** mechanism.

The fallback replicates the exact logic of the Bridge:
1. It intercepts the configuration payload.
2. It strips `key` and `type`, and forces `mode: "token"` before physically writing `/home/node/.openclaw/openclaw.json` via Docker Exec.
3. It writes the unsanitized raw keys to `/home/node/.openclaw/agents/main/agent/auth-profiles.json` via Docker Exec.
4. It restarts the container.

Failure to follow the Split & Sanitize pattern here will cause `openclaw.json` to be corrupted on the filesystem before the container even turns on.

---

## 4. Channel Credentials & Schema Nesting (The Telegram Bug)

OpenClaw's schema for messaging channels (like Telegram, Discord) is deceptively complex. A very common mistake is writing flat configurations.

### ❌ WRONG (Flat Format)
If you place `botToken` at the root of the channel, `openclaw doctor` will ignore it or flag it, and the bot **will not respond** to messages.
```json
"channels": {
  "telegram": {
    "enabled": true,
    "botToken": "8330386957:AAEm..."
  }
}
```

### ✅ CORRECT (Nested & Duplicated Format)
All credentials for a channel MUST be nested under the `accounts.default` path. Additionally, some channel properties (like `dmPolicy`, `allowFrom`) need to be duplicated at the root of the channel to act as global templates, while also existing inside `accounts.default` as account-specific overrides.
```json
"channels": {
  "telegram": {
    "enabled": true,
    "dmPolicy": "pairing",
    "groupPolicy": "allowlist",
    "streamMode": "partial",
    "allowFrom": ["*"],
    "accounts": {
      "default": {
        "enabled": true,
        "botToken": "8330386957:AAEm...",
        "dmPolicy": "open",
        "groupPolicy": "allowlist",
        "streamMode": "partial",
        "allowFrom": ["*"]
      }
    }
  }
}
```

In AiAgenz, the `AddChannel` handler (`backend-go/internal/handler/project.go`) and the DB Sync worker automatically convert flat payloads from the frontend into the nested `accounts.default` structure before forwarding them to the container.

---

## 5. Development Rules & Anti-Patterns

1. **Do not use `openclaw doctor --fix` programmatically.** It will delete users' API keys. Handle schema correction at the Go/Bridge layer.
2. **Never expose `auth-profiles.json`.** This file contains plaintext LLM provider API keys.
3. **Array.isArray Guards for OpenClaw CLI:** The Go backend periodically executes `openclaw models` via CLI. If OpenClaw is experiencing a config error, it might output a string warning instead of a JSON array. Always protect React components with `Array.isArray()` to prevent the dashboard from crashing with `.map is not a function`.
4. **Bootstrap Safely:** `agent-image/entrypoint.sh` initializes the first `openclaw.json`. Do NOT inject dummy auth templates here containing `mode: api_key`. The bootstrap `openclaw.json` should contain absolutely no auth block to pass initial validation, allowing the Bridge to inject it later.
