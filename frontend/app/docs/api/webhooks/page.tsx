export default function ApiWebhooksPage() {
    return (
        <div className="space-y-8 max-w-4xl">
            <div className="space-y-4">
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Webhooks</h1>
                <p className="text-xl text-muted-foreground">
                    Receive real-time notifications about your agents.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p>
                    You can configure webhooks to receive payloads via HTTP POST whenever specific events occur
                    within your projects.
                </p>

                <hr className="my-8" />

                <h3 className="text-2xl font-bold mb-4">Event Types</h3>
                <ul className="list-disc pl-6 space-y-2 mb-8">
                    <li><code>agent.deployed</code>: Triggered when an agent successfully starts running.</li>
                    <li><code>agent.crashed</code>: Triggered if an agent container exits unexpectedly.</li>
                    <li><code>agent.stopped</code>: Triggered when an agent is manually stopped.</li>
                </ul>

                <h3 className="text-2xl font-bold mb-4">Payload Structure</h3>
                <div className="bg-zinc-950 rounded-lg overflow-hidden border">
                    <div className="px-4 py-2 border-b border-white/10 text-xs text-muted-foreground">JSON Payload</div>
                    <pre className="p-4 text-sm font-mono text-green-400 overflow-x-auto">
                        {`{
  "event": "agent.deployed",
  "timestamp": "2026-02-14T12:34:56Z",
  "data": {
    "projectId": "proj_123abc",
    "projectName": "My Trading Bot",
    "status": "running",
    "ip": "10.0.0.5"
  }
}`}
                    </pre>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg mt-8">
                    <h4 className="font-bold text-yellow-600 dark:text-yellow-500 mb-2">Security Note</h4>
                    <p className="text-sm">
                        Verify the <code>X-AiAgenz-Signature</code> header to ensure the webhook request originated from us.
                    </p>
                </div>
            </div>
        </div>
    )
}
