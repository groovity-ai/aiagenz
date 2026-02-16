"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Box, Download, RefreshCw, Trash2 } from "lucide-react"

interface SkillsTabProps {
  projectId: string
}

export function SkillsTab({ projectId }: SkillsTabProps) {
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [newSkill, setNewSkill] = useState("")

  useEffect(() => {
    fetchSkills()
  }, [projectId])

  const fetchSkills = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/skills`)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data.skills || [])
        setSkills(list)
      }
    } catch (e) {}
    setLoading(false)
  }

  const handleInstall = async () => {
    if (!newSkill) return
    setInstalling(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSkill })
      })
      if (res.ok) {
        setNewSkill("")
        fetchSkills()
      } else {
        alert("Failed to install skill")
      }
    } catch (e) {
        alert("Error installing skill")
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async (name: string) => {
    if (!confirm(`Uninstall skill ${name}?`)) return
    try {
      await fetch(`/api/projects/${projectId}/skills/${name}`, { method: "DELETE" })
      fetchSkills()
    } catch (e) {
        alert("Error uninstalling skill")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Install New Skill</CardTitle>
          <CardDescription>Add capabilities from ClawHub or npm.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input 
              placeholder="Skill name (e.g. browser, fs, web-search)" 
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
            />
            <Button onClick={handleInstall} disabled={installing}>
              {installing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>}
              Install
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {skills.map((skill: any) => (
          <Card key={skill.name}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <Box className="h-5 w-5 text-accent"/>
                    <CardTitle className="text-base">{skill.name}</CardTitle>
                </div>
                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleUninstall(skill.name)}>
                    <Trash2 className="h-4 w-4"/>
                </Button>
              </div>
              <CardDescription className="text-xs">{skill.description || "No description"}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2">
                    {skill.version && <Badge variant="secondary" className="text-[10px]">v{skill.version}</Badge>}
                    {skill.enabled !== false && <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-200">Active</Badge>}
                </div>
            </CardContent>
          </Card>
        ))}
        {!loading && skills.length === 0 && (
            <div className="col-span-full text-center p-8 border border-dashed rounded text-muted-foreground">
                No skills installed.
            </div>
        )}
      </div>
    </div>
  )
}
