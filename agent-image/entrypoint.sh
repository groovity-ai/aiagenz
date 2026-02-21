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
    
    # Determine telegram enabled state based on token presence
    TELEGRAM_ENABLED="false"
    if [ -n "$OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN" ]; then
        TELEGRAM_ENABLED="true"
    fi

    # Detect OpenClaw version dynamically
    OPENCLAW_VERSION=$(node /app/openclaw.mjs --version 2>/dev/null || echo "unknown")

    DEFAULT_MODEL="${OPENCLAW_AGENTS_DEFAULTS_MODEL_PRIMARY:-google/gemini-3-flash-preview}"

    cat > "$CONFIG_FILE" <<EOF
{
  "meta": {
    "lastTouchedVersion": "$OPENCLAW_VERSION",
    "lastTouchedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "$DEFAULT_MODEL"
      },
      "models": {
        "$DEFAULT_MODEL": {}
      },
      "workspace": "/home/node/workspace",
      "compaction": { "mode": "safeguard" },
      "maxConcurrent": 2,
      "subagents": { "maxConcurrent": 4 }
    },
    "list": [
      {
        "id": "main",
        "default": true,
        "workspace": "/home/node/workspace",
        "model": "$DEFAULT_MODEL",
        "identity": {
          "name": "${OPENCLAW_AGENT_NAME:-Agent}",
          "emoji": "🤖"
        }
      }
    ]
  },
  "bindings": [
    {
      "agentId": "main",
      "match": { "channel": "telegram" }
    }
  ],
  "commands": {
    "native": "auto",
    "nativeSkills": "auto"
  },
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "channels": {
    "telegram": {
      "enabled": $TELEGRAM_ENABLED,
      "accounts": {
        "default": {
$(if [ -n "$OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN" ]; then echo "          \"botToken\": \"$OPENCLAW_CHANNELS_TELEGRAM_ACCOUNTS_DEFAULT_BOTTOKEN\","; fi)
          "dmPolicy": "open",
          "groupPolicy": "allowlist",
          "allowFrom": ["*"],
          "streamMode": "partial"
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

# --- 1.2. Config Auto-Healer (Self-Correction for schema upgrades) ---
if [ -f "$CONFIG_FILE" ]; then
    echo "🔍 Running fast config auto-healer..."
    # Check if any profile has 'type' (legacy) or 'key' (secret leakage)
    if jq -e '.auth.profiles | to_entries | any(.value.type or .value.key)' "$CONFIG_FILE" > /dev/null 2>&1; then
        echo "⚠️  Found legacy/unsecured profiles in openclaw.json. Sanitizing..."
        cp "$CONFIG_FILE" "${CONFIG_FILE}.corrupt.bak"
        # 1. Map type -> mode, 2. Delete key, 3. Delete type
        jq '.auth.profiles |= map_values(.mode = (.mode // .type // "api_key") | del(.type, .key))' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        echo "✅ Sanitization applied. Secrets moved to backup: ${CONFIG_FILE}.corrupt.bak"
    else
        echo "✅ Config schema is clean."
    fi
fi

# --- 1.5. Auth Profiles Generation (Separate File) ---
AUTH_PROFILES_DIR="$STATE_DIR/agents/main/agent"
AUTH_PROFILES_FILE="$AUTH_PROFILES_DIR/auth-profiles.json"

if [ ! -f "$AUTH_PROFILES_FILE" ]; then
    echo "🔑 Generating initial auth-profiles.json at $AUTH_PROFILES_FILE..."
    mkdir -p "$AUTH_PROFILES_DIR"
    cat > "$AUTH_PROFILES_FILE" <<EOF
{
  "version": 1,
  "profiles": {}
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
echo "⚙️  Optimizing OpenClaw CLI for low-memory environments..."
cat << EOF > /usr/local/bin/openclaw
#!/bin/bash
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=256}"
exec node /app/openclaw.mjs "\$@"
EOF
chmod +x /usr/local/bin/openclaw

echo "🚀 Starting Web Terminal (ttyd)..."
ttyd --version || echo "⚠️  ttyd binary missing or failed"
nohup su node -c "cd /home/node/workspace && ttyd -p 7681 -W bash" > /tmp/ttyd.log 2>&1 &
sleep 1
cat /tmp/ttyd.log

# Use project-specific name for Bonjour/mDNS discovery (prevents hostname conflicts)
AGENT_NAME="${OPENCLAW_GATEWAY_NAME:-openclaw}"

echo "🚀 Starting OpenClaw Gateway..."
# Run as node user using a safer shell execution pattern to avoid token expansion bugs
su node -s /bin/bash -c "
  export NODE_OPTIONS='${NODE_OPTIONS}'
  exec node /app/openclaw.mjs gateway \
    --port 18789 \
    --bind lan \
    --token '${OPENCLAW_GATEWAY_TOKEN}' \
    --allow-unconfigured
"
