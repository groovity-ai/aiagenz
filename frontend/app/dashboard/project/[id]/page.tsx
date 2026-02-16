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

const Console = dynamic(() => import("@/components/Console"), {
    ssr: false,
    loading: () => <div className="h-[500px] bg-zinc-950 flex items-center justify-center text-zinc-500">Loading Terminal...</div>
})

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [project, setProject] = useState<any>(null)
    const [logs, setLogs] = useState<string>("")
    const [loading, setLoading] = useState(false)

    // Polling Status & Logs
    useEffect(() => {
        fetchProject()
        fetchLogs()
        const interval = setInterval(() => {
            fetchProject()
            fetchLogs()
        }, 5000)
        return () => clearInterval(interval)
    }, [id])

    const fetchProject = async () => {
        try {
            const res = await fetch(`/api/projects/${id}`)
            if (res.ok) {
                const data = await res.json()
                setProject(data)
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

    const handleControl = async (action: string) => {
        setLoading(true)
        try {
            await fetch(`/api/projects/${id}/control`, {
                method: 'POST',
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
            await fetch(`/api/projects/${id}`, { method: 'DELETE' })
            router.push('/dashboard')
        } catch (e) {
            alert("Delete failed")
            setLoading(false)
        }
    }

    if (!project) return <div className="p-8">Loading project info...</div>

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
                </Tabs>
            </main>
        </div>
    )
}
