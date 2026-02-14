import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Server, Cloud } from "lucide-react"

export default function InstallationDocsPage() {
    return (
        <div className="space-y-8 max-w-3xl">
            <div className="space-y-4">
                <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Installation & Deployment</h1>
                <p className="text-xl text-muted-foreground">
                    Choose how you want to run AiAgenz.
                </p>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p>
                    AiAgenz offers two primary deployment models: our managed Cloud platform and a self-hosted Enterprise edition.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardContent className="p-6 space-y-4">
                        <div className="p-3 w-fit rounded-lg bg-blue-500/10 text-blue-600">
                            <Cloud className="h-6 w-6" />
                        </div>
                        <h3 className="text-xl font-bold">AiAgenz Cloud</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            The fastest way to get started. We manage the infrastructure, security, and updates.
                            Just create an account and deploy.
                        </p>
                        <div className="flex gap-2">
                            <Badge>Recommended</Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6 space-y-4">
                        <div className="p-3 w-fit rounded-lg bg-zinc-500/10 text-zinc-600">
                            <Server className="h-6 w-6" />
                        </div>
                        <h3 className="text-xl font-bold">Self-Hosted</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Run AiAgenz on your own Kubernetes cluster. Ideal for data residency requirements
                            or air-gapped environments.
                        </p>
                        <div className="flex gap-2">
                            <Badge variant="secondary">Enterprise</Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="prose prose-zinc dark:prose-invert max-w-none mt-8">
                <h2 className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0">
                    Self-Hosted Requirements
                </h2>
                <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Kubernetes Cluster:</strong> v1.24+</li>
                    <li><strong>Database:</strong> PostgreSQL 14+</li>
                    <li><strong>Object Storage:</strong> S3-compatible (MinIO, AWS S3)</li>
                    <li><strong>Container Runtime:</strong> gVisor (runsc) configured on worker nodes</li>
                </ul>

                <p className="mt-6">
                    For detailed self-hosting instructions, please contact our <a href="#" className="underline text-primary">Enterprise Sales team</a>.
                </p>
            </div>
        </div>
    )
}
