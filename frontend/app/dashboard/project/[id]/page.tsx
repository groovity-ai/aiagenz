"use client"

import Link from "next/link"
import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Play, Square, RotateCw, Trash2, Cpu, MemoryStick } from "lucide-react"
import { toast } from "sonner"
import Console from "@/components/Console"
import { MetricsChart } from "@/components/MetricsChart"

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [project, setProject] = useState<any>(null)
    const [logs, setLogs] = useState<string>("")
    const [stats, setStats] = useState<any>(null)
    const [metrics, setMetrics] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetchProject()
        fetchLogs()
        fetchMetrics()

        const interval = setInterval(() => {
            fetchProject()
            fetchLogs()
            fetchMetrics()
        }, 5000)
        return () => clearInterval(interval)
    }, [])

    const fetchProject = async () => {
        try {
            const res = await fetch(`/api/projects/${id}`)
            if (res.ok) {
                const data = await res.json()
                setProject(data)
                // Fetch stats if container is running
                if (data.containerId && data.status === 'running') {
                    fetchStats(data.containerId)
                }
            }
        } catch (e) { }
    }

    const fetchLogs = async () => {
        try {
            const res = await fetch(`/api/projects/${id}/logs`)
            if (res.ok) {
                const text = await res.text()
                setLogs(text)
            }
        } catch (e) { }
    }

    const fetchStats = async (containerId: string) => {
        try {
            const res = await fetch(`/api/projects/${id}/stats`)
            if (res.ok) {
                const data = await res.json()
                setStats(data)
            }
        } catch (e) { }
    }

    const fetchMetrics = async () => {
        try {
            const res = await fetch(`/api/projects/${id}/metrics?range=1h`)
            if (res.ok) {
                const data = await res.json()
                setMetrics(data)
            }
        } catch (e) { }
    }

    const handleControl = async (action: string) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/projects/${id}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            })
            if (res.ok) {
                toast.success(`Container ${action} successful`)
            } else {
                toast.error(`Failed to ${action} container`)
            }
            fetchProject()
        } catch (e) {
            toast.error("Action failed")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm("Are you sure? This will destroy the agent container.")) return
        setLoading(true)
        try {
            const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
            if (res.ok) {
                toast.success("Agent deleted successfully")
                router.push('/dashboard')
            } else {
                toast.error("Delete failed")
            }
        } catch (e) {
            toast.error("Delete failed")
            setLoading(false)
        }
    }

    if (!project) {
        return (
            <div className="flex min-h-screen flex-col bg-muted/40 p-6 space-y-4">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded" />
                    <Skeleton className="h-6 w-[200px]" />
                    <Skeleton className="h-6 w-[80px] rounded-full" />
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                    <Skeleton className="h-[200px] rounded-xl" />
                    <Skeleton className="h-[400px] rounded-xl lg:col-span-2" />
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col bg-muted/40">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-6">
                <Link href="/dashboard">
                    <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                </Link>
                <h1 className="text-lg font-semibold">{project.name}</h1>
                <Badge variant={project.status === "running" ? "default" : "destructive"} className="ml-2">
                    {project.status?.toUpperCase()}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        size="sm" variant="outline" className="gap-2 text-red-500 hover:text-red-600"
                        onClick={() => handleControl('stop')} disabled={loading || project.status !== 'running'}
                    >
                        <Square className="h-4 w-4" /> Stop
                    </Button>
                    <Button
                        size="sm" variant="outline" className="gap-2"
                        onClick={() => handleControl(project.status === 'running' ? 'restart' : 'start')} disabled={loading}
                    >
                        {project.status === 'running' ? <RotateCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {project.status === 'running' ? "Restart" : "Start"}
                    </Button>
                    <Button variant="destructive" size="icon" onClick={handleDelete} disabled={loading}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 lg:grid-cols-3 xl:grid-cols-3 mt-6">

                <div className="grid auto-rows-max items-start gap-4 md:gap-8 lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>Resources</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-2">
                                <div className="text-sm font-medium text-muted-foreground">Type</div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-bold">{project.type}</span>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <div className="text-sm font-medium text-muted-foreground">Container ID</div>
                                <div className="flex items-baseline gap-2">
                                    <span className="font-mono text-xs truncate w-full bg-muted p-1 rounded">{project.containerId}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Resource Monitoring Card */}
                    {project.status === 'running' && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Live Monitoring</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-3">
                                <div className="flex items-center gap-3">
                                    <Cpu className="h-4 w-4 text-muted-foreground" />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium">CPU Usage</div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                                            <div
                                                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                                style={{ width: `${Math.min(stats?.cpu_percent || 0, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className="text-sm font-mono">{(stats?.cpu_percent || 0).toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <MemoryStick className="h-4 w-4 text-muted-foreground" />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium">Memory</div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                                            <div
                                                className="h-full bg-green-500 rounded-full transition-all duration-500"
                                                style={{ width: `${Math.min(stats?.memory_percent || 0, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className="text-sm font-mono">
                                        {(stats?.memory_usage_mb || 0).toFixed(0)}MB / {(stats?.memory_limit_mb || 512).toFixed(0)}MB
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="grid auto-rows-max items-start gap-4 md:gap-8 lg:col-span-2">
                    <Tabs defaultValue="logs">
                        <div className="flex items-center">
                            <TabsList>
                                <TabsTrigger value="logs">Live Logs</TabsTrigger>
                                <TabsTrigger value="metrics">Metrics</TabsTrigger>
                                <TabsTrigger value="console">Console</TabsTrigger>
                                <TabsTrigger value="settings">Settings</TabsTrigger>
                            </TabsList>
                        </div>
                        <TabsContent value="logs">
                            <Card className="bg-black text-green-400 font-mono text-sm h-[500px] overflow-auto p-4 rounded-lg border-slate-800">
                                <pre className="whitespace-pre-wrap">{logs || "Waiting for logs..."}</pre>
                            </Card>
                        </TabsContent>

                        <TabsContent value="metrics">
                            <MetricsChart data={metrics} loading={!metrics} />
                        </TabsContent>

                        <TabsContent value="console" className="mt-4">
                            <Console projectId={id} />
                        </TabsContent>

                        <TabsContent value="settings" className="mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>GitHub Integration</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">Repository URL</label>
                                        <input
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            placeholder="https://github.com/username/repo"
                                            defaultValue={project.repoUrl}
                                            onChange={(e) => setProject({ ...project, repoUrl: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">Webhook Secret</label>
                                        <input
                                            type="password"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            placeholder="Secret (optional)"
                                            defaultValue={project.webhookSecret}
                                            onChange={(e) => setProject({ ...project, webhookSecret: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">Webhook URL</label>
                                        <div className="flex items-center gap-2">
                                            <code className="bg-muted p-2 rounded text-xs flex-1">
                                                {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/github?projectId=${project.id}` : '...'}
                                            </code>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Add this URL to your GitHub repository webhooks (Events: Push).
                                        </p>
                                    </div>
                                    <Button onClick={async () => {
                                        setLoading(true)
                                        try {
                                            const res = await fetch(`/api/projects/${id}/repo`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    repoUrl: project.repoUrl,
                                                    webhookSecret: project.webhookSecret
                                                })
                                            })
                                            if (res.ok) toast.success("Settings saved")
                                            else toast.error("Failed to save settings")
                                        } catch (e) {
                                            toast.error("Error saving settings")
                                        } finally {
                                            setLoading(false)
                                        }
                                    }} disabled={loading}>
                                        Save Changes
                                    </Button>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

            </main>
        </div>
    )
}
