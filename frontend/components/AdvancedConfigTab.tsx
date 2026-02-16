"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Save, RefreshCw, FileJson } from "lucide-react"

interface AdvancedConfigTabProps {
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

export function AdvancedConfigTab({ projectId }: AdvancedConfigTabProps) {
  const [configJson, setConfigJson] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [projectId])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/config`)
      if (res.ok) {
        const data = await res.json()
        setConfigJson(JSON.stringify(data, null, 2))
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let parsed
      try {
        parsed = JSON.parse(configJson)
      } catch (e) {
        showToast("Invalid JSON — please fix syntax errors", "error")
        setSaving(false)
        return
      }

      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      })
      if (res.ok) {
        showToast("Configuration saved & Agent restarted!")
        fetchConfig()
      } else {
        showToast("Failed to save config", "error")
      }
    } catch (error) {
      showToast("Error saving configuration", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-accent" />
              <div>
                <CardTitle>Advanced Configuration</CardTitle>
                <CardDescription>Directly edit openclaw.json and auth-profiles.json (merged view).</CardDescription>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save & Restart
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading config...</div>
          ) : (
            <textarea
              className="flex min-h-[500px] w-full rounded-md border border-input bg-black/50 px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              spellCheck={false}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
