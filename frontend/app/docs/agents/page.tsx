import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Terminal, Cpu, Box, Zap } from "lucide-react"

export default function AgentsDocsPage() {
    return (
        <div className="space-y-8 max-w-3xl">
            <div className="space-y-4">
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Autonomous Agents</h1>
                <p className="text-xl text-muted-foreground">
                    Understanding the types of agents you can deploy on AiAgenz.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p>
                    An <strong>Agent</strong> in AiAgenz is a containerized application designed to perform tasks autonomously.
                    Unlike traditional web servers, agents are often stateful, long-running processes that interact with
                    external APIs, databases, and LLMs.
                </p>

                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    Agent Architectures
                </h2>
                <p>
                    We support two primary architectures for deploying agents:
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardContent className="p-6 space-y-4">
                        <div className="p-3 w-fit rounded-lg bg-blue-500/10 text-blue-600">
                            <Terminal className="h-6 w-6" />
                        </div>
                        <h3 className="text-xl font-bold">OpenClaw Starter</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            A flexible, general-purpose agent runtime. Perfect for developers who want to write
                            custom Python or Node.js scripts. Comes pre-installed with common AI libraries (LangChain, AutoGPT).
                        </p>
                        <div className="flex gap-2">
                            <Badge variant="secondary">Python</Badge>
                            <Badge variant="secondary">Node.js</Badge>
                            <Badge variant="secondary">Custom</Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6 space-y-4">
                        <div className="p-3 w-fit rounded-lg bg-purple-500/10 text-purple-600">
                            <Box className="h-6 w-6" />
                        </div>
                        <h3 className="text-xl font-bold">Marketplace Pre-builds</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Optimized images for specific tasks (e.g., Trading, SEO, Customer Support).
                            These agents require minimal configuration—just provide your API keys and parameters.
                        </p>
                        <div className="flex gap-2">
                            <Badge variant="secondary">No-Code</Badge>
                            <Badge variant="secondary">Optimized</Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    Lifecycle Management
                </h2>
                <p>
                    Agents have a distinct lifecycle managed by our control plane:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Provisioning:</strong> Resources (CPU/RAM) are reserved, and the secure sandbox is initialized.</li>
                    <li><strong>Booting:</strong> The container image is pulled and the entrypoint script is executed.</li>
                    <li><strong>Running:</strong> The agent performs its tasks. Logs are streamed in real-time to the dashboard.</li>
                    <li><strong>Terminated:</strong> The agent is stopped, and resources are reclaimed. Persistent data is saved if configured.</li>
                </ul>

                <div className="bg-muted/50 p-6 rounded-xl border border-border mt-8">
                    <h4 className="flex items-center gap-2 font-bold mb-2">
                        <Zap className="h-4 w-4 text-yellow-500" /> Pro Tip: Persistent Storage
                    </h4>
                    <p className="text-sm text-muted-foreground">
                        By default, agent files are ephemeral. To save data across restarts (like fine-tuned models or databases),
                        mount a volume to <code>/data</code> in your configuration.
                    </p>
                </div>
            </div>
        </div>
    )
}
