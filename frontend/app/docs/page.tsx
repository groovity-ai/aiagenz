import { Button } from "@/components/ui/button"
import { ChevronRight } from "lucide-react"
import Link from "next/link"

export default function DocsPage() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Introduction</h1>
                <p className="text-lg text-muted-foreground">
                    Welcome to the AiAgenz documentation. Learn how to deploy, manage, and scale your autonomous agents.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p className="leading-7 [&:not(:first-child)]:mt-6">
                    AiAgenz is a platform designed for the next generation of AI applications.
                    We provide a secure, scalable, and easy-to-use infrastructure for running autonomous agents
                    powered by OpenClaw, AutoGPT, and custom Docker containers.
                </p>

                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    Why AiAgenz?
                </h2>
                <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
                    <li><strong>Secure by Default:</strong> Every agent runs in a gVisor sandbox, isolating it from the host and other tenants.</li>
                    <li><strong>Instant Scale:</strong> Deploy in seconds and scale to thousands of instances without managing servers.</li>
                    <li><strong>Marketplace:</strong> Access a library of pre-built agents for trading, support, and content creation.</li>
                </ul>

                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    Architecture
                </h2>
                <p className="leading-7 [&:not(:first-child)]:mt-6">
                    Our platform is built on top of Kubernetes and Firecracker/gVisor technologies.
                    The control plane handles API requests, authentication, and billing, while the
                    data plane manages the lifecycle of your agent containers.
                </p>
            </div>

            <div className="flex gap-4 pt-8">
                <Link href="/docs/quick-start">
                    <Button size="lg" className="rounded-full">
                        Quick Start Guide <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
                <Link href="/dashboard">
                    <Button size="lg" variant="outline" className="rounded-full">
                        Go to Dashboard
                    </Button>
                </Link>
            </div>
        </div>
    )
}
