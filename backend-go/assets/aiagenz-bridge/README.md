# AiAgenz Bridge Plugin

**AiAgenz Bridge** adalah plugin sistem internal (Control Plane) yang berjalan di dalam container OpenClaw (`gVisor`/Docker). Plugin ini membuka HTTP Server di port `4444` untuk memfasilitasi komunikasi **Zero-Latency** antara Backend AiAgenz (Go) dan Runtime OpenClaw (Node.js).

## 🏗️ Arsitektur

### Masalah (Cara Lama)
Sebelumnya, Backend menggunakan `docker exec` untuk mengontrol container:
- **Lambat:** Setiap perintah membuat proses baru (`runc`/`containerd` overhead).
- **Tidak Stabil:** Rawan hang pada environment `gVisor` (pipe stdin macet).
- **Terbatas:** Tidak bisa mengakses state memori internal OpenClaw secara real-time.

### Solusi (Bridge)
Backend berkomunikasi langsung dengan Plugin via HTTP Internal Network:
`Backend (Go)` -> `HTTP Request (Port 4444)` -> `Plugin (JS)` -> `OpenClaw Internal API`.

- **Cepat:** Latency < 10ms (vs 1-2 detik `docker exec`).
- **Stabil:** Menggunakan stack HTTP Node.js yang mature.
- **Aman:** Hanya listen di IP internal container, tidak terekspos ke internet.

## 🔌 API Reference

Server berjalan di `http://<container-ip>:4444`.

### 1. Cek Status & Config Summary
**GET** `/status`

Mendapatkan status kesehatan container dan ringkasan konfigurasi (tanpa detail sensitif).

```json
{
  "ok": true,
  "uptime": 120.5,
  "pid": 21,
  "memory": { "rss": 123456, ... },
  "summary": {
    "telegram": { "enabled": true, "token": "SET" },
    "auth_profiles": ["google:default"]
  }
}
```

### 2. Baca Konfigurasi Lengkap
**GET** `/config`

Mengambil isi file `openclaw.json` dan `auth-profiles.json` yang sedang aktif (merged). Digunakan Dashboard untuk menampilkan setting saat ini.

```json
{
  "channels": { ... },
  "auth": { "profiles": { ... } },
  "agents": { ... }
}
```

### 3. Update Konfigurasi
**POST** `/config/update`
**Header:** `x-reload: true` (Optional, untuk restart otomatis setelah save)

Melakukan **Deep Merge** konfigurasi baru ke `openclaw.json`. Aman untuk partial update (misal hanya update token Telegram).

**Payload:**
```json
{
  "channels": {
    "telegram": {
      "accounts": {
        "default": { "botToken": "NEW_TOKEN" }
      }
    }
  }
}
```

### 4. Tambah API Key (Auth)
**POST** `/auth/add`

Helper khusus untuk menambah profile auth secara aman ke `auth-profiles.json`.

**Payload:**
```json
{
  "provider": "google",
  "key": "sk-...",
  "mode": "api_key"
}
```

### 5. Eksekusi CLI Command (Universal)
**POST** `/command`

Menjalankan perintah CLI `openclaw` dari dalam container (sebagai user `node` yang benar).

**Payload:**
```json
{
  "args": ["agents", "list", "--json"]
}
```

**Response:**
```json
{
  "ok": true,
  "data": { ...parsed_json... }, // Jika output CLI adalah JSON valid
  "stdout": "...",
  "stderr": "..."
}
```

## 🛠️ Implementasi

### 1. Plugin Injection (Backend Go)
Saat Project dibuat (`Create`), Backend melakukan:
1. Copy folder `assets/aiagenz-bridge` ke `/home/node/.openclaw/extensions/aiagenz-bridge`.
2. Inject `openclaw.json` minimal yang meng-enable plugin ini:
   ```json
   "plugins": { "entries": { "aiagenz-bridge": { "enabled": true } } }
   ```
3. Fix permission folder agar dimiliki user `node`.

### 2. Kode Plugin (JS)
Lihat `index.js`. Menggunakan module standard Node.js (`http`, `fs`, `child_process`) tanpa dependensi eksternal (`npm install` tidak diperlukan) agar ringan dan portabel.

### 3. Kode Client (Go)
Backend menggunakan helper `CallBridge`:
```go
func (s *ProjectService) CallBridge(ctx, containerID, method, path, body)
```
Fungsi ini otomatis:
- Mencari IP Container via Docker Inspect.
- Mengirim request HTTP dengan timeout.
- Menangani error JSON/HTTP.

## 🐛 Troubleshooting

Jika Bridge tidak bisa dihubungi (Backend fallback ke `docker exec`):

1. **Cek Log Container:**
   Apakah ada log `[aiagenz-bridge] Starting Control Plane...`?
   Jika tidak, plugin gagal load (cek `manifest.json` atau permission folder).

2. **Cek Port:**
   Apakah container punya IP? (`docker inspect <id>`).
   Apakah port 4444 open? (Coba `curl` dari dalam container lain di network yang sama).

3. **Restart:**
   Kadang `gVisor` networking stuck. Restart container biasanya memperbaiki masalah.
