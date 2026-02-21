"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusCircle, Play, Square, Terminal, Loader2, RefreshCw, MessageCircle } from "lucide-react"
import CreateAgentModal from "@/components/CreateAgentModal"
import AgentChatPanel from "@/components/AgentChatPanel"

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [chatContext, setChatContext] = useState<{ id: string, name: string } | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        // Backend returns { data: [], total: ... } or just array
        setProjects(Array.isArray(data) ? data : data.data || [])
      }
    } catch (e) {
      console.error("Failed to fetch projects")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <CreateAgentModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchProjects}
      />
      <AgentChatPanel
        projectId={chatContext?.id || ''}
        projectName={chatContext?.name || ''}
        open={!!chatContext}
        onClose={() => setChatContext(null)}
      />

      <div className="flex flex-col sm:gap-6 sm:py-8 sm:pl-10 sm:pr-10">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-md px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-0">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <div className="ml-auto flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={fetchProjects} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" className="h-8 gap-1" onClick={() => setShowCreateModal(true)}>
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Deploy Agent</span>
            </Button>
          </div>
        </header>
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
                <Terminal className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{projects.filter(p => p.status === 'running').length}</div>
                <p className="text-xs text-muted-foreground">Running containers</p>
              </CardContent>
            </Card>
            {/* Add more stats cards here */}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Your Agents</CardTitle>
              <CardDescription>Manage your deployed AI workforce.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading && projects.length === 0 ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
              ) : projects.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">No agents deployed yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Container ID</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">
                          <Link href={`/dashboard/project/${project.id}`} className="hover:underline">
                            {project.name}
                          </Link>
                        </TableCell>
                        <TableCell>{project.type}</TableCell>
                        <TableCell>
                          <Badge variant={project.status === "running" ? "default" : "secondary"}>
                            {project.status}
                          </Badge>
                        </TableCell>
                        <TableCell><span className="font-mono text-xs">{project.containerId?.substring(0, 8)}</span></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-2">
                            {project.status === 'running' && (
                              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setChatContext({ id: project.id, name: project.name })}>
                                <MessageCircle className="h-3.5 w-3.5" />
                                Chat
                              </Button>
                            )}
                            <Link href={`/dashboard/project/${project.id}`}>
                              <Button size="sm" variant="ghost">Manage</Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
