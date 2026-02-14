import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ArrowRight, ChevronRight, Play } from "lucide-react"

export default function QuickStartPage() {
    return (
        <div className="space-y-8 max-w-3xl">
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-primary border-primary/30">5 Minutes</Badge>
                    <Badge variant="outline">Beginner</Badge>
                </div>
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Quick Start Guide</h1>
                <p className="text-xl text-muted-foreground">
                    Deploy your first AI Agent in less than 5 minutes.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p>
                    This guide will walk you through creating an account, selecting a template, and launching a live agent.
                </p>

                <h3 className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight">Prerequisites</h3>
                <ul>
                    <li>A GitHub or Google account (for login)</li>
                    <li>A valid credit card (for verification, you won't be charged for the free tier)</li>
                </ul>

                {/* Step 1 */}
                <div className="mt-10 border-l-2 border-primary/20 pl-6 relative">
                    <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-primary" />
                    <h2 className="text-2xl font-bold mb-4">1. Create an Account</h2>
                    <p>
                        Head over to the <Link href="/login" className="text-primary underline">Login Page</Link> and sign in.
                        We use secure OAuth providers, so you don't need to remember another password.
                    </p>
                </div>

                {/* Step 2 */}
                <div className="mt-10 border-l-2 border-primary/20 pl-6 relative">
                    <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-primary" />
                    <h2 className="text-2xl font-bold mb-4">2. Navigate to Dashboard</h2>
                    <p>
                        Once logged in, you'll be taken to the <strong>Dashboard</strong>. This is your command center.
                        Click the big <span className="font-mono bg-muted px-1 py-0.5 rounded">Deploy Agent</span> button in the top right,
                        or use the empty state CTA if it's your first time.
                    </p>
                </div>

                {/* Step 3 */}
                <div className="mt-10 border-l-2 border-primary/20 pl-6 relative">
                    <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-primary" />
                    <h2 className="text-2xl font-bold mb-4">3. Configure Wizard</h2>
                    <p>
                        The <strong>Creation Wizard</strong> will appear. Follow these steps:
                    </p>
                    <ol className="list-decimal pl-6 space-y-2 mt-4">
                        <li><strong>Identity:</strong> Give your agent a cool name (e.g., "Jarvis-Beta"). Choose "Starter" for a blank slate.</li>
                        <li><strong>Resources:</strong> Select the "Starter" plan ($5/mo) for testing.</li>
                        <li><strong>Config:</strong> Enter your Telegram Bot Token. You can get one from <a href="https://t.me/BotFather" target="_blank" className="underline">@BotFather</a>.</li>
                        <li><strong>Launch:</strong> specific "Launch Agent" and watch the terminal logs as your container spins up!</li>
                    </ol>
                </div>

                {/* Step 4 */}
                <div className="mt-10 border-l-2 border-primary/20 pl-6 relative">
                    <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-primary" />
                    <h2 className="text-2xl font-bold mb-4">4. Test Your Agent</h2>
                    <p>
                        Wait for the status to turn <strong>Active</strong> (pulsing green dot).
                        Open Telegram and send <code>/start</code> to your bot. If it replies, congratulations!
                        You've just deployed an autonomous agent.
                    </p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-8 border-t mt-12">
                <div className="flex-1 p-6 bg-muted/30 rounded-xl border border-dashed text-center">
                    <h4 className="font-bold mb-2">Ready to go?</h4>
                    <Link href="/dashboard">
                        <Button className="w-full shadow-lg">Start Deployment <Play className="ml-2 h-4 w-4" /></Button>
                    </Link>
                </div>
                <div className="flex-1 p-6 bg-muted/30 rounded-xl border border-dashed text-center">
                    <h4 className="font-bold mb-2">Need more power?</h4>
                    <Link href="/docs/agents">
                        <Button variant="outline" className="w-full">Explore Architectures <ChevronRight className="ml-2 h-4 w-4" /></Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}
