const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// --- CONFIGURATION ---
const PORT = 4444;

// Default paths
let CONFIG_PATH = '/home/node/.openclaw/openclaw.json';
let AUTH_PROFILES_PATH = '/home/node/.openclaw/agents/main/agent/auth-profiles.json';
let WORKSPACE_PATH = '/home/node/.openclaw';

// --- PLUGIN STATE ---
const state = {
    api: null,
    context: null,
    activeSessions: 0,
    recentCommands: [],
    lastEvent: null,
    startedAt: null
};

// --- UTILITIES ---

const readJson = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return {};
    }
};

const writeJson = (filePath, data) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
};

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

// Track a command event (ring buffer, max 20)
const trackCommand = (command) => {
    state.recentCommands.push({ command, timestamp: new Date().toISOString() });
    if (state.recentCommands.length > 20) state.recentCommands.shift();
};

// --- HTTP HANDLERS ---

const handlers = {
    'GET:/status': (req, res) => {
        const config = readJson(CONFIG_PATH);
        const auth = readJson(AUTH_PROFILES_PATH);
        res.json({
            ok: true,
            uptime: process.uptime(),
            pid: process.pid,
            summary: {
                telegram: { enabled: config.channels?.telegram?.enabled },
                auth_profiles: Object.keys(auth.profiles || {})
            }
        });
    },

    'GET:/config': (req, res) => {
        const config = readJson(CONFIG_PATH);
        const auth = readJson(AUTH_PROFILES_PATH);
        if (auth.profiles) {
            if (!config.auth) config.auth = {};
            config.auth.profiles = auth.profiles;
        }
        res.json(config);
    },

    'POST:/config/update': (req, res, body) => {
        try {
            const current = readJson(CONFIG_PATH);
            const updates = JSON.parse(body);

            // Normalize token
            if (updates.channels?.telegram?.accounts?.default?.token) {
                if (!updates.channels.telegram.accounts.default.botToken) {
                    updates.channels.telegram.accounts.default.botToken = updates.channels.telegram.accounts.default.token;
                }
                delete updates.channels.telegram.accounts.default.token;
            }

            const merged = mergeDeep(current, updates);
            writeJson(CONFIG_PATH, merged);

            res.json({ ok: true, message: "Config updated" });

            // Graceful reload
            if (req.headers['x-reload'] === 'true') {
                setTimeout(() => {
                    try { process.kill(process.ppid, 'SIGHUP'); } catch (e) { process.exit(0); }
                }, 500);
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    'POST:/auth/add': (req, res, body) => {
        try {
            const { provider, key, type, mode } = JSON.parse(body);
            const current = readJson(AUTH_PROFILES_PATH);
            if (!current.profiles) current.profiles = {};
            current.profiles[`${provider}:default`] = { provider, type: type || mode || 'api_key', key };
            writeJson(AUTH_PROFILES_PATH, current);

            res.json({ ok: true, message: "Auth added" });

            setTimeout(() => {
                try { process.kill(process.ppid, 'SIGHUP'); } catch (e) { process.exit(0); }
            }, 500);
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    'POST:/command': (req, res, body) => {
        try {
            const { args } = JSON.parse(body);
            execFile('openclaw', args, { env: process.env, timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    res.status(500).json({ ok: false, error: error.message, stdout, stderr });
                } else {
                    let data = stdout;
                    try { data = JSON.parse(stdout); } catch (e) { }
                    res.json({ ok: true, data, stderr });
                }
            });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    'POST:/auth/login': (req, res, body) => {
        try {
            const { provider } = JSON.parse(body);
            if (!provider) return res.status(400).json({ ok: false, error: 'provider required' });

            execFile('openclaw', ['models', 'auth', 'login', '--provider', provider, '--no-browser'],
                { env: process.env, timeout: 15000 },
                (error, stdout, stderr) => {
                    if (error) {
                        res.status(500).json({ ok: false, error: error.message, stdout, stderr });
                    } else {
                        res.json({ ok: true, data: stdout.trim() });
                    }
                }
            );
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    'POST:/auth/callback': (req, res, body) => {
        try {
            const { provider, callbackUrl } = JSON.parse(body);
            if (!provider || !callbackUrl) return res.status(400).json({ ok: false, error: 'provider and callbackUrl required' });

            const child = require('child_process').spawn('openclaw',
                ['models', 'auth', 'login', '--provider', provider, '--no-browser'],
                { env: process.env, timeout: 15000 }
            );

            let stdout = '', stderr = '';
            child.stdout.on('data', d => stdout += d);
            child.stderr.on('data', d => stderr += d);

            // Wait briefly for the prompt, then send callback URL
            setTimeout(() => { child.stdin.write(callbackUrl + '\n'); }, 2000);

            child.on('close', (code) => {
                if (code !== 0) {
                    res.status(500).json({ ok: false, error: `exit code ${code}`, stdout, stderr });
                } else {
                    res.json({ ok: true, data: stdout.trim() });
                }
            });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    }
};

// --- HTTP SERVER ---

const server = http.createServer((req, res) => {
    res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const urlPath = req.url.split('?')[0];
        const key = `${req.method}:${urlPath}`;
        if (handlers[key]) {
            handlers[key](req, res, body);
        } else {
            res.status(404).json({ ok: false, error: "Not Found" });
        }
    });
});

module.exports = {
    id: "aiagenz-bridge",
    name: "AiAgenz Bridge",
    description: "Internal Control Plane for AiAgenz Dashboard",

    register(api) {
        state.api = api;
        console.log('[aiagenz-bridge] Registered with OpenClaw Plugin API');

        // Start server IMMEDIATELY on register to be ready ASAP
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`[aiagenz-bridge] Control Plane listening on 0.0.0.0:${PORT}`);
        });

        // Subscribe to OpenClaw events for real-time tracking
        try {
            if (typeof api.on === 'function') {
                api.on('session:start', (data) => {
                    state.activeSessions++;
                    state.lastEvent = { type: 'session:start', at: new Date().toISOString() };
                });
                api.on('session:end', (data) => {
                    state.activeSessions = Math.max(0, state.activeSessions - 1);
                    state.lastEvent = { type: 'session:end', at: new Date().toISOString() };
                });
                api.on('command:new', (data) => {
                    trackCommand(`event:${data?.command || 'unknown'}`);
                    state.lastEvent = { type: 'command:new', at: new Date().toISOString(), data };
                });
            }
        } catch (e) {
            console.log('[aiagenz-bridge] Event subscription failed:', e.message);
        }
    },

    async activate(context) {
        if (context?.workspacePath) {
            WORKSPACE_PATH = context.workspacePath;
            CONFIG_PATH = path.join(WORKSPACE_PATH, 'openclaw.json');
            AUTH_PROFILES_PATH = path.join(WORKSPACE_PATH, 'agents', 'main', 'agent', 'auth-profiles.json');
        }
        console.log('[aiagenz-bridge] Activated (Context Loaded)');
        // Server already started in register()
    },

    async deactivate() { server.close(); }
};
