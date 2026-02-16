"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Clock } from "lucide-react"

interface AutomationTabProps {
  projectId: string
}

export function AutomationTab({ projectId }: AutomationTabProps) {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  
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
    } catch (e) {}
    setLoading(false)
  }

  const handleAddJob = async () => {
    if (!task || !schedule) return
    try {
      const args = ["add", "--schedule", schedule, "--task", task]
      await fetch(`/api/projects/${projectId}/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args })
      })
      setTask("")
      fetchJobs()
    } catch (e) {
        alert("Failed to add job")
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
            />
            <Button onClick={handleAddJob}><Plus className="mr-2 h-4 w-4"/> Add Job</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {jobs.map((job: any, i: number) => (
          <Card key={i}>
            <CardContent className="p-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Clock className="h-5 w-5 text-muted-foreground"/>
                    <div>
                        <div className="font-mono text-sm font-semibold">{job.schedule?.expr || job.schedule}</div>
                        <div className="text-sm text-muted-foreground">{job.payload?.text || job.task}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline">{job.enabled ? "Active" : "Paused"}</Badge>
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
