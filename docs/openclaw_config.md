# OpenClaw Configuration Architecture

This document defines the standard for constructing and managing OpenClaw configurations within the `aiagenz` project. It serves as a guide for developers and AI agents to ensure compliance with the "Orchestrator Pattern".

## 🏗️ Core Concept: The Orchestrator Pattern

We utilize a **Split & Sanitize** strategy to manage configurations, ensuring security for credentials while maintaining visibility for routing logic.

| Component | File | Role | Content Type |
|-----------|------|------|--------------|
| **Orchestrator** | `openclaw.json` | Control Center | **Metadata Only**. Routing logic (`auth.order`), Sanitized Profiles (Provider/Mode), Model Aliases. **NO SECRETS.** |
| **Secret Store** | `auth-profiles.json` | Vault | **Full Credentials**. API Keys, Tokens, Secrets. |

---

## 🔧 1. `openclaw.json` (The Orchestrator)

Located at: `~/.openclaw/openclaw.json`

This file is the brain. It tells OpenClaw *how* to use the profiles, but doesn't store the keys.

### Key Sections:

#### `auth.order` (Routing)
Defines the priority/order of auth profiles for each provider.
```json
"auth": {
  "order": {
    "google": ["google:default"],
    "openai": ["openai:default"]
  }
}
```

#### `auth.profiles` (Sanitized Metadata)
Stores the *structure* of profiles. Crucially, **keys/tokens are stripped** before writing here.
```json
"auth": {
  "profiles": {
    "google:default": {
      "provider": "google",
      "mode": "api_key"
      // NO KEY HERE!
    }
  }
}
```

#### `agents.models` (Aliases)
Maps friendly names to specific model IDs.
```json
"agents": {
  "models": {
    "gemini": { "alias": "google/gemini-3-flash-preview" },
    "gpt4o": { "alias": "openai/gpt-4o" }
  }
}
```

---

## 🔐 2. `auth-profiles.json` (The Secret Store)

Located at: `~/.openclaw/agents/main/agent/auth-profiles.json`

This file is the vault. It is loaded securely by OpenClaw at runtime and merged with the metadata.

### Content:
```json
{
  "profiles": {
    "google:default": {
      "provider": "google",
      "mode": "api_key",
      "key": "AIzaSy..." // FULL SECRET HERE
    }
  }
}
```

---

## ⚙️ Implementation Details

### Backend (`backend-go`)
Responsible for constructing the "Check-in" payload.
*   **Schema**: Enforces `mode: "api_key"` (not `type`).
*   **Order**: Generates `auth.order` map based on DB records.
*   **Defaults**: Injects `agents.models` aliases if missing.

### Bridge Plugin (`aiagenz-bridge`)
Responsible for **Split & Sanitize** persistence logic during `POST:/config/update`.

**Logic Flow:**
1.  Receives Full Config Payload (including `auth.profiles` with keys).
2.  **Intercepts `auth.profiles`**:
    *   Writes **FULL** profiles to `auth-profiles.json`.
    *   Creates **SANITIZED** copy (removes `key`, `token`, `secret`, `password`).
    *   Updates `openclaw.json` update payload with Sanitized copy.
3.  **Writes `openclaw.json`**:
    *   Persists `auth.order`, Sanitized `profiles`, and other config.

---

## 📝 Guide for Developers/Agents

When modifying configuration logic:

1.  **NEVER write secrets to `openclaw.json`**. Always strip them.
2.  **ALWAYS generate `auth.order`**. Profiles without an order entry effectively don't exist for routing.
3.  **Respect the Schema**. Use `mode` (e.g., `api_key`, `oauth`), not `type`.
4.  **Use the Bridge**. Do not write files directly. Send the full config to `POST:/config/update` and let the Bridge handle the separation.
