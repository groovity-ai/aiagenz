# Local Development Guide 🛠️

This guide explains how to run the AI Agent Backend locally on your machine (Mac/Windows/Linux) for easier debugging.

## 🚀 Prerequisites
- **Docker Desktop** installed and running.
- **Go 1.22+** installed.

## ⚙️ Configuration Change
The backend has been updated to support running without `gVisor` (which is hard to set up on Mac).
- **Production (`APP_ENV=production`)**: Uses `runsc` (gVisor) for security.
- **Local (Default)**: Uses standard Docker runtime (easy to debug).

## 🏃 How to Run

### 1. Set Environment Variables
You need to set `APP_ENV` to `local` (or just unset it, as it defaults to non-production).

```bash
# Terminal 1: Backend
cd backend-go

# Set critical env vars (replace with your actual secrets)
export APP_ENV=local
export PORT=8080
export DATABASE_URL="postgres://user:pass@localhost:5432/dbname" 
# ... allow other vars as needed (SUPABASE_URL, etc.)
```

### 2. Run the Backend
```bash
go run cmd/server/main.go
```

### 3. Debugging Features
When running locally with standard Docker:
- **Direct Container Access**:
  ```bash
  # List containers
  docker ps 

  # Jump into a running agent container
  docker exec -it <container_id_or_name> /bin/bash
  ```
- **File System Access**: You can inspect files in `/home/node/.openclaw` easily.
- **Network**: The agent uses the standard bridge network, so you can reach it via its container IP or exposed ports if mapped.

## 🔍 Troubleshooting 500 Errors Locally
If you hit a 500 error locally:
1. Check the terminal where `go run` is running. It shows real-time logs with stack traces.
2. Check agent logs: `docker logs -f <container_name>`.
3. Verify `PATH` inside container:
   ```bash
   docker exec <container_name> env
   ```
   (We recently fixed a bug where `PATH` was missing!)

## 🔍 Troubleshooting

### Missing Base Image (`openclaw-starter`) - 4GB+ Transfer
Jika image sangat besar (seperti `openclaw-starter` yang mencapai 4.25GB) dan pipe SSH sering gagal, gunakan metode `SCP` yang lebih stabil:

1. **Di Server (simpan ke file):**
   ```bash
   docker save openclaw-starter:latest -o openclaw-starter.tar
   ```

2. **Di Laptop (copy file):**
   ```bash
   # Ganti mirza@103.246.107.79 sesuai server Anda
   scp mirza@103.246.107.79:~/openclaw-starter.tar .
   ```

3. **Di Laptop (load image):**
   ```bash
   docker load -i openclaw-starter.tar
   ```

