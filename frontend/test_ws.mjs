import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:18789');

ws.on('open', () => {
    console.log('Connected to gateway. Sending connect...');
    // Simulated Go Proxy Handshake
    ws.send(JSON.stringify({
        type: "req",
        id: "init-1",
        method: "connect",
        params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
                id: "cli",
                displayName: "Test Script",
                version: "1.0.0",
                platform: "node",
                mode: "cli"
            },
            role: "operator",
            scopes: ["operator.read", "operator.write", "operator.admin"],
            auth: {
                // Testing what the Go backend sends
                password: "641f7299-688b-4446-b076-6b33b9858f95" // The project ID from user's earlier logs
            }
        }
    }));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('RECV:', JSON.stringify(msg, null, 2));

    if (msg.type === 'res' && msg.id === 'init-1' && msg.ok) {
        console.log('Handshake OK. Sending chat...');
        const frameId = Date.now().toString();
        // Send the chat.send request just like the React frontend
        ws.send(JSON.stringify({
            type: "req",
            id: frameId,
            method: "chat.send",
            params: {
                message: "Hello from test script!",
                idempotencyKey: frameId
            }
        }));
    }
});

ws.on('close', (code, reason) => {
    console.log(`Connection closed: ${code} - ${reason}`);
});

ws.on('error', (err) => {
    console.error(`WS Error:`, err);
});
