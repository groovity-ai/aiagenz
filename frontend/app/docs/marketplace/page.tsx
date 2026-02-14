import { Badge } from "@/components/ui/badge"
import { ShoppingBag, Code, ShieldCheck } from "lucide-react"

export default function MarketplaceDocsPage() {
    return (
        <div className="space-y-8 max-w-3xl">
            <div className="space-y-4">
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">The Marketplace</h1>
                <p className="text-xl text-muted-foreground">
                    Discover, deploy, and monetize autonomous agents.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p>
                    The <strong>AiAgenz Marketplace</strong> is a curated library of pre-built agents designed for specific use cases.
                    Instead of writing code from scratch, you can deploy battle-tested agents in seconds.
                </p>

                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    For Users
                </h2>
                <div className="grid gap-4 mt-6">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-muted rounded-lg"><ShoppingBag className="h-5 w-5" /></div>
                        <div>
                            <strong>Instant Deployment:</strong> Browse categories like Finance, Productivity, or Social Media.
                            Click "Deploy", enter your configuration (e.g., API keys), and you're running.
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-muted rounded-lg"><ShieldCheck className="h-5 w-5" /></div>
                        <div>
                            <strong>Verified Security:</strong> All marketplace agents are scanned for vulnerabilities and
                            run in our secure gVisor sandbox.
                        </div>
                    </div>
                </div>

                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    For Developers
                </h2>
                <div className="grid gap-4 mt-6">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-muted rounded-lg"><Code className="h-5 w-5" /></div>
                        <div>
                            <strong>Monetization:</strong> Publish your custom agents to the marketplace.
                            Set a monthly subscription price and earn revenue every time a user deploys your agent.
                        </div>
                    </div>
                </div>

                <div className="bg-primary/5 p-6 rounded-xl border border-primary/20 mt-8">
                    <p className="text-sm font-medium text-center">
                        Want to publish an agent? <a href="#" className="underline text-primary">Apply for the Developer Program</a>.
                    </p>
                </div>
            </div>
        </div>
    )
}
