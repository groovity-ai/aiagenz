"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, RefreshCw, ChevronLeft, ChevronRight, Box } from "lucide-react"
import { toast } from "sonner"
import CreateAgentModal from "@/components/CreateAgentModal"
import PageTransition from "@/components/PageTransition"

export default function Dashboard() {
  const router = useRouter()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [page])

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects?page=${page}&limit=12`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setProjects(data)
          setTotal(data.length)
          setTotalPages(1)
        } else {
          setProjects(data.data || [])
          setTotal(data.total || 0)
          setTotalPages(data.totalPages || 1)
        }
      } else {
        toast.error("Failed to fetch projects")
      }
    } catch (e) {
      toast.error("Network error fetching projects")
    } finally {
      setLoading(false)
    }
  }

  const runningCount = projects.filter(p => p.status === 'running').length

  return (
    <PageTransition className="min-h-full">
      {/* Header removed, using Layout Sidebar */}

      <main className="animate-in fade-in zoom-in duration-500">

        {/* Hero Section */}
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground mt-1">
              Overview of your autonomous agency.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} size="lg" className="shadow-lg hover:shadow-xl transition-shadow">
            <Plus className="mr-2 h-4 w-4" /> Deploy New Agent
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-10">
          <Card className="border-none shadow-none bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
              <Box className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{total}</div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-none bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Runners</CardTitle>
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{runningCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Projects Grid */}
        <div className="space-y-6">
          <h3 className="text-xl font-semibold">Deployed Agents</h3>

          {loading && projects.length === 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="h-[250px]">
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-16 text-center animate-in fade-in zoom-in duration-500">
              <div className="bg-muted/50 p-4 rounded-full mb-4">
                <Box className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No agents deployed</h3>
              <p className="text-muted-foreground max-w-sm mt-2 mb-6">
                Get started by deploying your first autonomous agent to the cloud.
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="mr-2 h-4 w-4" /> Deploy Agent
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((project) => (
                <Card key={project.id} className="group relative overflow-hidden transition-all hover:border-primary/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg leading-none">{project.name}</CardTitle>
                        <CardDescription className="text-xs font-mono pt-1">
                          {project.id.substring(0, 8)}
                        </CardDescription>
                      </div>
                      <Badge variant={project.status === "running" ? "default" : "secondary"} className={project.status === "running" ? "bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 border-green-500/20" : ""}>
                        {project.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex flex-col bg-muted/50 p-2 rounded-lg">
                        <span className="text-xs text-muted-foreground mb-1">Type</span>
                        <span className="font-medium capitalize">{project.type}</span>
                      </div>
                      <div className="flex flex-col bg-muted/50 p-2 rounded-lg">
                        <span className="text-xs text-muted-foreground mb-1">Plan</span>
                        <span className="font-medium capitalize">{project.plan || 'starter'}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground group-hover:translate-y-0 transition-all" variant="ghost" onClick={() => router.push(`/dashboard/project/${project.id}`)}>
                      Manage Agent
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-8 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-full"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="py-2 px-4 text-sm font-medium text-muted-foreground bg-muted/30 rounded-full">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-full"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>

      </main>

      <CreateAgentModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => fetchProjects()}
      />
    </PageTransition>
  )
}
