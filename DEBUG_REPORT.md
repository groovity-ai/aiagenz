# DEBUG REPORT: AiAgenz gVisor Network Issue 🚨

**Date:** 2026-02-15
**Status:** ✅ ROOT CAUSE FOUND — Fix documented below.

## 🏗️ Architecture State
- **Frontend:** Next.js 14 (App Router) + Shadcn UI. Running on port `3010`.
- **Backend:** Go (Chi Router) + PostgreSQL. Running on port `4001`.
- **Infrastructure:** Docker containers managed by Backend via `dockerode`.
- **Security:** `runsc` (gVisor) runtime for isolation.

## 🐛 The Critical Issue
Newly deployed agents (`openclaw-starter:latest` running in `gVisor`) fail to connect to Telegram API.

**Error Log (Inside Container):**
```
[telegram] deleteMyCommands failed: Network request for 'deleteMyCommands' failed!
TypeError: fetch failed
    at node:internal/deps/undici/undici:14902:13
```

**Symptoms:**
1.  Agent starts successfully (Gateway listening).
2.  Config is injected correctly (Token, Model Gemini Flash).
3.  BUT outbound HTTPS requests to `api.telegram.org` fail immediately.

## 🔍 Root Cause Analysis

**The problem is NOT IPv6.** It's gVisor's `netstack` blocking Docker's embedded DNS.

### How DNS normally works in Docker:
```
Container → /etc/resolv.conf (127.0.0.11) → Docker Embedded DNS → External DNS (8.8.8.8) → Resolved!
```

### How it breaks with gVisor `netstack`:
```
Container (gVisor) → /etc/resolv.conf (127.0.0.11) → gVisor netstack ❌ BLOCKS ❌ → Docker DNS unreachable
```

gVisor implements its own isolated network stack (`netstack`) in userspace. This stack **cannot access Docker's embedded DNS server** which binds to the host's loopback interface (`127.0.0.11`). As a result:
- `curl -v http://1.1.1.1` → ✅ Works (direct IP, no DNS needed)
- `curl -I https://api.telegram.org` → ❌ Fails (`Could not resolve host`)

### Why previous fixes didn't work:

| Attempt | Why it failed |
|---|---|
| Custom DNS `8.8.8.8` in Docker `HostConfig.DNS` | Gets written to `/etc/resolv.conf` but gVisor's netstack intercepts and may not forward UDP/53 correctly |
| `NODE_OPTIONS=--dns-result-order=ipv4first` | Only controls DNS result ordering AFTER resolution. DNS resolution itself is broken |
| Clean image rebuild | Image is fine. The runtime sandbox is the problem |

## ✅ THE FIX: gVisor `--network=host`

Configure gVisor to use the **host's network stack** instead of its own `netstack`. This fixes DNS while **keeping gVisor's core security protections active**.

### Security Impact (Multi-Tenant Safe):

| Security Layer | netstack (broken) | `--network=host` (fix) | runc (no gVisor) |
|---|:---:|:---:|:---:|
| Syscall sandboxing (seccomp) | ✅ | ✅ | ❌ |
| Filesystem isolation | ✅ | ✅ | ⚠️ Basic |
| Memory-safe kernel (Go) | ✅ | ✅ | ❌ |
| Network stack isolation | ✅ | ❌ Passthrough | ❌ |
| Docker network isolation (iptables) | ✅ | ✅ | ✅ |
| **DNS works?** | **❌ No** | **✅ Yes** | **✅ Yes** |

> **Key Takeaway:** `--network=host` in gVisor's runtime args only affects the network stack. All other gVisor protections (syscall filtering, filesystem isolation, Go-based memory-safe kernel) remain active. Docker's iptables-based network isolation between containers also remains intact.

### Step-by-Step Fix Instructions:

#### 1. SSH into VPS
```bash
ssh user@your-vps-ip
```

#### 2. Edit Docker daemon configuration
```bash
sudo nano /etc/docker/daemon.json
```

Update the `runsc` runtime to include `--network=host`:
```json
{
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc",
      "runtimeArgs": [
        "--network=host"
      ]
    }
  }
}
```

> ⚠️ If there are existing `runtimeArgs`, merge them. For example if `--net-raw` is already there:
> ```json
> "runtimeArgs": ["--network=host", "--net-raw"]
> ```

#### 3. Restart Docker daemon
```bash
sudo systemctl restart docker
```

#### 4. Restart all agent containers
```bash
# Restart all running openclaw containers
docker ps --filter "name=aiagenz-" -q | xargs -r docker restart
```

#### 5. Verify the fix
```bash
# Check container logs — should NOT have "fetch failed" errors
docker logs <container_name> --tail 50

# Test DNS from inside container
docker exec <container_name> curl -I https://api.telegram.org
# Expected: HTTP/2 200 or 302 (any HTTP response = DNS works)

# Test Telegram bot
# Send a message to your bot on Telegram — it should respond now
```

### Optional: Cleanup app code workarounds

After applying the fix, the following workarounds in `backend-go/internal/service/container.go` can be cleaned up:

```diff
  // Line 94: Remove --dns-result-order=ipv4first (no longer needed)
- env = append(env, fmt.Sprintf("NODE_OPTIONS=--max-old-space-size=%d --dns-result-order=ipv4first", nodeHeapMB))
+ env = append(env, fmt.Sprintf("NODE_OPTIONS=--max-old-space-size=%d", nodeHeapMB))

  // Line 116: Custom DNS no longer needed (Docker DNS now reachable)
- DNS: []string{"103.246.107.10", "8.8.8.8"},
```

## 📦 Repository State
- **Backend Go:** Fully functional (API, DB, Docker Control).
- **Frontend:** Fully functional (Dashboard, Auth, Logs, Console).
- **Docker Image:** `openclaw-starter` built & ready.
