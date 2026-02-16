"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Clock, Trash2, RefreshCw } from "lucide-react"

interface AutomationTabProps {
  projectId: string
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  const toast = document.createElement('div')
  toast.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(-10px)'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

export function AutomationTab({ projectId }: AutomationTabProps) {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const [schedule, setSchedule] = useState("every 1h")
  const [task, setTask] = useState("")

  useEffect(() => {
    fetchJobs()
  }, [projectId])

  const fetchJobs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/cron`)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data.jobs || [])
        setJobs(list)
      }
    } catch (e) { }
    setLoading(false)
  }

  const handleAddJob = async () => {
    if (!task || !schedule) return
    setAdding(true)
    try {
      const args = ["add", "--schedule", schedule, "--task", task]
      const res = await fetch(`/api/projects/${projectId}/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args })
      })
      if (res.ok) {
        setTask("")
        fetchJobs()
        showToast("Cron job added!")
      } else {
        showToast("Failed to add job", "error")
      }
    } catch (e) {
      showToast("Failed to add job", "error")
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteJob = async (jobId: string, jobName: string) => {
    if (!confirm(`Delete cron job "${jobName || jobId}"?`)) return
    try {
      const res = await fetch(`/api/projects/${projectId}/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: ["remove", jobId] })
      })
      if (res.ok) {
        fetchJobs()
        showToast("Cron job deleted")
      } else {
        showToast("Failed to delete job", "error")
      }
    } catch (e) {
      showToast("Failed to delete job", "error")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule Task</CardTitle>
          <CardDescription>Automate agent actions using natural language or cron expressions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[1fr_2fr_auto]">
            <Input
              placeholder="Schedule (e.g. 'every 30m', '0 9 * * *')"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            />
            <Input
              placeholder="Task prompt (e.g. 'Check email and summarize')"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddJob()}
            />
            <Button onClick={handleAddJob} disabled={adding}>
              {adding ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add Job
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {jobs.map((job: any, i: number) => (
          <Card key={job.id || i}>
            <CardContent className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-mono text-sm font-semibold">{job.schedule?.expr || job.schedule}</div>
                  <div className="text-sm text-muted-foreground">{job.payload?.text || job.task}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{job.enabled !== false ? "Active" : "Paused"}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600"
                  onClick={() => handleDeleteJob(job.id || String(i), job.payload?.text || job.task || `Job ${i + 1}`)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && jobs.length === 0 && (
          <div className="text-center p-8 border border-dashed rounded text-muted-foreground">
            No active jobs.
          </div>
        )}
      </div>
    </div>
  )
}
