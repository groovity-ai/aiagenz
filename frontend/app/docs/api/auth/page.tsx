export default function ApiAuthPage() {
    return (
        <div className="space-y-8 max-w-4xl">
            <div className="space-y-4">
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Authentication API</h1>
                <p className="text-xl text-muted-foreground">
                    Manage user sessions and API tokens.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p>
                    AiAgenz uses Bearer Token authentication. You can obtain a token via the login endpoint
                    or generate a long-lived API Key from your dashboard settings.
                </p>

                <hr className="my-8" />

                <div className="space-y-12">
                    {/* POST /api/auth/login */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="bg-green-500 text-white px-3 py-1 rounded-md font-mono font-bold text-sm">POST</span>
                            <code className="text-lg font-mono text-foreground">/api/auth/login</code>
                        </div>
                        <p>Exchange credentials for a session token.</p>

                        <div className="bg-zinc-950 rounded-lg overflow-hidden border">
                            <div className="px-4 py-2 border-b border-white/10 text-xs text-muted-foreground">Request Body</div>
                            <pre className="p-4 text-sm font-mono text-blue-300 overflow-x-auto">
                                {`{
    "email": "user@example.com",
    "password": "your-password"
  }`}
                            </pre>
                            <div className="px-4 py-2 border-b border-t border-white/10 text-xs text-muted-foreground">Response Example</div>
                            <pre className="p-4 text-sm font-mono text-green-400 overflow-x-auto">
                                {`{
    "token": "eyJhbGciOiJIUzI1Ni...",
    "user": {
      "id": "usr_123",
      "email": "user@example.com"
    }
  }`}
                            </pre>
                        </div>
                    </div>

                    {/* GET /api/auth/session */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="bg-blue-500 text-white px-3 py-1 rounded-md font-mono font-bold text-sm">GET</span>
                            <code className="text-lg font-mono text-foreground">/api/auth/session</code>
                        </div>
                        <p>Retrieve current user session information.</p>

                        <div className="bg-zinc-950 rounded-lg overflow-hidden border">
                            <div className="px-4 py-2 border-b border-white/10 text-xs text-muted-foreground">Response Example</div>
                            <pre className="p-4 text-sm font-mono text-green-400 overflow-x-auto">
                                {`{
    "authenticated": true,
    "user": {
        "id": "usr_123",
        "role": "admin"
    }
  }`}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
