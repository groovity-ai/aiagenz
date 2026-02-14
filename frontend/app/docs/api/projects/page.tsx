export default function ApiProjectsPage() {
    return (
        <div className="space-y-8 max-w-4xl">
            <div className="space-y-4">
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Projects API</h1>
                <p className="text-xl text-muted-foreground">
                    Manage your agent deployments programmatically.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p>
                    The Projects API allows you to create, list, and control your agents.
                    All requests must be authenticated using a Bearer Token.
                </p>

                <hr className="my-8" />

                <div className="space-y-12">
                    {/* GET /api/projects */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="bg-blue-500 text-white px-3 py-1 rounded-md font-mono font-bold text-sm">GET</span>
                            <code className="text-lg font-mono text-foreground">/api/projects</code>
                        </div>
                        <p>List all projects (agents) owned by the authenticated user.</p>

                        <div className="bg-zinc-950 rounded-lg overflow-hidden border">
                            <div className="px-4 py-2 border-b border-white/10 text-xs text-muted-foreground">Response Example</div>
                            <pre className="p-4 text-sm font-mono text-green-400 overflow-x-auto">
                                {`[
    {
      "id": "proj_123abc",
      "name": "My Agent",
      "status": "running",
      "plan": "starter",
      "created_at": "2026-02-14T10:00:00Z"
    }
  ]`}
                            </pre>
                        </div>
                    </div>

                    {/* POST /api/projects */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="bg-green-500 text-white px-3 py-1 rounded-md font-mono font-bold text-sm">POST</span>
                            <code className="text-lg font-mono text-foreground">/api/projects</code>
                        </div>
                        <p>Deploy a new agent.</p>

                        <div className="bg-zinc-950 rounded-lg overflow-hidden border">
                            <div className="px-4 py-2 border-b border-white/10 text-xs text-muted-foreground">Request Body</div>
                            <pre className="p-4 text-sm font-mono text-blue-300 overflow-x-auto">
                                {`{
    "name": "TraderBot-X",
    "type": "marketplace",
    "plan": "pro",
    "telegramToken": "1234:AbCdEf...",
    "apiKey": "sk-..." 
  }`}
                            </pre>
                        </div>
                    </div>

                    {/* POST /api/projects/:id/control */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="bg-green-500 text-white px-3 py-1 rounded-md font-mono font-bold text-sm">POST</span>
                            <code className="text-lg font-mono text-foreground">/api/projects/{'{id}'}/control</code>
                        </div>
                        <p>Send a control command to the agent container (start, stop, restart).</p>

                        <div className="bg-zinc-950 rounded-lg overflow-hidden border">
                            <div className="px-4 py-2 border-b border-white/10 text-xs text-muted-foreground">Request Body</div>
                            <pre className="p-4 text-sm font-mono text-blue-300 overflow-x-auto">
                                {`{
    "action": "restart" // or "stop", "start"
  }`}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
