const pty = require('@lydell/node-pty');

console.log("Starting node-pty test...");

const ptyProcess = pty.spawn('openclaw',
    ['models', 'auth', 'login', '--provider', 'google-antigravity', '--no-browser'],
    {
        name: 'xterm-color',
        cols: 120,
        rows: 30,
        cwd: process.cwd(),
        env: process.env
    }
);

ptyProcess.onData((data) => {
    console.log(`[PTY] ${data}`);

    if (data.includes('Auth URL:')) {
        const match = data.match(/Auth URL:\s*(https?:\/\/[^\s]+)/);
        if (match) {
            console.log("\n\n>>> EXTRACTED URL:", match[1], "\n\n");
            process.exit(0);
        }
    }
});

ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] Exited with code ${exitCode}`);
});

setTimeout(() => {
    console.log("Timeout reached.");
    process.exit(1);
}, 15000);
