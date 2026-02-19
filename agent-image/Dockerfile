# Base on official OpenClaw starter
FROM openclaw-starter:latest

USER root

# Install additional tools for Agents
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    jq \
    python3 \
    python3-pip \
    unzip \
    && curl -L https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/bin/ttyd \
    && chmod +x /usr/bin/ttyd \
    && rm -rf /var/lib/apt/lists/*

# Copy AiAgenz Bridge Plugin (baked into image for fast startup)
COPY agent-image/extensions/aiagenz-bridge /app/builtin-extensions/aiagenz-bridge

# Copy our custom entrypoint
COPY agent-image/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment
ENV NODE_ENV=production

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
