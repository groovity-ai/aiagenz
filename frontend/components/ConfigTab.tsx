"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Plus, Trash2, Save, RefreshCw, Key, Bot, Eye, EyeOff, Pencil, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ConfigTabProps {
  projectId: string
}

export function ConfigTab({ projectId }: ConfigTabProps) {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [availableModels, setAvailableModels] = useState<any[]>([])

  useEffect(() => {
    refreshData()
  }, [projectId])

  const refreshData = () => {
    fetchConfig()
    fetchModels()
  }

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/config`)
      if (res.ok) {
        const data = await res.json()
        setConfig(data || {})
      }
    } catch (error) {
      console.error("Failed to load config", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchModels = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/models`)
      if (res.ok) {
        const data = await res.json()
        setAvailableModels(data.models || [])
      }
    } catch (e) {}
  }

  if (loading && !config) return <div className="p-4 text-center">Loading configuration...</div>
  if (!config) return <div className="p-4 text-center text-red-500">Failed to load configuration.</div>

  return (
    <div className="space-y-6">
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="llm">LLM Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
           <GeneralEditor config={config} projectId={projectId} availableModels={availableModels} onUpdate={refreshData} />
        </TabsContent>

        <TabsContent value="channels">
           <ChannelsEditor config={config} projectId={projectId} onUpdate={refreshData} />
        </TabsContent>

        <TabsContent value="llm">
           <LLMEditor config={config} projectId={projectId} availableModels={availableModels} onUpdate={refreshData} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function GeneralEditor({ config, projectId, availableModels, onUpdate }: any) {
    const agent = config.agents?.list?.find((a: any) => a.id === 'main') || config.agents?.list?.[0] || {}
    const [model, setModel] = useState(agent.model || "")
    const [prompt, setPrompt] = useState(agent.systemPrompt || "")
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            // Update Model via CLI config set
            if (model !== agent.model) {
                await fetch(`/api/projects/${projectId}/command`, {
                    method: 'POST',
                    body: JSON.stringify({ args: ["config", "set", "agents.defaults.model.primary", model] })
                })
            }
            onUpdate()
            alert("Agent settings updated!")
        } catch(e) {
            alert("Update failed")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
              <CardTitle>Identity & Behavior</CardTitle>
              <CardDescription>Configure the agent's brain.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Model</Label>
                <div className="relative">
                    <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                    >
                        <option value="" disabled>Select a model...</option>
                        {availableModels.length > 0 ? (
                            availableModels.map((m: any) => {
                                const val = m.key || `${m.provider}/${m.id}`
                                const label = m.name || m.id || val
                                const provider = m.key ? m.key.split('/')[0] : m.provider
                                return (
                                    <option key={val} value={val}>
                                        {label} ({provider})
                                    </option>
                                )
                            })
                        ) : (
                            <option disabled>Loading models...</option>
                        )}
                    </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>System Prompt (Snippet)</Label>
                <p className="text-xs text-muted-foreground">To edit the full personality, use the Advanced Config or edit SOUL.md directly.</p>
                <textarea 
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px] font-mono"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="You are a helpful assistant..."
                  disabled 
                />
              </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Update Agent
                </Button>
            </CardFooter>
        </Card>
    )
}

function ChannelsEditor({ config, projectId, onUpdate }: any) {
    const defaultAccount = config.channels?.telegram?.accounts?.['default'] || { enabled: true, botToken: "" }
    const [token, setToken] = useState(defaultAccount.botToken || "")
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            await fetch(`/api/projects/${projectId}/channels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    type: 'telegram', 
                    config: { botToken: token } 
                })
            })
            onUpdate()
            alert("Channel updated!")
        } catch(e) {
            alert("Failed to update channel")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5"/> Telegram
                </CardTitle>
                <CardDescription>Configure the main Telegram bot.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <Label>Bot Token</Label>
                    <Input 
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="123456:ABC..."
                    />
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Save Channel
                </Button>
            </CardFooter>
        </Card>
    )
}

function LLMEditor({ config, projectId, availableModels, onUpdate }: any) {
    const profiles = config.auth?.profiles || {}
    const profilesList = Object.entries(profiles).map(([key, val]: [string, any]) => ({
        key,
        ...val
    }))
    const [newProvider, setNewProvider] = useState({ provider: "openai", api_key: "" })
    const [saving, setSaving] = useState(false)
    const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
    const [editingKey, setEditingKey] = useState<string | null>(null)

    const derivedProviders = availableModels.map(m => {
        if (m.provider) return m.provider
        if (m.key) return m.key.split('/')[0]
        return null
    }).filter(Boolean)

    const knownProviders = Array.from(new Set(derivedProviders)).sort()
    if (knownProviders.length === 0) {
        knownProviders.push("openai", "google", "anthropic")
    }

    const handleSaveAuth = async () => {
        if (!newProvider.api_key && newProvider.provider !== "google-antigravity") return alert("API Key required")
        setSaving(true)
        try {
            // openclaw auth add --provider <p> --key <k>
            // Note: If editing, CLI handles overwrite if key/provider matches.
            // If changing provider, we should ideally remove old, but for now just add new.
            await fetch(`/api/projects/${projectId}/auth/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    provider: newProvider.provider, 
                    key: newProvider.api_key 
                })
            })
            
            onUpdate()
            setNewProvider({ provider: "openai", api_key: "" })
            setEditingKey(null)
            alert("Provider updated!")
        } catch(e) {
            alert("Failed to update provider")
        } finally {
            setSaving(false)
        }
    }

    const handleEdit = (key: string, profile: any) => {
        setEditingKey(key)
        setNewProvider({
            provider: profile.provider,
            api_key: profile.key || profile.api_key || profile.email || ""
        })
    }

    const handleCancelEdit = () => {
        setEditingKey(null)
        setNewProvider({ provider: "openai", api_key: "" })
    }

    const toggleVisibility = (key: string) => {
        const next = new Set(visibleKeys)
        if (next.has(key)) next.delete(key) 
        else next.add(key)
        setVisibleKeys(next)
    }

    const isOauthProvider = (p: string) => p.includes('antigravity') || p.includes('copilot')

    return (
        <div className="space-y-6">
             <Card className={editingKey ? "border-accent/50 bg-accent/5" : ""}>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>{editingKey ? `Edit Profile: ${editingKey}` : "Add Provider"}</CardTitle>
                        {editingKey && (
                            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                <X className="h-4 w-4 mr-1"/> Cancel
                            </Button>
                        )}
                    </div>
                    <CardDescription>
                        {editingKey ? "Update credentials via CLI." : "Add a new credential via CLI."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <select 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value={newProvider.provider}
                                onChange={(e) => setNewProvider({ ...newProvider, provider: e.target.value })}
                            >
                                {knownProviders.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    {isOauthProvider(newProvider.provider) && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-600 text-xs">
                            <strong>Note:</strong> Interactive OAuth login is not fully supported in this UI yet. Use CLI.
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>{isOauthProvider(newProvider.provider) ? 'Email / ID' : 'API Key'}</Label>
                        <Input 
                            type={isOauthProvider(newProvider.provider) ? "text" : "password"}
                            value={newProvider.api_key} 
                            onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
                            placeholder="sk-..."
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSaveAuth} disabled={saving} className="w-full">
                        {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> : (editingKey ? <Save className="mr-2 h-4 w-4"/> : <Plus className="mr-2 h-4 w-4"/>)}
                        {editingKey ? "Update Provider" : "Add Provider"}
                    </Button>
                </CardFooter>
            </Card>

            <div className="space-y-4">
                <Label className="text-lg">Active Providers</Label>
                {profilesList.map((p: any) => {
                    const stats = config.auth?.usageStats?.[p.key]
                    const isCooldown = stats?.cooldownUntil && stats.cooldownUntil > Date.now()
                    const isVisible = visibleKeys.has(p.key)
                    const secret = p.key || p.api_key || p.email || ""
                    return (
                        <Card key={p.key} className={`relative group ${isCooldown ? 'border-orange-500/30 bg-orange-500/5' : ''}`}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-center">
                                    <CardTitle className="text-sm font-mono flex items-center gap-2">
                                        <Key className="h-4 w-4 text-muted-foreground"/> 
                                        {p.key}
                                        {isCooldown && <Badge variant="outline" className="text-[10px] bg-orange-500 text-white border-none ml-1 uppercase">Cooldown</Badge>}
                                        {!isCooldown && (stats?.errorCount || 0) > 0 && <Badge variant="outline" className="text-[10px] bg-yellow-500 text-white border-none ml-1 uppercase">Warning</Badge>}
                                        {!isCooldown && stats?.lastUsed && (stats?.errorCount || 0) === 0 && <Badge variant=\"outline\" className=\"text-[10px] bg-green-500 text-white border-none ml-1 uppercase\">Healthy</Badge>}
                                    </CardTitle>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => toggleVisibility(p.key)}>
                                            {isVisible ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => handleEdit(p.key, p)}>
                                            <Pencil className="h-4 w-4"/>
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xs text-muted-foreground grid gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-foreground">{p.provider}</span>
                                        <span className="opacity-50">•</span>
                                        <span className="uppercase text-[10px] bg-muted px-1.5 py-0.5 rounded">{p.mode}</span>
                                        
                                        {(stats?.errorCount || 0) > 0 && (
                                            <span className="text-red-500">Errors: {stats.errorCount}</span>
                                        )}
                                    </div>
                                    
                                    <div className="font-mono bg-muted/50 p-2 rounded text-[11px] truncate select-all">
                                        {isVisible ? secret : (secret ? `${secret.substring(0, 3)}...${secret.slice(-4)}` : "No secret set")}
                                    </div>

                                    {isCooldown && stats?.cooldownUntil && (
                                        <div className="text-[10px] text-orange-600 font-medium">
                                            Cooldown until {new Date(stats.cooldownUntil).toLocaleTimeString()}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
