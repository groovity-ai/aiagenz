FROM ghcr.io/openclaw/openclaw:latest

USER root

# Install bash and other tools if needed
RUN apt-get update && apt-get install -y bash && rm -rf /var/lib/apt/lists/*

# Copy Entrypoint Script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create 'openclaw' command alias (wrapper)
RUN echo '#!/bin/sh' > /usr/local/bin/openclaw && \
    echo 'node /app/openclaw.mjs "$@"' >> /usr/local/bin/openclaw && \
    chmod +x /usr/local/bin/openclaw

# Set working directory
WORKDIR /app

# The entrypoint will generate the config and start OpenClaw
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
