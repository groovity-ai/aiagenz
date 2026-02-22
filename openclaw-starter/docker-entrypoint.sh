#!/bin/bash
set -e

# Setup Config
STATE_DIR="/home/node/.openclaw"
mkdir -p "$STATE_DIR"

# Generate openclaw.json with explicit ENV usage
# We inject variables here so the JSON file on disk has the values
cat > "$STATE_DIR/openclaw.json" <<EOF
{
  "meta": {
    "lastTouchedVersion": "2026.2.13",
    "lastTouchedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "${OPENCLAW_AGENTS_DEFAULTS_MODEL_PRIMARY:-google/gemini-3-flash-preview}"
      },
      "workspace": "/app/workspace"
    }
  },
  "auth": {
    "profiles": {
      "google:default": {
        "provider": "google",
        "mode": "api_key"
      },
      "openai:default": {
        "provider": "openai",
        "mode": "api_key"
      },
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "api_key"
      }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "accounts": {
        "default": {
          "enabled": true,
          "botToken": "${OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN}",
          "groupPolicy": "allowlist",
          "allowFrom": ["*"]
        }
      }
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
EOF

# Inject Antigravity if needed
if [ ! -z "$OPENCLAW_AUTH_PROFILES_GOOGLE_ANTIGRAVITY_DEFAULT_EMAIL" ]; then
    node -e '
    const fs = require("fs");
    const path = "'$STATE_DIR'/openclaw.json";
    const cfg = JSON.parse(fs.readFileSync(path));
    cfg.auth.profiles["google-antigravity:default"] = {
        provider: "google-antigravity",
        mode: "oauth",
        email: process.env.OPENCLAW_AUTH_PROFILES_GOOGLE_ANTIGRAVITY_DEFAULT_EMAIL
    };
    fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
    '
fi

# Ensure directory is writable by node user
chmod -R 777 "$STATE_DIR"

export HOME="/home/node"
export OPENCLAW_STATE_DIR="$STATE_DIR"
export CI=true

# Pass NODE_OPTIONS explicitly to su
exec su node -c "NODE_OPTIONS='${NODE_OPTIONS}' node /app/openclaw.mjs gateway --port 18789 --bind auto --token \"$OPENCLAW_GATEWAY_TOKEN\" --allow-unconfigured"
