"use client"

import Link from "next/link"
import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Play, Square, RotateCw, Trash2, Settings, Terminal, Activity, Box, Clock, FileJson } from "lucide-react"
import dynamic from "next/dynamic"
import { ConfigTab } from "@/components/ConfigTab"
import { SkillsTab } from "@/components/SkillsTab"
import { AutomationTab } from "@/components/AutomationTab"
import { OverviewTab } from "@/components/OverviewTab"
import { AdvancedConfigTab } from "@/components/AdvancedConfigTab"
import AgentChatPanel from "@/components/AgentChatPanel"
import { MessageCircle } from "lucide-react"

interface Project {
    id: string
    name: string
    status: string
    ttydPort?: string
    containerID?: string
    plan?: string
}

const PROVISIONING_STATUSES = ['provisioning', 'creating', 'building']

const Console = dynamic(() => import("@/components/Console"), {
    ssr: false,
    loading: () => <div className="h-[500px] bg-zinc-950 flex items-center justify-center text-zinc-500">Loading Terminal...</div>
})

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [project, setProject] = useState<Project | null>(null)
    const [logs, setLogs] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [isChatOpen, setIsChatOpen] = useState(false)

    // Polling Status & Logs
    useEffect(() => {
        fetchProject()
        const interval = setInterval(() => {
            fetchProject()
        }, 5000)
        return () => clearInterval(interval)
    }, [id])

    // Only poll logs when project is not provisioning
    useEffect(() => {
        if (!project || isProvisioning) return
        fetchLogs()
        const interval = setInterval(fetchLogs, 5000)
        return () => clearInterval(interval)
    }, [id, project?.status])

    const isProvisioning = project ? PROVISIONING_STATUSES.includes(project.status) : false

    const fetchProject = async () => {
        try {
            const res = await fetch(`/api/projects/${id}`)
            if (res.ok) {
                const data = await res.json()
                setProject(data)
            }
        } catch (e) { console.error('fetchProject failed:', e) }
    }

    const fetchLogs = async () => {
        try {
            const res = await fetch(`/api/projects/${id}/logs`)
            if (res.ok) {
                const text = await res.text()
                setLogs(text)
            }
        } catch (e) { console.error('fetchLogs failed:', e) }
    }

    const handleControl = async (action: string) => {
        setLoading(true)
        try {
            await fetch(`/api/projects/${id}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            })
            fetchProject()
        } catch (e) {
            console.error("Control action failed", e)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm("Are you sure? This will destroy the agent container.")) return
        setLoading(true)
        try {
            const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || errData.message || res.statusText || 'Deletion failed')
            }
            router.push('/dashboard')
        } catch (e: any) {
            alert(`Delete failed: ${e.message}`)
            setLoading(false)
        }
    }

    if (!project) return <div className="p-8">Loading project info...</div>

    return (
        <div className="flex min-h-screen flex-col bg-muted/40">
            <AgentChatPanel
                projectId={project.id}
                projectName={project.name}
                open={isChatOpen}
                onClose={() => setIsChatOpen(false)}
            />
            <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-6">
                <Link href="/dashboard">
                    <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                </Link>
                <h1 className="text-lg font-semibold">{project.name}</h1>
                <Badge variant={project.status === "running" ? "default" : isProvisioning ? "secondary" : "destructive"} className={`ml-2 ${isProvisioning ? 'animate-pulse bg-yellow-500/20 text-yellow-600 border-yellow-300' : ''}`}>
                    {project.status?.toUpperCase()}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                    {project.status === 'running' && (
                        <Button
                            size="sm" variant="secondary" className="gap-1.5"
                            onClick={() => setIsChatOpen(true)}
                        >
                            <MessageCircle className="h-4 w-4" />
                            <span className="hidden sm:inline">Direct Chat</span>
                        </Button>
                    )}
                    <Button
                        size="sm" variant="outline" className="gap-2 text-red-500 hover:text-red-600"
                        onClick={() => handleControl('stop')} disabled={loading || project.status !== 'running' || isProvisioning}
                    >
                        <Square className="h-4 w-4" /> Stop
                    </Button>
                    <Button
                        size="sm" variant="outline" className="gap-2"
                        onClick={() => handleControl(project.status === 'running' ? 'restart' : 'start')} disabled={loading || isProvisioning}
                    >
                        {project.status === 'running' ? <RotateCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {project.status === 'running' ? "Restart" : "Start"}
                    </Button>
                    <Button variant="destructive" size="icon" onClick={handleDelete} disabled={loading}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            <main className="flex-1 p-6 space-y-6">
                <Tabs defaultValue="overview" className="h-full flex flex-col space-y-6">
                    <div className="flex items-center justify-between overflow-x-auto">
                        <TabsList>
                            <TabsTrigger value="overview" className="gap-2"><Activity className="h-4 w-4" /> Overview</TabsTrigger>
                            <TabsTrigger value="config" className="gap-2"><Settings className="h-4 w-4" /> Config</TabsTrigger>
                            <TabsTrigger value="skills" className="gap-2"><Box className="h-4 w-4" /> Skills</TabsTrigger>
                            <TabsTrigger value="automation" className="gap-2"><Clock className="h-4 w-4" /> Automation</TabsTrigger>
                            <TabsTrigger value="advanced" className="gap-2"><FileJson className="h-4 w-4" /> Advanced</TabsTrigger>
                            <TabsTrigger value="console" className="gap-2"><Terminal className="h-4 w-4" /> Console</TabsTrigger>
                            <TabsTrigger value="webterm" className="gap-2"><Terminal className="h-4 w-4" /> WebTerm</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="overview" className="flex-1 space-y-4">
                        <OverviewTab projectId={id} project={project} logs={logs} />
                    </TabsContent>

                    <TabsContent value="config" className="flex-1">
                        <ConfigTab projectId={id} />
                    </TabsContent>

                    <TabsContent value="skills" className="flex-1">
                        <SkillsTab projectId={id} />
                    </TabsContent>

                    <TabsContent value="automation" className="flex-1">
                        <AutomationTab projectId={id} />
                    </TabsContent>

                    <TabsContent value="advanced" className="flex-1">
                        <AdvancedConfigTab projectId={id} />
                    </TabsContent>

                    <TabsContent value="console" className="flex-1 h-[600px]">
                        <Console projectId={id} />
                    </TabsContent>

                    <TabsContent value="webterm" className="flex-1 h-[600px]">
                        {project.ttydPort ? (
                            <div className="h-full w-full bg-zinc-950 rounded-lg border border-slate-800 p-2 overflow-hidden">
                                <iframe
                                    src={`/ws/projects/${id}/webterm?token=${encodeURIComponent(typeof window !== 'undefined' ? (document.cookie.match(/(?:^|;\s*)token=([^;]*)/) || [])[1] || '' : '')}`}
                                    className="w-full h-full border-none rounded"
                                    title="Web Terminal"
                                    allow="clipboard-read; clipboard-write"
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                                <Terminal className="h-8 w-8 opacity-50" />
                                <p>Web Terminal not available.</p>
                                <p className="text-xs">Ensure project is running and port is exposed.</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    )
}
