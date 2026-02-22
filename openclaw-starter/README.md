# OpenClaw Starter Image 🚀

This directory contains the Dockerfile for building the default agent image used by AiAgenz Platform (`openclaw-starter:latest`).

## 🏗️ What's Inside?

1.  **Base Image:** `ghcr.io/openclaw/openclaw:latest` (Official OpenClaw Engine).
2.  **Wrapper Script:** `/usr/local/bin/openclaw` -> `node /app/openclaw.mjs`.
    *   *Benefit:* Users can type `openclaw status` instead of `node openclaw.mjs status`.
3.  **Entrypoint:** Standard Docker entrypoint script.

## 🛠️ How to Update/Rebuild

When OpenClaw releases a new version (e.g., v2026.2.14+), follow these steps to update the base image for all new projects.

### 1. Pull Latest Base Image
```bash
docker pull ghcr.io/openclaw/openclaw:latest
```

### 2. Build Local Image
```bash
docker build -t openclaw-starter:latest .
```

### 3. Verify Version
```bash
docker run --rm openclaw-starter:latest openclaw --version
```

---

## ⚠️ Notes
*   This image is used for **"Starter Mode"** projects in AiAgenz.
*   Existing containers will **NOT** update automatically. Users must restart/redeploy their project to pick up the new image.
