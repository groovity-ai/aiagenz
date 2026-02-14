const express = require('express');
const cors = require('cors');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken'); // Added this
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const authMiddleware = require('./middleware/auth');

const app = express();
const port = 4001;
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// --- Auth API ---

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    // MVP: Hardcoded User
    if (email === 'admin@aiagenz.id' && password === 'admin123') {
        const token = jwt.sign(
            { sub: 'user-admin-001', email, role: 'admin' }, 
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );
        return res.json({ token, user: { id: 'user-admin-001', email } });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
});

// Apply Auth Middleware globally (SKIP for Login)
app.use((req, res, next) => {
    if (req.path === '/api/auth/login') return next();
    authMiddleware(req, res, next);
});

// Helper
const getContainerInfo = async (containerId) => {
    if (!containerId) return { status: 'stopped' };
    try {
        const container = docker.getContainer(containerId);
        const data = await container.inspect();
        return {
            status: data.State.Status,
            uptime: data.State.StartedAt,
        };
    } catch (e) {
        return { status: 'stopped' };
    }
};

// --- HTTP API ---

app.post('/api/projects', async (req, res) => {
    try {
        const userId = req.user.sub;
        const { name, type, telegramToken, apiKey } = req.body;
        const projectId = uuidv4();
        const containerName = `aiagenz-${projectId}`;
        
        let image = 'openclaw-starter:latest';
        if (name.toLowerCase().includes('sahabatcuan') || type === 'marketplace') image = 'sahabatcuan:latest';

        const env = [
            `TELEGRAM_BOT_TOKEN=${telegramToken}`,
            `GEMINI_API_KEY=${apiKey || ''}`,
            `PROJECT_ID=${projectId}`,
            `OPENCLAW_CONFIG_PATH=/app/config/openclaw.json`
        ];

        const config = { telegramToken, apiKey };

        // Save to DB
        const project = await prisma.project.create({
            data: {
                id: projectId,
                userId,
                name,
                type,
                status: 'creating',
                containerName,
                config
            }
        });

        console.log(`🚀 Deploying ${containerName} (${image})...`);

        try {
            const container = await docker.createContainer({
                Image: image,
                name: containerName,
                Env: env,
                HostConfig: {
                    Runtime: 'runsc',
                    Memory: 512 * 1024 * 1024,
                    NanoCpus: 500000000,
                    RestartPolicy: { Name: 'unless-stopped' },
                    AutoRemove: true
                }
            });

            await container.start();

            await prisma.project.update({
                where: { id: projectId },
                data: {
                    status: 'running',
                    containerId: container.id
                }
            });

            res.json({ success: true, project });

        } catch (dockerErr) {
            await prisma.project.update({
                where: { id: projectId },
                data: { status: 'failed' }
            });
            throw dockerErr;
        }

    } catch (error) {
        console.error("Deploy Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/projects', async (req, res) => {
    try {
        const userId = req.user.sub;
        const projects = await prisma.project.findMany({
            where: { userId }, // Filter by User
            orderBy: { createdAt: 'desc' }
        });

        const syncedProjects = await Promise.all(projects.map(async (p) => {
            const info = await getContainerInfo(p.containerId);
            const { config, ...safeProject } = p;
            return { ...safeProject, status: info.status || 'stopped' };
        }));

        res.json(syncedProjects);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/projects/:id', async (req, res) => {
    try {
        const userId = req.user.sub;
        const project = await prisma.project.findFirst({
            where: { id: req.params.id, userId } // Security Check
        });
        
        if (!project) return res.status(404).json({ error: "Not found" });
        
        const info = await getContainerInfo(project.containerId);
        const projectWithStatus = { ...project, status: info.status };

        const safeProject = { ...projectWithStatus };
        if (safeProject.config) {
            safeProject.config = {
                ...safeProject.config,
                telegramToken: safeProject.config.telegramToken ? "******" : undefined,
                apiKey: safeProject.config.apiKey ? "******" : undefined
            };
        }
        res.json(safeProject);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/projects/:id/:action', async (req, res) => {
    const { id, action } = req.params;
    const userId = req.user.sub;
    
    try {
        const project = await prisma.project.findFirst({ where: { id, userId } });
        if (!project || !project.containerId) return res.status(404).json({ error: "Not found or no container" });

        const container = docker.getContainer(project.containerId);
        if (action === 'start') await container.start();
        else if (action === 'stop') await container.stop();
        else if (action === 'restart') await container.restart();
        else return res.status(400).json({ error: "Invalid action" });

        await prisma.project.update({
            where: { id },
            data: { status: action === 'stop' ? 'exited' : 'running' }
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user.sub;
    
    try {
        const project = await prisma.project.findFirst({ where: { id, userId } });
        if (!project) return res.status(404).json({ error: "Not found" });

        if (project.containerId) {
            try {
                const container = docker.getContainer(project.containerId);
                await container.remove({ force: true });
            } catch(e) {}
        }

        await prisma.project.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/projects/:id/logs', async (req, res) => {
    try {
        const userId = req.user.sub;
        const project = await prisma.project.findFirst({ where: { id: req.params.id, userId } });
        if (!project || !project.containerId) return res.status(404).json({ error: "Not found" });

        const container = docker.getContainer(project.containerId);
        const logs = await container.logs({
            stdout: true,
            stderr: true,
            tail: 100,
            timestamps: true
        });
        res.send(logs.toString('utf8')); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- WebSocket Console ---

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws, req) => {
    // TODO: WebSocket Auth (Need to pass token via query param or protocol)
    // For MVP, we skip auth on WebSocket or implement simple check if needed.
    // Ideally: ws://host/projects/:id/console?token=...
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const projectId = url.pathname.split('/')[2];
    
    // DB Lookup (Ideally verify user ownership too via token)
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    
    if (!project || !project.containerId) {
        ws.send("Error: Project not found\r\n");
        ws.close();
        return;
    }

    console.log(`🔌 Console connected to ${project.containerId}`);
    
    try {
        const container = docker.getContainer(project.containerId);
        const execOptions = {
            Cmd: ['/bin/sh'],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true
        };

        container.exec(execOptions, (err, exec) => {
            if (err) {
                ws.send(`Error creating exec: ${err.message}\r\n`);
                return ws.close();
            }
            exec.start({ hijack: true, stdin: true }, (err, stream) => {
                if (err) {
                    ws.send(`Error starting exec: ${err.message}\r\n`);
                    return ws.close();
                }
                stream.on('data', chunk => {
                    if (ws.readyState === WebSocket.OPEN) ws.send(chunk.toString());
                });
                ws.on('message', msg => stream.write(msg));
                ws.on('close', () => stream.end());
                stream.on('end', () => ws.close());
            });
        });
    } catch (e) {
        console.error("Console Error:", e);
        ws.close();
    }
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Backend API & WebSocket listening at http://0.0.0.0:${port}`);
});
