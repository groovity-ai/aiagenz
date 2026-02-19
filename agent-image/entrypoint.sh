#!/bin/bash
set -e

# AiAgenz Smart Entrypoint
# 1. Checks if config exists. If not, generates it from Env Vars.
# 2. Installs built-in plugins (Bridge).
# 3. Launches OpenClaw.

STATE_DIR="/home/node/.openclaw"
CONFIG_FILE="$STATE_DIR/openclaw.json"
mkdir -p "$STATE_DIR"

# --- 1. Config Generation (Only if missing) ---
if [ ! -f "$CONFIG_FILE" ]; then
    echo "⚠️ Config not found at $CONFIG_FILE. Generating initial config from Env Vars..."
    
    # Generate default config (env vars are PRIMARY injection path — Bridge is bonus)
    # Determine telegram enabled state based on token presence
    TELEGRAM_ENABLED="false"
    if [ -n "$OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN" ]; then
        TELEGRAM_ENABLED="true"
    fi
    
    cat > "$CONFIG_FILE" <<EOF
{
  "meta": {
    "lastTouchedVersion": "2026.2.14",
    "lastTouchedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "${OPENCLAW_AGENTS_DEFAULTS_MODEL_PRIMARY:-google/gemini-3-flash-preview}"
      },
      "workspace": "/home/node/workspace"
    }
  },
  },
  "channels": {
    "telegram": {
      "enabled": $TELEGRAM_ENABLED,
      "accounts": {
        "default": {
          "enabled": $TELEGRAM_ENABLED,
$(if [ -n "$OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN" ]; then echo "          \"botToken\": \"$OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN\","; fi)
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
  },
  "plugins": {
    "entries": {
      "aiagenz-bridge": { "enabled": true },
      "telegram": { "enabled": true }
    }
  }
}
EOF
    echo "✅ Initial config generated."
else
    echo "✅ Config found at $CONFIG_FILE. Skipping generation to preserve user changes."
fi

# --- 1.5. Auth Profiles Generation (Separate File) ---
AUTH_PROFILES_DIR="$STATE_DIR/agents/main/agent"
AUTH_PROFILES_FILE="$AUTH_PROFILES_DIR/auth-profiles.json"

if [ ! -f "$AUTH_PROFILES_FILE" ]; then
    echo "🔑 Generating initial auth-profiles.json at $AUTH_PROFILES_FILE..."
    mkdir -p "$AUTH_PROFILES_DIR"
    cat > "$AUTH_PROFILES_FILE" <<EOF
{
  "profiles": {
    "google:default": { "provider": "google", "mode": "api_key" },
    "openai:default": { "provider": "openai", "mode": "api_key" },
    "anthropic:default": { "provider": "anthropic", "mode": "api_key" }
  }
}
EOF
fi

# --- 2. Plugin Installation (Always update to ensure latest version) ---
mkdir -p "$STATE_DIR/extensions"
if [ -d "/app/builtin-extensions/aiagenz-bridge" ]; then
    echo "🔌 Installing/Updating AiAgenz Bridge Plugin..."
    # Remove old version to ensure clean update
    rm -rf "$STATE_DIR/extensions/aiagenz-bridge"
    cp -r /app/builtin-extensions/aiagenz-bridge "$STATE_DIR/extensions/"
fi

# --- 3. Permissions ---
# Fix permissions so 'node' user can read/write everything in state dir
chown -R node:node "$STATE_DIR"

# Ensure workspace exists and is writable
mkdir -p /home/node/workspace
chown -R node:node /home/node/workspace

# Export env vars expected by OpenClaw
export HOME="/home/node"
export OPENCLAW_STATE_DIR="$STATE_DIR"
export CI=true

# --- 4. Launch ---
echo "🚀 Starting Web Terminal (ttyd)..."
ttyd --version || echo "⚠️  ttyd binary missing or failed"
nohup su node -c "ttyd -p 7681 -W bash" > /tmp/ttyd.log 2>&1 &
sleep 1
cat /tmp/ttyd.log

# Use project-specific name for Bonjour/mDNS discovery (prevents hostname conflicts)
AGENT_NAME="${OPENCLAW_GATEWAY_NAME:-openclaw}"

echo "🚀 Starting OpenClaw Gateway..."
# Exec into node process (replace shell)
exec su node -c "NODE_OPTIONS='${NODE_OPTIONS}' node /app/openclaw.mjs gateway --port 18789 --bind auto --token \"$OPENCLAW_GATEWAY_TOKEN\" --allow-unconfigured"
