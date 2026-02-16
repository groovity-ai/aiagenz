"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Plus, Trash2, Save, RefreshCw, Key, Bot, Eye, EyeOff, Pencil, X } from "lucide-react"

interface ConfigTabProps {
  projectId: string
}

export function ConfigTab({ projectId }: ConfigTabProps) {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [availableModels, setAvailableModels] = useState<any[]>([])

  useEffect(() => {
    fetchConfig()
    fetchModels()
  }, [projectId])

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

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        alert("Configuration saved! Agent is restarting...")
        fetchConfig()
      } else {
        alert("Failed to save config")
      }
    } catch (error) {
      console.error("Save error", error)
      alert("Error saving configuration")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-4 text-center">Loading configuration...</div>
  if (!config) return <div className="p-4 text-center text-red-500">Failed to load configuration.</div>

  // --- Helper to extract Main Agent ---
  const getMainAgent = () => {
      const list = config.agents?.list || []
      return list.find((a: any) => a.id === 'main') || list[0] || { id: 'main' }
  }

  const updateMainAgent = (updates: any) => {
      const list = [...(config.agents?.list || [])]
      const index = list.findIndex((a: any) => a.id === 'main')
      
      if (index >= 0) {
          list[index] = { ...list[index], ...updates }
      } else {
          list.push({ id: 'main', ...updates })
      }
      
      setConfig({ ...config, agents: { ...config.agents, list } })
  }

  const mainAgent = getMainAgent()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Agent Configuration</h2>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save & Restart
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="llm">LLM Providers</TabsTrigger>
        </TabsList>

        {/* --- GENERAL TAB --- */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Identity & Behavior</CardTitle>
              <CardDescription>Define how your agent introduces itself.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Agent Name</Label>
                <Input 
                  value={mainAgent.identity?.name || ""} 
                  onChange={(e) => updateMainAgent({ identity: { ...mainAgent.identity, name: e.target.value } })}
                  placeholder="e.g. My Helper Bot"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Model</Label>
                <div className="relative">
                    <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                        value={mainAgent.model || ""}
                        onChange={(e) => updateMainAgent({ model: e.target.value })}
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
                            // Fallback options if API fails or empty
                            <>
                                <optgroup label="Google">
                                    <option value="google/gemini-1.5-flash">Gemini 1.5 Flash</option>
                                    <option value="google/gemini-1.5-pro">Gemini 1.5 Pro</option>
                                </optgroup>
                                <optgroup label="OpenAI">
                                    <option value="openai/gpt-4o">GPT-4o</option>
                                    <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                                </optgroup>
                                <optgroup label="Anthropic">
                                    <option value="anthropic/claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                                </optgroup>
                            </>
                        )}
                    </select>
                    {/* Chevron Icon for Select */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.93179 5.43179C4.75605 5.25605 4.75605 4.97113 4.93179 4.79539C5.10753 4.61965 5.39245 4.61965 5.56819 4.79539L7.49999 6.72718L9.43179 4.79539C9.60753 4.61965 9.89245 4.61965 10.0682 4.79539C10.2439 4.97113 10.2439 5.25605 10.0682 5.43179L7.81819 7.68179C7.73379 7.76619 7.61933 7.8136 7.49999 7.8136C7.38064 7.8136 7.26618 7.76619 7.18179 7.68179L4.93179 5.43179Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    Selected model for the main agent. Ensure you have the corresponding API Key in the "LLM Providers" tab.
                </p>
              </div>

              <div className="space-y-2">
                <Label>System Prompt</Label>
                <textarea 
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[200px] font-mono"
                  value={mainAgent.systemPrompt || ""}
                  onChange={(e) => updateMainAgent({ systemPrompt: e.target.value })}
                  placeholder="You are a helpful assistant..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- CHANNELS TAB --- */}
        <TabsContent value="channels">
           <ChannelsEditor config={config} setConfig={setConfig} />
        </TabsContent>

        {/* --- LLM TAB --- */}
        <TabsContent value="llm">
           <LLMEditor config={config} setConfig={setConfig} availableModels={availableModels} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- CHANNELS EDITOR (Handles config.channels.telegram.accounts.default) ---
function ChannelsEditor({ config, setConfig }: { config: any, setConfig: (c: any) => void }) {
    // Extract default telegram account
    const telegram = config.channels?.telegram || {}
    const accounts = telegram.accounts || {}
    const defaultAccount = accounts['default'] || { enabled: true, botToken: "" }

    const updateDefaultToken = (token: string) => {
        const newConfig = { ...config }
        if (!newConfig.channels) newConfig.channels = {}
        if (!newConfig.channels.telegram) newConfig.channels.telegram = { enabled: true, accounts: {} }
        
        // Ensure default account exists
        if (!newConfig.channels.telegram.accounts) newConfig.channels.telegram.accounts = {}
        
        newConfig.channels.telegram.accounts['default'] = {
            ...defaultAccount,
            botToken: token,
            enabled: true
        }
        
        setConfig(newConfig)
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5"/> Telegram
                    </CardTitle>
                    <CardDescription>Configure the main Telegram bot for this agent.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Label>Bot Token</Label>
                        <Input 
                            type="password"
                            value={defaultAccount.botToken || ""}
                            onChange={(e) => updateDefaultToken(e.target.value)}
                            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                        />
                        <p className="text-xs text-muted-foreground">Get this from @BotFather on Telegram.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="text-center p-4 text-sm text-muted-foreground bg-muted/50 rounded-lg">
                More channels (WhatsApp, Discord) coming soon! 🚀
            </div>
        </div>
    )
}

// --- LLM EDITOR (Handles config.auth.profiles) ---
function LLMEditor({ config, setConfig, availableModels }: { config: any, setConfig: (c: any) => void, availableModels: any[] }) {
    const profiles = config.auth?.profiles || {}
    
    // Convert object to array for easier rendering
    const profilesList = Object.entries(profiles).map(([key, val]: [string, any]) => ({
        key,
        ...val
    }))

    // Local state for form
    const [newProvider, setNewProvider] = useState({ provider: "openai", api_key: "", model: "" })
    const [editingKey, setEditingKey] = useState<string | null>(null)
    const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

    // Extract unique providers
    const derivedProviders = availableModels.map(m => {
        if (m.provider) return m.provider
        if (m.key) return m.key.split('/')[0]
        return null
    }).filter(Boolean)

    const knownProviders = Array.from(new Set([
        "openai", "google", "anthropic", "groq", "deepseek", "openrouter",
        ...derivedProviders
    ])).sort()

    const handleSave = () => {
        if (!newProvider.api_key && newProvider.provider !== "google-antigravity") return alert("API Key required")
        
        const newProfiles = { ...profiles }
        
        // If editing, remove old entry first (to handle key rename if provider changes)
        if (editingKey) {
            delete newProfiles[editingKey]
        }

        // Generate new key or preserve old one if provider matches (and editing)
        let keyName = editingKey
        if (!keyName || !keyName.startsWith(newProvider.provider)) {
             keyName = `${newProvider.provider}:user-${Date.now().toString().slice(-4)}`
        }

        if (newProvider.provider === 'google-antigravity') {
             newProfiles[keyName] = {
                provider: newProvider.provider,
                mode: "oauth",
                email: newProvider.api_key
            }
        } else {
            newProfiles[keyName] = {
                provider: newProvider.provider,
                mode: "api_key",
                api_key: newProvider.api_key
            }
        }

        setConfig({ 
            ...config, 
            auth: { ...config.auth, profiles: newProfiles } 
        })
        
        // Reset form
        setNewProvider({ provider: "openai", api_key: "", model: "" })
        setEditingKey(null)
    }

    const handleEdit = (key: string, profile: any) => {
        setEditingKey(key)
        setNewProvider({
            provider: profile.provider,
            api_key: profile.api_key || profile.email || "",
            model: ""
        })
        // Scroll to top? usually not needed in small tabs
    }

    const handleCancelEdit = () => {
        setEditingKey(null)
        setNewProvider({ provider: "openai", api_key: "", model: "" })
    }

    const removeProvider = (key: string) => {
        if (!confirm(`Remove provider ${key}?`)) return
        const newProfiles = { ...profiles }
        delete newProfiles[key]
        if (editingKey === key) handleCancelEdit()
        setConfig({ 
            ...config, 
            auth: { ...config.auth, profiles: newProfiles } 
        })
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
                        {editingKey ? "Update credentials for this profile." : "Add a new API Key wallet."}
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
                                {knownProviders.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    {isOauthProvider(newProvider.provider) && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-600 text-xs">
                            <strong>Note:</strong> {newProvider.provider} uses OAuth login. 
                            Interactive login is not yet supported in this UI. 
                            Please use <code>google</code> (API Key) or <code>openai</code> instead for instant access.
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>{isOauthProvider(newProvider.provider) ? 'Email (Optional Identifier)' : 'API Key / Secret'}</Label>
                        <Input 
                            type={isOauthProvider(newProvider.provider) ? "text" : "password"}
                            value={newProvider.api_key} 
                            onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
                            placeholder={isOauthProvider(newProvider.provider) ? "user@example.com" : "sk-..."}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSave} className="w-full">
                        {editingKey ? <Save className="mr-2 h-4 w-4"/> : <Plus className="mr-2 h-4 w-4"/>}
                        {editingKey ? "Update Provider" : "Add Provider"}
                    </Button>
                </CardFooter>
            </Card>

            <div className="space-y-4">
                <Label className="text-lg">Active Providers (Auth Profiles)</Label>
                {profilesList.length === 0 && (
                    <div className="text-center p-8 border border-dashed rounded text-muted-foreground">
                        No providers configured. Add one above.
                    </div>
                )}
                {profilesList.map((p: any) => {
                    const isVisible = visibleKeys.has(p.key)
                    const secret = p.api_key || p.email || ""
                    const displaySecret = isVisible ? secret : `${secret.substring(0, 3)}...${secret.slice(-4)}`
                    const stats = config.auth?.usageStats?.[p.key]
                    const isCooldown = stats?.cooldownUntil && stats.cooldownUntil > Date.now()
                    
                    return (
                        <Card key={p.key} className={`relative group ${isCooldown ? 'border-orange-500/30 bg-orange-500/5' : ''}`}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-center">
                                    <CardTitle className="text-sm font-mono flex items-center gap-2">
                                        <Key className="h-4 w-4 text-muted-foreground"/> 
                                        {p.key}
                                        {isCooldown && <Badge variant="outline" className="text-[10px] bg-orange-500 text-white border-none ml-1 uppercase">Cooldown</Badge>}
                                        {!isCooldown && stats?.errorCount > 0 && <Badge variant="outline" className="text-[10px] bg-yellow-500 text-white border-none ml-1 uppercase">Warning</Badge>}
                                        {!isCooldown && stats?.lastUsed && stats?.errorCount === 0 && <Badge variant="outline" className="text-[10px] bg-green-500 text-white border-none ml-1 uppercase">Healthy</Badge>}
                                    </CardTitle>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => toggleVisibility(p.key)}>
                                            {isVisible ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => handleEdit(p.key, p)}>
                                            <Pencil className="h-4 w-4"/>
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => removeProvider(p.key)}>
                                            <Trash2 className="h-4 w-4"/>
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
                                        
                                        {stats?.errorCount > 0 && (
                                            <span className="text-red-500">Errors: {stats.errorCount}</span>
                                        )}
                                        
                                        {stats?.lastFailureAt && (
                                            <span className="text-[10px] opacity-70 italic">Last Fail: {new Date(stats.lastFailureAt).toLocaleTimeString()}</span>
                                        )}
                                    </div>
                                    
                                    <div className="font-mono bg-muted/50 p-2 rounded text-[11px] truncate select-all">
                                        {secret ? displaySecret : <span className="italic opacity-50">No secret set</span>}
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
