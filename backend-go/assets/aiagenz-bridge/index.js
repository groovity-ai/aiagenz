const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');

// --- CONFIGURATION ---
const PORT = 4444;

// Default paths (overridden by context.workspacePath if available)
let CONFIG_PATH = '/home/node/.openclaw/openclaw.json';
let AUTH_PROFILES_PATH = '/home/node/.openclaw/agents/main/agent/auth-profiles.json';
let WORKSPACE_PATH = '/home/node/.openclaw';

// --- PLUGIN STATE ---
// Stores references from register(api) and activate(context)
const state = {
    api: null,          // OpenClaw Plugin API reference
    context: null,      // OpenClaw activation context
    activeSessions: 0,  // Tracked via session:start / session:end events
    recentCommands: [], // Last 20 commands (ring buffer)
    lastEvent: null,    // Last event received
    startedAt: null,    // Plugin start timestamp
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
    // Atomic write
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
    // GET /status — enhanced with live event data
    'GET:/status': (req, res) => {
        const config = readJson(CONFIG_PATH);
        const auth = readJson(AUTH_PROFILES_PATH);

        const telegramEnabled = config.channels?.telegram?.enabled || false;
        const telegramToken = config.channels?.telegram?.accounts?.default?.botToken ? "SET" : "MISSING";

        res.json({
            ok: true,
            uptime: process.uptime(),
            pid: process.pid,
            memory: process.memoryUsage(),
            startedAt: state.startedAt,
            hasApi: !!state.api,
            activeSessions: state.activeSessions,
            recentCommands: state.recentCommands.slice(-5), // last 5
            lastEvent: state.lastEvent,
            summary: {
                telegram: { enabled: telegramEnabled, token: telegramToken },
                auth_profiles: Object.keys(auth.profiles || {}),
                gateway_port: config.gateway?.port
            },
            paths: {
                config: CONFIG_PATH,
                authProfiles: AUTH_PROFILES_PATH,
                workspace: WORKSPACE_PATH
            }
        });
    },

    // GET /config
    'GET:/config': (req, res) => {
        const config = readJson(CONFIG_PATH);
        const auth = readJson(AUTH_PROFILES_PATH);
        if (auth.profiles) {
            if (!config.auth) config.auth = {};
            config.auth.profiles = auth.profiles;
        }
        res.json(config);
    },

    // POST /config/update
    'POST:/config/update': (req, res, body) => {
        try {
            const current = readJson(CONFIG_PATH);
            const updates = JSON.parse(body);

            // Normalize token → botToken for Telegram
            if (updates.channels?.telegram?.accounts?.default?.token) {
                if (!updates.channels.telegram.accounts.default.botToken) {
                    updates.channels.telegram.accounts.default.botToken = updates.channels.telegram.accounts.default.token;
                }
                delete updates.channels.telegram.accounts.default.token;
            }

            const merged = mergeDeep(current, updates);
            writeJson(CONFIG_PATH, merged);

            trackCommand('config:update');
            res.json({ ok: true, message: "Config updated" });

            // Graceful reload
            if (req.headers['x-reload'] === 'true') {
                setTimeout(() => {
                    try {
                        if (process.ppid) {
                            process.kill(process.ppid, 'SIGHUP');
                            console.log('[aiagenz-bridge] Sent SIGHUP to parent for config reload');
                        } else {
                            console.log('[aiagenz-bridge] No parent PID, exiting for restart...');
                            process.exit(0);
                        }
                    } catch (e) {
                        console.log('[aiagenz-bridge] SIGHUP failed, exiting for restart:', e.message);
                        process.exit(0);
                    }
                }, 500);
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    // POST /auth/add
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
            trackCommand(`auth:add:${provider}`);
            res.json({ ok: true, message: `Auth profile ${profileKey} added` });

            // Graceful reload
            setTimeout(() => {
                try {
                    if (process.ppid) {
                        process.kill(process.ppid, 'SIGHUP');
                    } else {
                        process.exit(0);
                    }
                } catch (e) {
                    process.exit(0);
                }
            }, 500);
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    // POST /restart
    'POST:/restart': (req, res) => {
        trackCommand('restart');
        res.json({ ok: true, message: "Restarting..." });
        setTimeout(() => process.exit(0), 100);
    },

    // POST /command
    'POST:/command': (req, res, body) => {
        try {
            const { args } = JSON.parse(body);
            if (!Array.isArray(args)) throw new Error("Invalid args");

            trackCommand(`cli:${args.join(' ')}`);

            execFile('openclaw', args, {
                env: process.env,
                timeout: 30000
            }, (error, stdout, stderr) => {
                if (error) {
                    res.status(500).json({
                        ok: false,
                        error: error.message,
                        code: error.code,
                        stdout: stdout,
                        stderr: stderr
                    });
                    return;
                }

                let data = stdout;
                try {
                    data = JSON.parse(stdout);
                } catch (e) {
                    // Raw string output
                }

                res.json({ ok: true, data: data, stderr: stderr });
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
        // Strip query params for route matching
        const urlPath = req.url.split('?')[0];
        const key = `${req.method}:${urlPath}`;
        if (handlers[key]) {
            handlers[key](req, res, body);
        } else {
            res.status(404).json({ ok: false, error: "Not Found" });
        }
    });
});

// --- OPENCLAW PLUGIN INTERFACE ---

module.exports = {
    id: "aiagenz-bridge",
    name: "AiAgenz Bridge",
    description: "Internal Control Plane for AiAgenz Dashboard",

    // register(api) — OpenClaw Plugin API hook
    // Called by OpenClaw's plugin loader with internal API access
    register(api) {
        state.api = api;
        console.log('[aiagenz-bridge] Registered with OpenClaw Plugin API');

        // Subscribe to OpenClaw events for real-time tracking
        try {
            if (typeof api.on === 'function') {
                api.on('session:start', (data) => {
                    state.activeSessions++;
                    state.lastEvent = { type: 'session:start', at: new Date().toISOString() };
                    console.log('[aiagenz-bridge] Session started, active:', state.activeSessions);
                });

                api.on('session:end', (data) => {
                    state.activeSessions = Math.max(0, state.activeSessions - 1);
                    state.lastEvent = { type: 'session:end', at: new Date().toISOString() };
                });

                api.on('command:new', (data) => {
                    trackCommand(`event:${data?.command || 'unknown'}`);
                    state.lastEvent = { type: 'command:new', at: new Date().toISOString(), data };
                });

                console.log('[aiagenz-bridge] Subscribed to session:start, session:end, command:new');
            } else {
                console.log('[aiagenz-bridge] api.on not available — event hooks not supported in this OpenClaw version');
            }
        } catch (e) {
            console.log('[aiagenz-bridge] Event subscription failed (non-fatal):', e.message);
        }
    },

    // activate(context) — Plugin lifecycle hook
    // Called after register(), with workspace context
    async activate(context) {
        state.context = context;
        state.startedAt = new Date().toISOString();

        // Resolve config paths from context (fallback to defaults)
        if (context?.workspacePath) {
            WORKSPACE_PATH = context.workspacePath;
            CONFIG_PATH = path.join(WORKSPACE_PATH, 'openclaw.json');
            // Auth profiles are relative to agents dir
            AUTH_PROFILES_PATH = path.join(WORKSPACE_PATH, 'agents', 'main', 'agent', 'auth-profiles.json');
            console.log(`[aiagenz-bridge] Using workspace path: ${WORKSPACE_PATH}`);
        } else {
            console.log(`[aiagenz-bridge] No workspacePath in context, using defaults: ${WORKSPACE_PATH}`);
        }

        console.log(`[aiagenz-bridge] Config: ${CONFIG_PATH}`);
        console.log(`[aiagenz-bridge] Auth:   ${AUTH_PROFILES_PATH}`);

        return new Promise((resolve) => {
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`[aiagenz-bridge] Control Plane listening on 0.0.0.0:${PORT}`);
                resolve();
            });
        });
    },

    async deactivate() {
        console.log('[aiagenz-bridge] Shutting down...');
        server.close();
    }
};
