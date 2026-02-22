const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
let pty;
try {
    pty = require('@lydell/node-pty');
} catch (e) {
    console.log("[aiagenz-bridge] Standard require failed, attempting absolute path fallback...");
    pty = require('/app/node_modules/@lydell/node-pty');
}

// --- CONFIGURATION ---
const PORT = 4444;

// Default paths — anchored to OpenClaw STATE_DIR (same as entrypoint.sh)
const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || '/home/node', '.openclaw');
let CONFIG_PATH = path.join(STATE_DIR, 'openclaw.json');
let AUTH_PROFILES_PATH = path.join(STATE_DIR, 'agents/main/agent/auth-profiles.json');
let WORKSPACE_PATH = STATE_DIR;

// Map to store active OAuth PTY sessions: provider -> { ptyProcess, outputBuffer, lastActivity }
const activeAuthFlows = {};

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
                        let mode = v.mode || v.type || 'api_key'; // Default to api_key for LLM providers
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

            // OAuth providers require their auth plugin to be enabled first.
            const OAUTH_PLUGIN_MAP = {
                'google-antigravity': 'google-antigravity-auth',
                'google-gemini-cli': 'google-gemini-cli-auth',
                'openai-codex': 'openai-codex-auth',
                'qwen-portal': 'qwen-portal-auth',
            };

            const pluginName = OAUTH_PLUGIN_MAP[provider];

            const runLoginPty = () => {
                // Kill any existing flow for this provider
                if (activeAuthFlows[provider]) {
                    try { activeAuthFlows[provider].ptyProcess.kill(); } catch (e) { }
                    delete activeAuthFlows[provider];
                }

                // Spawn openclaw using node-pty to emulate a real terminal
                const ptyProcess = pty.spawn('openclaw',
                    ['models', 'auth', 'login', '--provider', provider, '--set-default', '--no-browser'],
                    {
                        name: 'xterm-color',
                        cols: 120,
                        rows: 30,
                        cwd: process.cwd(),
                        env: process.env
                    }
                );

                activeAuthFlows[provider] = {
                    ptyProcess,
                    outputBuffer: '',
                    lastActivity: Date.now()
                };

                let urlFound = false;
                let errorFound = false;

                const onData = (data) => {
                    const flow = activeAuthFlows[provider];
                    if (!flow) return;

                    flow.outputBuffer += data;
                    flow.lastActivity = Date.now();

                    // console.log(`[bridge-pty] ${data}`); // Debugging

                    // Look for the auth URL
                    if (!urlFound && flow.outputBuffer.includes('Auth URL:')) {
                        urlFound = true;

                        // Extract URL
                        // Example output: "Auth URL: https://accounts.google.com/o/oauth..."
                        const match = flow.outputBuffer.match(/Auth URL:\s*(https?:\/\/[^\s]+)/);
                        const url = match ? match[1] : flow.outputBuffer;

                        // Wait a tiny bit to ensure the prompt for the callback is ready
                        setTimeout(() => {
                            if (!res.headersSent) {
                                res.json({ ok: true, data: url });
                            }
                        }, 500);
                    }

                    // Look for prompt indicating it's ready for the redirect URL
                    if (!urlFound && flow.outputBuffer.includes('Paste the redirect URL')) {
                        // Usually accompanied by "Copy this URL:" before it.
                        // Fallback if "Auth URL:" wasn't strictly found but the prompt is there.
                        const match = flow.outputBuffer.match(/Copy this URL:\r?\n(https?:\/\/[^\s]+)/);
                        if (match && !res.headersSent) {
                            urlFound = true;
                            res.json({ ok: true, data: match[1] });
                        }
                    }

                    // If it exits immediately or shows an error
                    if (flow.outputBuffer.includes('Error:') && !res.headersSent) {
                        errorFound = true;
                        res.status(500).json({ ok: false, error: flow.outputBuffer });
                        try { ptyProcess.kill(); } catch (e) { }
                        delete activeAuthFlows[provider];
                    }
                };

                ptyProcess.onData(onData);

                ptyProcess.onExit(({ exitCode }) => {
                    console.log(`[bridge] PTY process for ${provider} exited with code ${exitCode}`);
                    delete activeAuthFlows[provider];
                    if (!urlFound && !errorFound && !res.headersSent) {
                        res.status(500).json({ ok: false, error: 'Process exited before outputting URL' });
                    }
                });

                // Fail-safe timeout for Step 1
                setTimeout(() => {
                    if (!urlFound && !res.headersSent) {
                        res.status(500).json({ ok: false, error: 'Timeout waiting for OAuth URL' });
                        try { ptyProcess.kill(); } catch (e) { }
                        delete activeAuthFlows[provider];
                    }
                }, 10000);
            };

            if (pluginName) {
                console.log(`[bridge] Auto-enabling plugin: ${pluginName}`);
                execFile('openclaw', ['plugins', 'enable', pluginName],
                    { env: process.env, timeout: 10000 },
                    (err, out, serr) => {
                        if (err) console.log(`[bridge] Plugin enable warning: ${err.message}`);
                        runLoginPty();
                    }
                );
            } else {
                runLoginPty();
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    'POST:/auth/callback': (req, res, body) => {
        try {
            const { provider, callbackUrl } = JSON.parse(body);
            if (!provider || !callbackUrl) return res.status(400).json({ ok: false, error: 'provider and callbackUrl required' });

            const flow = activeAuthFlows[provider];
            if (!flow) {
                return res.status(400).json({ ok: false, error: 'No active OAuth flow found for this provider. Please start over.' });
            }

            // Write the callback URL and a carriage return to the PTY stdin
            flow.ptyProcess.write(callbackUrl + '\r');
            flow.outputBuffer = ''; // Reset buffer to capture step 2 output

            let successResponded = false;

            const onDataStep2 = (data) => {
                flow.outputBuffer += data;

                // Example success output: "Auth profile: google-antigravity:manual" or "Antigravity OAuth complete"
                if (!successResponded && (flow.outputBuffer.includes('Auth profile:') || flow.outputBuffer.includes('complete'))) {
                    successResponded = true;
                    // Wait briefly for write to complete
                    setTimeout(() => {
                        if (!res.headersSent) {
                            res.json({ ok: true, data: flow.outputBuffer });
                        }
                    }, 1000);
                }

                if (!successResponded && (flow.outputBuffer.includes('Error') || flow.outputBuffer.includes('mismatch') || flow.outputBuffer.includes('failed'))) {
                    successResponded = true;
                    if (!res.headersSent) {
                        res.status(500).json({ ok: false, error: flow.outputBuffer });
                    }
                    try { flow.ptyProcess.kill(); } catch (e) { }
                    delete activeAuthFlows[provider];
                }
            };

            // Switch the data listener to step 2 logic
            flow.ptyProcess.removeAllListeners('data');
            // node-pty onData returns a disposable, we just hook a new listener
            flow.ptyProcess.onData(onDataStep2);

            // Fail-safe timeout for Step 2
            setTimeout(() => {
                if (!successResponded && !res.headersSent) {
                    res.status(500).json({ ok: false, error: 'Timeout waiting for OAuth to complete. Output: ' + flow.outputBuffer });
                    try { flow.ptyProcess.kill(); } catch (e) { }
                    delete activeAuthFlows[provider];
                }
            }, 20000);

            // Inherit the exit handler from step 1

        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    },

    'GET:/sessions': (req, res) => {
        execFile('openclaw', ['sessions', 'list', '--json'], { env: process.env, timeout: 15000 }, (error, stdout, stderr) => {
            if (error && error.code !== 1) { // OpenClaw might exit with 1 if there's a warning but valid JSON
                return res.status(500).json({ ok: false, error: error.message, stderr });
            }
            try {
                res.json({ ok: true, data: JSON.parse(stdout) });
            } catch (e) {
                res.status(500).json({ ok: false, error: "Failed to parse session list JSON", stdout });
            }
        });
    },

    'GET:/sessions/:id/history': (req, res, body, id) => {
        execFile('openclaw', ['sessions', 'history', id, '--json'], { env: process.env, timeout: 15000 }, (error, stdout, stderr) => {
            if (error && error.code !== 1) {
                return res.status(500).json({ ok: false, error: error.message, stderr });
            }
            try {
                res.json({ ok: true, data: JSON.parse(stdout) });
            } catch (e) {
                res.status(500).json({ ok: false, error: "Failed to parse session history JSON", stdout });
            }
        });
    },

    'DELETE:/sessions/:id': (req, res, body, id) => {
        execFile('openclaw', ['sessions', 'remove', id], { env: process.env, timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ ok: false, error: error.message, stderr });
            }
            res.json({ ok: true, message: `Session ${id} deleted` });
        });
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
        } else if (req.method === 'GET' && urlPath.startsWith('/sessions/') && urlPath.endsWith('/history')) {
            const id = urlPath.split('/')[2];
            handlers['GET:/sessions/:id/history'](req, res, body, id);
        } else if (req.method === 'DELETE' && urlPath.startsWith('/sessions/')) {
            const id = urlPath.split('/')[2];
            handlers['DELETE:/sessions/:id'](req, res, body, id);
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
