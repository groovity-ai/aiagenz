const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// --- CONFIGURATION ---
const PORT = 4444;

// Default paths — anchored to OpenClaw STATE_DIR (same as entrypoint.sh)
const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || '/home/node', '.openclaw');
let CONFIG_PATH = path.join(STATE_DIR, 'openclaw.json');
let AUTH_PROFILES_PATH = path.join(STATE_DIR, 'agents/main/agent/auth-profiles.json');
let WORKSPACE_PATH = STATE_DIR;

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

        // Merge: openclaw.json has metadata (provider, mode), auth-profiles.json has credentials (key)
        // For display, merge keys from auth-profiles.json INTO config.auth.profiles
        if (auth.profiles) {
            if (!config.auth) config.auth = {};
            if (!config.auth.profiles) config.auth.profiles = {};
            for (const [k, v] of Object.entries(auth.profiles)) {
                if (!config.auth.profiles[k]) {
                    // Profile only in auth-profiles.json — add metadata to config
                    config.auth.profiles[k] = { provider: v.provider, mode: v.type || v.mode || 'api_key' };
                }
                // Merge key for display (frontend reads this)
                if (v.key) {
                    config.auth.profiles[k].key = v.key;
                }
            }
        }
        res.json(config);
    },


    'POST:/config/update': (req, res, body) => {
        try {
            const current = readJson(CONFIG_PATH);
            const updates = JSON.parse(body);
            console.log('[bridge] Config Update Received. Keys:', Object.keys(updates));
            if (updates.auth?.profiles) {
                console.log('[bridge] Auth Profiles Update:', Object.keys(updates.auth.profiles));
            }

            // SPLIT & SANITIZE: auth.profiles with keys go to auth-profiles.json ONLY
            // openclaw.json gets SANITIZED profiles (provider + mode, NO keys)
            if (updates.auth && updates.auth.profiles) {
                const profiles = updates.auth.profiles;
                const currentAuth = readJson(AUTH_PROFILES_PATH);
                if (!currentAuth.profiles) currentAuth.profiles = {};
                if (!currentAuth.version) currentAuth.version = 1;

                // Write full profiles (with key) to auth-profiles.json
                for (const [k, v] of Object.entries(profiles)) {
                    if (v && typeof v === 'object') {
                        const existingKey = currentAuth.profiles[k]?.key;
                        const newKey = v.key || existingKey; // Retain existing key if none provided

                        currentAuth.profiles[k] = {
                            type: v.type || v.mode || 'api_key',  // auth-profiles uses 'type'
                            provider: v.provider,
                            ...(newKey ? { key: newKey } : {}),
                        };
                    }
                }
                writeJson(AUTH_PROFILES_PATH, currentAuth);
                console.log('[bridge] Wrote auth profiles to auth-profiles.json');

                // SANITIZE: strip keys before writing to openclaw.json
                const sanitized = {};
                for (const [k, v] of Object.entries(profiles)) {
                    if (v && typeof v === 'object') {
                        let mode = v.mode || v.type || 'token';
                        if (mode === 'api_key') mode = 'token'; // openclaw.json expects 'token', not 'api_key'
                        sanitized[k] = { provider: v.provider, mode };
                    }
                }
                updates.auth.profiles = sanitized;
            }


            // Normalize token
            if (updates.channels?.telegram?.accounts?.default?.token) {
                if (!updates.channels.telegram.accounts.default.botToken) {
                    updates.channels.telegram.accounts.default.botToken = updates.channels.telegram.accounts.default.token;
                }
                delete updates.channels.telegram.accounts.default.token;
            }

            const merged = mergeDeep(current, updates);

            // SECURITY/SCHEMA FIX: Do not deep-merge auth.profiles, as it preserves old invalid keys (like 'type: api_key')
            // Force overwrite with the strictly sanitized profiles payload.
            if (updates.auth?.profiles) {
                if (!merged.auth) merged.auth = {};
                merged.auth.profiles = updates.auth.profiles;
            }

            writeJson(CONFIG_PATH, merged);

            res.json({ ok: true, message: "Config updated" });

            // Reload Strategy
            const strategy = req.headers['x-strategy'] || 'restart';

            if (strategy === 'restart') {
                if (req.headers['x-reload'] === 'true') {
                    console.log('[bridge] Strategy: Restarting process...');
                    setTimeout(() => {
                        try { process.kill(process.ppid, 'SIGHUP'); } catch (e) { process.exit(0); }
                    }, 500);
                }
            } else if (strategy === 'hot-reload') {
                console.log('[bridge] Strategy: Hot Reload (File written, skipping restart)');
                // Ideally, trigger OpenClaw internal reload here if API exists
                // if (state.api?.config?.reload) state.api.config.reload();
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    'POST:/auth/add': (req, res, body) => {
        try {
            const { provider, key, mode } = JSON.parse(body);
            const profileKey = `${provider}:default`;

            // 1. Write key to auth-profiles.json ONLY (OpenClaw reads keys from here)
            const currentAuth = readJson(AUTH_PROFILES_PATH);
            if (!currentAuth.version) currentAuth.version = 1;
            if (!currentAuth.profiles) currentAuth.profiles = {};
            currentAuth.profiles[profileKey] = {
                type: mode || 'api_key',   // auth-profiles.json uses 'type' not 'mode'
                provider,
                key,
            };
            writeJson(AUTH_PROFILES_PATH, currentAuth);
            console.log(`[bridge] POST /auth/add: wrote key for ${profileKey} to auth-profiles.json`);

            // 2. Update openclaw.json with METADATA ONLY (no key!)
            const config = readJson(CONFIG_PATH);
            if (!config.auth) config.auth = {};
            if (!config.auth.profiles) config.auth.profiles = {};

            let ocMode = mode || 'token';
            if (ocMode === 'api_key') ocMode = 'token';

            config.auth.profiles[profileKey] = {
                provider,
                mode: ocMode,   // openclaw.json uses 'mode: token' or 'mode: oauth'
            };
            // Ensure auth.order includes this provider
            if (!config.auth.order) config.auth.order = {};
            config.auth.order[provider] = [profileKey];
            writeJson(CONFIG_PATH, config);
            console.log(`[bridge] POST /auth/add: wrote metadata for ${profileKey} to openclaw.json`);

            res.json({ ok: true, message: 'Auth added' });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    'POST:/command': (req, res, body) => {
        try {
            const { args } = JSON.parse(body);
            execFile('openclaw', args, { env: process.env, timeout: 30000 }, (error, stdout, stderr) => {
                let data = stdout;
                let isJson = false;
                try {
                    // Try to parse JSON output
                    if (stdout && stdout.trim()) {
                        data = JSON.parse(stdout);
                        isJson = true;
                    }
                } catch (e) { }

                // If error (exit code != 0) AND we didn't get valid JSON, then it's a real failure
                if (error && !isJson) {
                    res.status(500).json({ ok: false, error: error.message, stdout, stderr });
                } else {
                    // If we got JSON, treat as success (ok: true) even if exit code was 1 (e.g. doctor found issues)
                    // Or if no error, return text output
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
        // NOTE: We intentionally do NOT update AUTH_PROFILES_PATH from context.workspacePath.
        // context.workspacePath is the AGENT workspace (e.g. /home/node/workspace),
        // NOT the state dir where auth-profiles.json lives.
        // Paths are already set correctly at module-load time from STATE_DIR env var.
        if (context?.workspacePath) {
            WORKSPACE_PATH = context.workspacePath;
            // Only update CONFIG_PATH if it's inside STATE_DIR (safeguard)
            const stateBasedConfig = path.join(STATE_DIR, 'openclaw.json');
            if (fs.existsSync(stateBasedConfig)) {
                CONFIG_PATH = stateBasedConfig; // Re-affirm correct path
            }
        }
        console.log(`[aiagenz-bridge] Activated. STATE_DIR=${STATE_DIR} CONFIG_PATH=${CONFIG_PATH} AUTH_PROFILES_PATH=${AUTH_PROFILES_PATH}`);
        // Server already started in register()
    },

    async deactivate() { server.close(); }
};
