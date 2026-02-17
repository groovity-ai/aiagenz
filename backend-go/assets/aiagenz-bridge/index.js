const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');

// Configuration
const PORT = 4444; // Port khusus buat AiAgenz Bridge
const CONFIG_PATH = '/home/node/.openclaw/openclaw.json';
const AUTH_PROFILES_PATH = '/home/node/.openclaw/agents/main/agent/auth-profiles.json';

// Utility: Read JSON
const readJson = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return {};
    }
};

// Utility: Write JSON
const writeJson = (filePath, data) => {
    // Ensure dir exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Atomic write
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
};

// Utility: Merge Deep (recursive, non-mutating on source)
const mergeDeep = (target = {}, source = {}) => {
    const result = { ...target };
    for (const key in source) {
        if (
            source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
            result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
        ) {
            result[key] = mergeDeep(result[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
};

// --- HANDLERS ---

const handlers = {
    // GET /status
    'GET:/status': (req, res) => {
        // Basic health check + Config summary
        const config = readJson(CONFIG_PATH);
        const auth = readJson(AUTH_PROFILES_PATH);

        const telegramEnabled = config.channels?.telegram?.enabled || false;
        const telegramToken = config.channels?.telegram?.accounts?.default?.botToken ? "SET" : "MISSING";

        res.json({
            ok: true,
            uptime: process.uptime(),
            pid: process.pid,
            memory: process.memoryUsage(),
            summary: {
                telegram: { enabled: telegramEnabled, token: telegramToken },
                auth_profiles: Object.keys(auth.profiles || {}),
                gateway_port: config.gateway?.port
            }
        });
    },

    // GET /config (Read Full Config)
    'GET:/config': (req, res) => {
        const config = readJson(CONFIG_PATH);
        // Inject auth profiles for dashboard visibility
        const auth = readJson(AUTH_PROFILES_PATH);
        if (auth.profiles) {
            if (!config.auth) config.auth = {};
            config.auth.profiles = auth.profiles;
        }
        res.json(config);
    },

    // POST /config/update (Merge Config)
    'POST:/config/update': (req, res, body) => {
        try {
            const current = readJson(CONFIG_PATH);
            const updates = JSON.parse(body);

            // Special Logic: Map 'token' to 'botToken' for Telegram if needed
            if (updates.channels?.telegram?.accounts?.default?.token) {
                if (!updates.channels.telegram.accounts.default.botToken) {
                    updates.channels.telegram.accounts.default.botToken = updates.channels.telegram.accounts.default.token;
                }
                delete updates.channels.telegram.accounts.default.token;
            }

            // Merge
            const merged = mergeDeep(current, updates);
            writeJson(CONFIG_PATH, merged);

            res.json({ ok: true, message: "Config updated" });

            // Optional: Trigger reload if requested
            if (req.headers['x-reload'] === 'true') {
                setTimeout(() => process.exit(0), 500); // Let Docker restart us
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    // POST /auth/add (Add Profile)
    'POST:/auth/add': (req, res, body) => {
        try {
            const { provider, key, mode } = JSON.parse(body);
            if (!provider || !key) throw new Error("Missing provider or key");

            const current = readJson(AUTH_PROFILES_PATH);
            if (!current.profiles) current.profiles = {};

            const profileKey = `${provider}:default`;
            current.profiles[profileKey] = {
                provider,
                mode: mode || 'api_key',
                key
            };

            writeJson(AUTH_PROFILES_PATH, current);
            res.json({ ok: true, message: `Auth profile ${profileKey} added` });

            // Trigger reload to apply auth
            setTimeout(() => process.exit(0), 500);
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    // POST /restart
    'POST:/restart': (req, res) => {
        res.json({ ok: true, message: "Restarting..." });
        setTimeout(() => process.exit(0), 100);
    },

    // POST /command (Execute CLI)
    'POST:/command': (req, res, body) => {
        try {
            const { args } = JSON.parse(body);
            if (!Array.isArray(args)) throw new Error("Invalid args");

            // Execute openclaw CLI
            // Use --json output for parsing ease
            const child = execFile('openclaw', args, {
                env: process.env,
                timeout: 30000 // 30s timeout
            }, (error, stdout, stderr) => {
                if (error) {
                    // Return stdout too because CLI might print error json to stdout
                    res.status(500).json({
                        ok: false,
                        error: error.message,
                        code: error.code,
                        stdout: stdout,
                        stderr: stderr
                    });
                    return;
                }

                // Try parse JSON if possible, otherwise return string
                let data = stdout;
                try {
                    data = JSON.parse(stdout);
                } catch (e) {
                    // Raw string
                }

                res.json({ ok: true, data: data, stderr: stderr });
            });

        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    }
};

// --- SERVER ---

const server = http.createServer((req, res) => {
    // Helper to send JSON
    res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };

    // Body Parser
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const key = `${req.method}:${req.url}`;
        if (handlers[key]) {
            handlers[key](req, res, body);
        } else {
            res.status(404).json({ ok: false, error: "Not Found" });
        }
    });
});

// ENTRY POINT: OpenClaw Plugin Interface
module.exports = {
    id: "aiagenz-bridge",
    name: "AiAgenz Bridge",
    description: "Internal Control Plane for Dashboard",

    // OpenClaw calls this when loading the plugin
    activate: async (context) => {
        console.log(`[aiagenz-bridge] Starting Control Plane on port ${PORT}...`);

        return new Promise((resolve) => {
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`[aiagenz-bridge] Listening on 0.0.0.0:${PORT}`);
                resolve();
            });
        });
    },

    deactivate: async () => {
        server.close();
    }
};
