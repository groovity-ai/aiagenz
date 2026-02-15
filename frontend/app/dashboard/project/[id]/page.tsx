"use client"

import Link from "next/link"
import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Play, Square, RotateCw, Terminal, Trash2 } from "lucide-react"
import dynamic from "next/dynamic"
import { SettingsDialog } from "@/components/SettingsDialog"

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
    } catch(e) {}
  }

  const fetchLogs = async () => {
    try {
        const res = await fetch(`/api/projects/${id}/logs`)
        if (res.ok) {
            const text = await res.text()
            setLogs(text)
        }
    } catch(e) {}
  }

  const handleControl = async (action: string) => {
    setLoading(true)
    try {
        await fetch(`/api/projects/${id}/control`, {
            method: 'POST',
            body: JSON.stringify({ action })
        })
        fetchProject()
    } catch(e) {
        alert("Action failed")
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
    } catch(e) {
        alert("Delete failed")
        setLoading(false)
    }
  }

  if (!project) return <div className="p-8">Loading project info...</div>

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-6">
            <Link href="/dashboard">
                <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4"/></Button>
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
                    {project.status === 'running' ? <RotateCw className="h-4 w-4"/> : <Play className="h-4 w-4"/>}
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
                                <span className="font-mono text-xs truncate w-full bg-muted p-1 rounded">{project.containerId || "N/A"}</span>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <SettingsDialog project={project} onUpdate={fetchProject} />
                    </CardFooter>
                </Card>
            </div>

            <div className="grid auto-rows-max items-start gap-4 md:gap-8 lg:col-span-2">
                <Tabs defaultValue="logs">
                    <div className="flex items-center">
                        <TabsList>
                            <TabsTrigger value="logs">Live Logs</TabsTrigger>
                            <TabsTrigger value="console">Console</TabsTrigger>
                        </TabsList>
                    </div>
                    <TabsContent value="logs">
                        <Card className="bg-black text-green-400 font-mono text-sm h-[500px] overflow-auto p-4 rounded-lg border-slate-800">
                            <pre className="whitespace-pre-wrap">{logs || "Waiting for logs..."}</pre>
                        </Card>
                    </TabsContent>
                    <TabsContent value="console">
                        <Console projectId={id} />
                    </TabsContent>
                </Tabs>
            </div>

        </main>
    </div>
  )
}
