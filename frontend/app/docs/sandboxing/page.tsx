import { Badge } from "@/components/ui/badge"
import { ShieldCheck, Lock, Server, Network } from "lucide-react"

export default function SandboxingDocsPage() {
    return (
        <div className="space-y-8 max-w-3xl">
            <div className="space-y-4">
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Security & Sandboxing</h1>
                <p className="text-xl text-muted-foreground">
                    How we use gVisor to provide defense-in-depth isolation for your agents.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p>
                    Security is paramount when running autonomous code. Antigravity employs a multi-layer security model
                    to ensuring that agents are completely isolated from the host infrastructure and from each other.
                </p>

                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    The gVisor User-Space Kernel
                </h2>
                <p>
                    Standard Docker containers share the host kernel, which presents a significant attack surface.
                    If a container escapes, it can compromise the entire server.
                </p>
                <p>
                    <strong>AiAgenz uses gVisor (runsc)</strong>, a container runtime sandbox developed by Google.
                    gVisor intercepts application system calls and acts as a distinct kernel, running in user-space.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 my-8">
                <div className="bg-card border rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-red-500/10 text-red-500 rounded-lg"><Server className="h-5 w-5" /></div>
                        <h3 className="font-bold">Traditional Docker</h3>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex justify-between border-b pb-2">
                            <span>Isolation</span>
                            <span className="text-red-500 font-medium">Namespaces only</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span>Kernel</span>
                            <span className="text-red-500 font-medium">Shared Host Kernel</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Attack Surface</span>
                            <span className="text-red-500 font-medium">High</span>
                        </div>
                    </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-primary/10 px-3 py-1 rounded-bl-xl text-xs font-bold text-primary">AIAGENZ</div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-green-500/10 text-green-500 rounded-lg"><ShieldCheck className="h-5 w-5" /></div>
                        <h3 className="font-bold">gVisor Sandbox</h3>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex justify-between border-b border-primary/10 pb-2">
                            <span>Isolation</span>
                            <span className="text-green-600 dark:text-green-400 font-medium">Virtual Kernel</span>
                        </div>
                        <div className="flex justify-between border-b border-primary/10 pb-2">
                            <span>Kernel</span>
                            <span className="text-green-600 dark:text-green-400 font-medium">Isolated User-Space</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Attack Surface</span>
                            <span className="text-green-600 dark:text-green-400 font-medium">Minimal</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    Network Isolation
                </h2>
                <p>
                    In addition to compute isolation, we enforce strict network policies:
                </p>
                <ul className="list-none space-y-4 pl-0">
                    <li className="flex gap-4">
                        <div className="bg-muted p-2 h-fit rounded-lg"><Network className="h-5 w-5" /></div>
                        <div>
                            <strong>Egress Filtering:</strong> Agents can only connect to the internet via approved protocols (HTTP/HTTPS).
                            Direct P2P or intrusive scanning is blocked.
                        </div>
                    </li>
                    <li className="flex gap-4">
                        <div className="bg-muted p-2 h-fit rounded-lg"><Lock className="h-5 w-5" /></div>
                        <div>
                            <strong>VPC Peering:</strong> Agents generally cannot talk to each other unless explicitly configured
                            in a shared VPC (Virtual Private Cloud).
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    )
}
