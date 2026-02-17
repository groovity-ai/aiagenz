"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Save, RefreshCw, FileJson, Shield, AlertTriangle } from "lucide-react"

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

type ActiveFile = 'openclaw' | 'auth'

export function AdvancedConfigTab({ projectId }: AdvancedConfigTabProps) {
  const [activeFile, setActiveFile] = useState<ActiveFile>('openclaw')
  const [openclawJson, setOpenclawJson] = useState("")
  const [authProfilesJson, setAuthProfilesJson] = useState("")
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

        // Separate auth profiles from openclaw config
        const authProfiles: Record<string, unknown> = { version: 1, profiles: {} }
        const openclawConfig = { ...data }

        if (data.auth) {
          if (data.auth.profiles) {
            authProfiles.profiles = data.auth.profiles
          }
          // Remove profiles from openclaw config (they live in auth-profiles.json)
          const authCopy = { ...data.auth }
          delete authCopy.profiles
          delete authCopy.usageStats
          if (Object.keys(authCopy).length > 0) {
            openclawConfig.auth = authCopy
          } else {
            delete openclawConfig.auth
          }
        }

        setOpenclawJson(JSON.stringify(openclawConfig, null, 2))
        setAuthProfilesJson(JSON.stringify(authProfiles, null, 2))
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Parse both JSONs
      let openclawParsed: Record<string, unknown>
      let authParsed: Record<string, unknown>
      try {
        openclawParsed = JSON.parse(openclawJson)
      } catch {
        showToast("Invalid JSON in openclaw.json — fix syntax errors", "error")
        setSaving(false)
        return
      }
      try {
        authParsed = JSON.parse(authProfilesJson)
      } catch {
        showToast("Invalid JSON in auth-profiles.json — fix syntax errors", "error")
        setSaving(false)
        return
      }

      // Merge auth profiles back into the config for the API
      // (UpdateRuntimeConfig expects auth.profiles in the config payload)
      const merged = { ...openclawParsed }
      if (!merged.auth || typeof merged.auth !== 'object') {
        merged.auth = {}
      }
      (merged.auth as Record<string, unknown>).profiles = authParsed.profiles || {}

      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
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

  const currentJson = activeFile === 'openclaw' ? openclawJson : authProfilesJson
  const setCurrentJson = activeFile === 'openclaw' ? setOpenclawJson : setAuthProfilesJson

  const tabs: { key: ActiveFile; label: string; icon: typeof FileJson; path: string }[] = [
    { key: 'openclaw', label: 'openclaw.json', icon: FileJson, path: '~/.openclaw/openclaw.json' },
    { key: 'auth', label: 'auth-profiles.json', icon: Shield, path: '~/.openclaw/agents/main/agent/auth-profiles.json' },
  ]

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Direct JSON editing — incorrect values may break your agent. Both files are saved together and the container is restarted.</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-base">Advanced Configuration</CardTitle>
              <CardDescription className="text-xs mt-1">Edit raw config files directly inside the container.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading}>
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Reload
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || loading}>
                {saving ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Save & Restart
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* File tabs */}
        <div className="px-6 border-b">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeFile === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                  }`}
                onClick={() => setActiveFile(tab.key)}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Path indicator */}
        <div className="px-6 pt-2">
          <span className="text-[11px] font-mono text-muted-foreground">
            {tabs.find(t => t.key === activeFile)?.path}
          </span>
        </div>

        <CardContent className="pt-2">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading config...</div>
          ) : (
            <textarea
              className="flex min-h-[500px] w-full rounded-md border border-input bg-black/50 px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={currentJson}
              onChange={(e) => setCurrentJson(e.target.value)}
              spellCheck={false}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
