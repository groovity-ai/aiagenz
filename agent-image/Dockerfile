# Base directly on official OpenClaw image to avoid double wrapping
FROM ghcr.io/openclaw/openclaw:latest

USER root

# Install additional tools for Agents
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    wget \
    git \
    jq \
    python3 \
    python3-pip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory (same as what openclaw-starter did)
WORKDIR /app

# Install ttyd manually (apt package missing in some base images)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then TTYD_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then TTYD_ARCH="aarch64"; \
    else echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    echo "Downloading ttyd for $ARCH..." && \
    curl -L "https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.${TTYD_ARCH}" -o /usr/bin/ttyd && \
    chmod +x /usr/bin/ttyd


# Copy AiAgenz Bridge Plugin (baked into image for fast startup)
COPY agent-image/extensions/aiagenz-bridge /app/builtin-extensions/aiagenz-bridge

# Copy our custom entrypoint
COPY agent-image/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment
ENV NODE_ENV=production

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
