# Base on official OpenClaw starter
FROM openclaw-starter:latest

# Install additional tools for Agents
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    jq \
    python3 \
    python3-pip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy AiAgenz Bridge Plugin (Bake it in!)
COPY backend-go/assets/aiagenz-bridge /app/builtin-extensions/aiagenz-bridge

# Copy our custom entrypoint
COPY agent-image/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment
ENV NODE_ENV=production
