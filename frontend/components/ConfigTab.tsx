"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Plus, Trash2, Save, RefreshCw, Key, Bot, Eye, EyeOff, Pencil, X, ArrowUp, ArrowDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

// IMP-7: TypeScript interfaces for config types
interface AuthProfile {
    provider: string
    key?: string
    api_key?: string
    email?: string
    mode?: string
}

interface UsageStats {
    lastUsed?: number
    errorCount?: number
    cooldownUntil?: number
}

interface ChannelAccount {
    enabled: boolean
    botToken?: string
    token?: string
    webhook?: string
    phoneNumber?: string
}

interface ChannelConfig {
    enabled?: boolean
    accounts?: Record<string, ChannelAccount>
}

interface Agent {
    id: string
    model?: string
    systemPrompt?: string
}

interface OpenClawConfig {
    agents?: {
        list?: Agent[]
        defaults?: { model?: { primary?: string } }
        models?: Record<string, { alias?: string }>
    }
    auth?: {
        profiles?: Record<string, AuthProfile>
        usageStats?: Record<string, UsageStats>
        order?: Record<string, string[]>
    }
    channels?: Record<string, ChannelConfig>
}

const SUPPORTED_CHANNELS: { id: string; name: string; icon: string; fields: { key: string; label: string; type: string; placeholder: string }[] }[] = [
    {
        id: 'telegram', name: 'Telegram', icon: '✈️',
        fields: [{ key: 'botToken', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u3ew11' }]
    },
    {
        id: 'whatsapp', name: 'WhatsApp', icon: '💬',
        fields: [{ key: 'phoneNumber', label: 'Phone Number', type: 'text', placeholder: '+628123456789' }]
    },
    {
        id: 'discord', name: 'Discord', icon: '🎮',
        fields: [{ key: 'token', label: 'Bot Token', type: 'password', placeholder: 'MTk.....' }]
    },
    {
        id: 'slack', name: 'Slack', icon: '💼',
        fields: [
            { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...' },
            { key: 'appToken', label: 'App Token (Socket Mode)', type: 'password', placeholder: 'xapp-...' }
        ]
    },
    {
        id: 'signal', name: 'Signal', icon: '🔒',
        fields: [{ key: 'phoneNumber', label: 'Bot Phone Number', type: 'text', placeholder: '+1234567890' }]
    },
    {
        id: 'googlechat', name: 'Google Chat', icon: '💚',
        fields: [{ key: 'webhook', label: 'Webhook URL', type: 'text', placeholder: 'https://chat.googleapis.com/...' }]
    },
]

interface AvailableModel {
    key?: string
    id?: string
    name?: string
    provider?: string
}

interface ConfigTabProps {
    projectId: string
}

// IMP-4: Toast-style notification helper (uses sonner)
function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (type === 'error') toast.error(message)
    else toast.success(message)
}

// IMP-5: Centralized fetch helper with Content-Type header
async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> || {})
    }
    return fetch(url, { ...options, headers })
}

export function ConfigTab({ projectId }: ConfigTabProps) {
    const [config, setConfig] = useState<OpenClawConfig | null>(null)
    const [loading, setLoading] = useState(false)
    const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])

    const fetchConfig = useCallback(async () => {
        setLoading(true)
        try {
            const res = await apiFetch(`/api/projects/${projectId}/config`)
            if (res.ok) {
                const data = await res.json()
                setConfig(data || {})
            }
        } catch (error) {
            console.error("Failed to load config", error)
        } finally {
            setLoading(false)
        }
    }, [projectId])

    const fetchModels = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/projects/${projectId}/models`)
            if (res.ok) {
                const data = await res.json()
                setAvailableModels(data.models || [])
            }
        } catch (error) {
            console.error("Failed to load models", error)
        }
    }, [projectId])

    const refreshData = useCallback(() => {
        fetchConfig()
        fetchModels()
    }, [fetchConfig, fetchModels])

    useEffect(() => {
        refreshData()
    }, [refreshData])

    if (loading && !config) return <div className="p-4 text-center">Loading configuration...</div>
    if (!config) return <div className="p-4 text-center text-red-500">Failed to load configuration.</div>

    return (
        <div className="space-y-6">
            <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="channels">Channels</TabsTrigger>
                    <TabsTrigger value="llm">LLM Providers</TabsTrigger>
                    <TabsTrigger value="aliases">Model Aliases</TabsTrigger>
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

                <TabsContent value="aliases">
                    <AliasesEditor config={config} projectId={projectId} onUpdate={refreshData} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

function GeneralEditor({ config, projectId, availableModels, onUpdate }: {
    config: OpenClawConfig
    projectId: string
    availableModels: AvailableModel[]
    onUpdate: () => void
}) {
    const agent = config.agents?.list?.find((a) => a.id === 'main') || config.agents?.list?.[0] || {} as Agent
    const [model, setModel] = useState(agent.model || "")
    const [prompt, setPrompt] = useState(agent.systemPrompt || "")
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            // IMP-5 FIX: Always use Content-Type header
            if (model !== agent.model) {
                await apiFetch(`/api/projects/${projectId}/command`, {
                    method: 'POST',
                    body: JSON.stringify({ args: ["config", "set", "agents.defaults.model.primary", model] })
                })
            }
            onUpdate()
            showToast("Agent settings updated!")
        } catch (e) {
            showToast("Update failed", "error")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Identity & Behavior</CardTitle>
                <CardDescription>Configure the agent&apos;s brain.</CardDescription>
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
                            {Array.isArray(availableModels) && availableModels.length > 0 ? (
                                availableModels.map((m) => {
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
                    {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Update Agent
                </Button>
            </CardFooter>
        </Card>
    )
}

function ChannelsEditor({ config, projectId, onUpdate }: {
    config: OpenClawConfig
    projectId: string
    onUpdate: () => void
}) {
    const channels = config.channels || {}
    const [savingChannel, setSavingChannel] = useState<string | null>(null)
    const [addingChannel, setAddingChannel] = useState<string | null>(null)
    const [channelFields, setChannelFields] = useState<Record<string, Record<string, string>>>({})

    // Initialize field values from config (supports both flat and nested format)
    useEffect(() => {
        const initial: Record<string, Record<string, string>> = {}
        SUPPORTED_CHANNELS.forEach(ch => {
            const chConfig = channels[ch.id]
            // Support both flat format (botToken on channel) and nested (accounts.default.botToken)
            const account = chConfig?.accounts?.['default'] || {} as ChannelAccount
            const fields: Record<string, string> = {}
            ch.fields.forEach(f => {
                // Try nested first, then flat
                fields[f.key] = (account as any)[f.key] || (chConfig as any)?.[f.key] || ''
            })
            initial[ch.id] = fields
        })
        setChannelFields(initial)
    }, [config])

    const getChannelStatus = (channelId: string): 'active' | 'configured' | 'unconfigured' => {
        const ch = channels[channelId]
        if (!ch) return 'unconfigured'
        // Support both flat format (botToken on channel) and nested (accounts.default)
        const account = ch.accounts?.['default'] || {}
        // Check credentials in both nested account AND flat channel object
        const hasNestedCredentials = Object.values(account).some(v => typeof v === 'string' && v.length > 0)
        const channelDef = SUPPORTED_CHANNELS.find(sc => sc.id === channelId)
        const hasFlatCredentials = channelDef?.fields?.some(
            f => typeof (ch as any)[f.key] === 'string' && (ch as any)[f.key].length > 0
        ) ?? false
        const hasCredentials = hasNestedCredentials || hasFlatCredentials
        if (ch.enabled !== false && hasCredentials) return 'active'
        if (hasCredentials) return 'configured'
        return 'unconfigured'
    }

    const handleSaveChannel = async (channelId: string) => {
        setSavingChannel(channelId)
        try {
            const fields = channelFields[channelId] || {}
            const res = await apiFetch(`/api/projects/${projectId}/channels`, {
                method: 'POST',
                body: JSON.stringify({ type: channelId, config: fields })
            })
            const data = await res.json().catch(() => ({ success: true }))
            if (data.success === false) {
                showToast(`${channelId}: ${data.message || 'Config save failed'}`, 'error')
            } else {
                showToast(`${channelId} channel updated!`)
            }
            onUpdate()
            setAddingChannel(null)
        } catch (e) {
            showToast(`Failed to update ${channelId}`, 'error')
        } finally {
            setSavingChannel(null)
        }
    }

    const handleDisableChannel = async (channelId: string) => {
        if (!confirm(`Disable ${channelId} channel?`)) return
        setSavingChannel(channelId)
        try {
            await apiFetch(`/api/projects/${projectId}/command`, {
                method: 'POST',
                body: JSON.stringify({ args: ['config', 'set', `channels.${channelId}.enabled`, 'false'] })
            })
            onUpdate()
            showToast(`${channelId} channel disabled`)
        } catch (e) {
            showToast(`Failed to disable ${channelId}`, 'error')
        } finally {
            setSavingChannel(null)
        }
    }

    const handleToggleChannel = async (channelId: string, enabled: boolean) => {
        setSavingChannel(channelId)
        try {
            // We use the AddChannel endpoint which merges into default account
            // This ensures both account.enabled is updated AND implicitly channel.enabled is true
            const res = await apiFetch(`/api/projects/${projectId}/channels`, {
                method: 'POST',
                body: JSON.stringify({
                    type: channelId,
                    config: { enabled }  // This explicitly sets accounts.default.enabled
                })
            })
            // If disabling, also try to set top-level disabled via command for completeness
            if (!enabled) {
                await apiFetch(`/api/projects/${projectId}/command`, {
                    method: 'POST',
                    body: JSON.stringify({ args: ['config', 'set', `channels.${channelId}.enabled`, 'false'] })
                }).catch(() => { })
            }

            const data = await res.json().catch(() => ({ success: true }))
            if (data.success === false) {
                showToast(`${channelId}: ${data.message}`, 'error')
            } else {
                showToast(`${channelId} ${enabled ? 'enabled' : 'disabled'}!`)
            }
            onUpdate()
        } catch (e) {
            showToast(`Failed to toggle ${channelId}`, 'error')
        } finally {
            setSavingChannel(null)
        }
    }

    const updateField = (channelId: string, fieldKey: string, value: string) => {
        setChannelFields(prev => ({
            ...prev,
            [channelId]: { ...(prev[channelId] || {}), [fieldKey]: value }
        }))
    }

    const configuredChannels = SUPPORTED_CHANNELS.filter(ch => getChannelStatus(ch.id) !== 'unconfigured')
    const unconfiguredChannels = SUPPORTED_CHANNELS.filter(ch => getChannelStatus(ch.id) === 'unconfigured')

    return (
        <div className="space-y-6">
            {/* Configured Channels */}
            {configuredChannels.length > 0 && (
                <div className="space-y-4">
                    <Label className="text-lg">Active Channels</Label>
                    {configuredChannels.map(ch => {
                        const status = getChannelStatus(ch.id)
                        const fields = channelFields[ch.id] || {}
                        const isSaving = savingChannel === ch.id
                        return (
                            <Card key={ch.id} className={status === 'active' ? 'border-green-500/30' : 'border-orange-500/30'}>
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-sm flex items-center gap-2">
                                            <span className="text-lg">{ch.icon}</span>
                                            {ch.name}
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] ml-1 ${status === 'active'
                                                    ? 'bg-green-500/10 text-green-600 border-green-200'
                                                    : 'bg-orange-500/10 text-orange-600 border-orange-200'}`}
                                            >
                                                {status === 'active' ? 'Active' : 'Disabled'}
                                            </Badge>
                                        </CardTitle>
                                        <div className="flex gap-2 items-center">
                                            <div className="flex items-center space-x-2">
                                                <Switch
                                                    id={`switch-${ch.id}`}
                                                    checked={status === 'active'}
                                                    onCheckedChange={(c) => handleToggleChannel(ch.id, c)}
                                                    disabled={isSaving}
                                                />
                                            </div>
                                            <Button
                                                variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600"
                                                onClick={() => handleDisableChannel(ch.id)} disabled={isSaving}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {ch.fields.map(f => (
                                        <div key={f.key} className="space-y-1">
                                            <Label className="text-xs">{f.label}</Label>
                                            <Input
                                                type={f.type}
                                                value={fields[f.key] || ''}
                                                onChange={(e) => updateField(ch.id, f.key, e.target.value)}
                                                placeholder={f.placeholder}
                                            />
                                        </div>
                                    ))}
                                </CardContent>
                                <CardFooter>
                                    <Button size="sm" onClick={() => handleSaveChannel(ch.id)} disabled={isSaving}>
                                        {isSaving ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                                        Update
                                    </Button>
                                </CardFooter>
                            </Card>
                        )
                    })}
                </div>
            )
            }

            {/* Add channel */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" /> Add Channel
                    </CardTitle>
                    <CardDescription>Connect a new messaging platform to your OpenClaw agent.</CardDescription>
                </CardHeader>
                <CardContent>
                    {addingChannel ? (
                        <div className="space-y-4">
                            {(() => {
                                const ch = SUPPORTED_CHANNELS.find(c => c.id === addingChannel)
                                if (!ch) return null
                                const fields = channelFields[ch.id] || {}
                                return (
                                    <>
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <span className="text-lg">{ch.icon}</span> {ch.name}
                                        </div>
                                        {ch.id === 'whatsapp' && (
                                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-600 text-xs">
                                                <strong>Note:</strong> WhatsApp requires QR pairing after setup. Use the Console tab to complete pairing via <code>openclaw channels login</code>.
                                            </div>
                                        )}
                                        {ch.id === 'signal' && (
                                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-600 text-xs">
                                                <strong>Note:</strong> Signal requires device linking after setup.
                                            </div>
                                        )}
                                        {ch.fields.map(f => (
                                            <div key={f.key} className="space-y-1">
                                                <Label>{f.label}</Label>
                                                <Input
                                                    type={f.type}
                                                    value={fields[f.key] || ''}
                                                    onChange={(e) => updateField(ch.id, f.key, e.target.value)}
                                                    placeholder={f.placeholder}
                                                />
                                            </div>
                                        ))}
                                        <div className="flex gap-2">
                                            <Button onClick={() => handleSaveChannel(ch.id)} disabled={savingChannel === ch.id}>
                                                {savingChannel === ch.id ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                Enable Channel
                                            </Button>
                                            <Button variant="ghost" onClick={() => setAddingChannel(null)}>
                                                <X className="mr-2 h-4 w-4" /> Cancel
                                            </Button>
                                        </div>
                                    </>
                                )
                            })()}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {unconfiguredChannels.map(ch => (
                                <Button
                                    key={ch.id}
                                    variant="outline"
                                    className="h-auto py-4 flex flex-col items-center gap-2"
                                    onClick={() => setAddingChannel(ch.id)}
                                >
                                    <span className="text-2xl">{ch.icon}</span>
                                    <span className="text-sm">{ch.name}</span>
                                </Button>
                            ))}
                            {unconfiguredChannels.length === 0 && (
                                <p className="col-span-full text-center text-sm text-muted-foreground py-4">
                                    All supported channels are configured.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {
                configuredChannels.length === 0 && !addingChannel && (
                    <div className="text-center p-8 border border-dashed rounded text-muted-foreground">
                        No channels configured. Add one above to connect your agent.
                    </div>
                )
            }
        </div >
    )
}

function LLMEditor({ config, projectId, availableModels, onUpdate }: {
    config: OpenClawConfig
    projectId: string
    availableModels: AvailableModel[]
    onUpdate: () => void
}) {
    const profiles = config.auth?.profiles || {}
    const profilesList = Object.entries(profiles).map(([key, val]) => ({
        key,
        ...val
    }))

    // Default model state
    const [defaultModel, setDefaultModel] = useState(config.agents?.defaults?.model?.primary || "")
    const [savingDefault, setSavingDefault] = useState(false)

    // Provider management state
    const [newProvider, setNewProvider] = useState({ provider: "openai", api_key: "" })
    const [saving, setSaving] = useState(false)
    const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
    const [editingKey, setEditingKey] = useState<string | null>(null)
    const [deletingKey, setDeletingKey] = useState<string | null>(null)
    const [oauthLoading, setOauthLoading] = useState(false)
    const [oauthOutput, setOauthOutput] = useState<string | null>(null)
    const [callbackUrl, setCallbackUrl] = useState("")
    const [callbackSubmitting, setCallbackSubmitting] = useState(false)

    const safeModels = Array.isArray(availableModels) ? availableModels : []

    const derivedProviders = safeModels.map((m) => {
        if (m.provider) return m.provider
        if (m.key) return m.key.split('/')[0]
        return null
    }).filter(Boolean) as string[]

    const commonProviders = ['openai', 'anthropic', 'google', 'google-antigravity', 'openrouter', 'deepseek', 'mistral', 'groq', 'together', 'fireworks']
    const knownProviders: string[] = Array.from(new Set([...commonProviders, ...derivedProviders])).sort()

    // Available models for dropdown (sort by provider then name)
    const modelOptions = [...safeModels].sort((a, b) => {
        const pA = a.provider || "", pB = b.provider || ""
        if (pA !== pB) return pA.localeCompare(pB)
        return (a.id || "").localeCompare(b.id || "")
    })

    useEffect(() => {
        setDefaultModel(config.agents?.defaults?.model?.primary || "")
    }, [config])

    const handleSaveDefault = async () => {
        if (!defaultModel) return
        setSavingDefault(true)
        try {
            // Create deep copy of config to modify
            const newConfig = JSON.parse(JSON.stringify(config))
            if (!newConfig.agents) newConfig.agents = {}
            if (!newConfig.agents.defaults) newConfig.agents.defaults = {}
            if (!newConfig.agents.defaults.model) newConfig.agents.defaults.model = {}

            newConfig.agents.defaults.model.primary = defaultModel

            await apiFetch(`/api/projects/${projectId}/config`, {
                method: 'PUT',
                body: JSON.stringify(newConfig)
            })

            showToast("Default model updated!")
            onUpdate() // Refresh config
        } catch (e) {
            showToast("Failed to update default model", "error")
        } finally {
            setSavingDefault(false)
        }
    }

    const handleSaveAuth = async () => {
        if (!newProvider.provider) {
            showToast("Select a provider", "error")
            return
        }
        if (!newProvider.api_key && !isOauthProvider(newProvider.provider)) {
            showToast("API Key required", "error")
            return
        }
        setSaving(true)
        try {
            await apiFetch(`/api/projects/${projectId}/auth/add`, {
                method: 'POST',
                body: JSON.stringify({
                    provider: newProvider.provider,
                    key: newProvider.api_key
                })
            })

            onUpdate()
            setNewProvider({ provider: "openai", api_key: "" })
            setEditingKey(null)
            setOauthOutput(null)
            setCallbackUrl("")
            showToast("Provider updated!")
        } catch (e) {
            showToast("Failed to update provider", "error")
        } finally {
            setSaving(false)
        }
    }

    // Step 1: Start OAuth flow — get the authorization URL
    const handleOAuthLogin = async () => {
        if (!newProvider.provider) {
            showToast("Select a provider first", "error")
            return
        }
        setOauthLoading(true)
        setOauthOutput(null)
        setCallbackUrl("")
        try {
            const res = await apiFetch(`/api/projects/${projectId}/auth/login`, {
                method: 'POST',
                body: JSON.stringify({ provider: newProvider.provider })
            })
            if (res.ok) {
                const data = await res.json()
                const output = typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2)
                setOauthOutput(output)
                showToast("Step 1 complete! Open the URL, login, then paste the callback URL below.")
            } else {
                const err = await res.json().catch(() => ({ message: "Failed" }))
                showToast(err.message || "OAuth login failed", "error")
            }
        } catch (e) {
            showToast("Failed to start OAuth login", "error")
        } finally {
            setOauthLoading(false)
        }
    }

    // Step 2: Submit the callback URL to complete OAuth
    const handleOAuthCallback = async () => {
        if (!callbackUrl.trim()) {
            showToast("Paste the callback URL from your browser", "error")
            return
        }
        setCallbackSubmitting(true)
        try {
            const res = await apiFetch(`/api/projects/${projectId}/auth/callback`, {
                method: 'POST',
                body: JSON.stringify({
                    provider: newProvider.provider,
                    callbackUrl: callbackUrl.trim()
                })
            })
            if (res.ok) {
                const data = await res.json()
                showToast("✅ OAuth login successful! Provider connected.")
                setOauthOutput(null)
                setCallbackUrl("")
                onUpdate()
            } else {
                const err = await res.json().catch(() => ({ message: "Failed" }))
                showToast(err.message || "Callback submission failed", "error")
            }
        } catch (e) {
            showToast("Failed to submit callback", "error")
        } finally {
            setCallbackSubmitting(false)
        }
    }

    const handleDelete = async (profileKey: string) => {
        if (!confirm(`Remove provider "${profileKey}"? This cannot be undone.`)) return
        setDeletingKey(profileKey)
        try {
            await apiFetch(`/api/projects/${projectId}/command`, {
                method: 'POST',
                body: JSON.stringify({ args: ["auth", "remove", profileKey] })
            })
            onUpdate()
            showToast(`Provider "${profileKey}" removed`)
        } catch (e) {
            showToast("Failed to remove provider", "error")
        } finally {
            setDeletingKey(null)
        }
    }

    const handleEdit = (key: string, profile: AuthProfile) => {
        setEditingKey(key)
        setNewProvider({
            provider: profile.provider,
            api_key: profile.key || profile.api_key || profile.email || ""
        })
        setOauthOutput(null)
    }

    const handleCancelEdit = () => {
        setEditingKey(null)
        setNewProvider({ provider: "openai", api_key: "" })
        setOauthOutput(null)
    }

    const toggleVisibility = (key: string) => {
        const next = new Set(visibleKeys)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        setVisibleKeys(next)
    }

    const isOauthProvider = (p: string) =>
        ['google-antigravity', 'copilot', 'anthropic-oauth', 'openai-oauth'].some(op => p.includes(op))

    return (
        <div className="space-y-6">
            {/* Default Model Selector */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Default Model</CardTitle>
                    <CardDescription>Select the primary model for your agent. Ensure the provider is configured below.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={defaultModel}
                            onChange={(e) => setDefaultModel(e.target.value)}
                        >
                            <option value="">Select a model...</option>
                            {modelOptions.length > 0 ? (
                                modelOptions.map(m => (
                                    <option key={m.id || m.key} value={m.id || m.key}>
                                        {m.id || m.key} {m.provider ? `(${m.provider})` : ''}
                                    </option>
                                ))
                            ) : (
                                // Fallback if no models are detected yet
                                knownProviders.map(p => (
                                    <option key={p} value={p}>{p} (auto-detect)</option>
                                ))
                            )}
                        </select>
                        <Button onClick={handleSaveDefault} disabled={savingDefault || defaultModel === (config.agents?.defaults?.model?.primary || "")}>
                            {savingDefault ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save
                        </Button>
                    </div>
                    {modelOptions.length === 0 && (
                        <p className="text-[11px] text-muted-foreground mt-2">
                            Tip: Connect a provider below to see available models.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card className={editingKey ? "border-accent/50 bg-accent/5" : ""}>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>{editingKey ? `Edit Profile: ${editingKey}` : "Add Provider"}</CardTitle>
                        {editingKey && (
                            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                <X className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                        )}
                    </div>
                    <CardDescription>
                        {editingKey ? "Update credentials for this provider." : "Add a new LLM provider with API key or OAuth."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={newProvider.provider}
                            onChange={(e) => {
                                setNewProvider({ ...newProvider, provider: e.target.value, api_key: "" })
                                setOauthOutput(null)
                            }}
                        >
                            {knownProviders.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    {isOauthProvider(newProvider.provider) ? (
                        <div className="space-y-3">
                            {/* Step 1: Get Auth URL */}
                            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md text-xs space-y-2">
                                <p className="font-semibold text-blue-700">① Start OAuth Login</p>
                                <p className="text-blue-600">Click below to get the authorization URL. Open it in your browser and login.</p>
                            </div>
                            <Button
                                onClick={handleOAuthLogin}
                                disabled={oauthLoading || !!oauthOutput}
                                variant="outline"
                                className="w-full"
                            >
                                {oauthLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
                                {oauthLoading ? "Getting auth URL..." : oauthOutput ? "✓ URL Retrieved" : `Get Login URL for ${newProvider.provider}`}
                            </Button>

                            {/* Step 1 Output: Show URL */}
                            {oauthOutput && (
                                <>
                                    <div className="bg-muted/50 p-3 rounded-md border space-y-2">
                                        <Label className="text-xs text-muted-foreground block">Open this URL in your browser:</Label>
                                        <pre className="text-xs font-mono whitespace-pre-wrap break-all select-all bg-background p-2 rounded border">{oauthOutput}</pre>
                                        <Button
                                            variant="ghost" size="sm" className="text-xs"
                                            onClick={() => { navigator.clipboard.writeText(oauthOutput); showToast("URL copied!") }}
                                        >
                                            📋 Copy URL
                                        </Button>
                                    </div>

                                    {/* Step 2: Paste Callback URL */}
                                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md text-xs space-y-2">
                                        <p className="font-semibold text-green-700">② Paste Callback URL</p>
                                        <p className="text-green-600">After logging in, your browser will redirect. Copy the full URL from the address bar and paste it below.</p>
                                    </div>
                                    <Input
                                        type="text"
                                        value={callbackUrl}
                                        onChange={(e) => setCallbackUrl(e.target.value)}
                                        placeholder="http://localhost:18789/oauth/callback?code=..."
                                        className="font-mono text-xs"
                                    />
                                    <Button
                                        onClick={handleOAuthCallback}
                                        disabled={callbackSubmitting || !callbackUrl.trim()}
                                        className="w-full"
                                    >
                                        {callbackSubmitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        {callbackSubmitting ? "Completing login..." : "Complete OAuth Login"}
                                    </Button>
                                </>
                            )}

                            {/* Reset button */}
                            {oauthOutput && (
                                <Button
                                    variant="ghost" size="sm" className="w-full text-xs text-muted-foreground"
                                    onClick={() => { setOauthOutput(null); setCallbackUrl("") }}
                                >
                                    ↻ Start Over
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label>API Key</Label>
                            <Input
                                type="password"
                                value={newProvider.api_key}
                                onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
                                placeholder="sk-..."
                            />
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex gap-2">
                    {!isOauthProvider(newProvider.provider) && (
                        <Button onClick={handleSaveAuth} disabled={saving} className="flex-1">
                            {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : (editingKey ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />)}
                            {editingKey ? "Update Provider" : "Add Provider"}
                        </Button>
                    )}
                </CardFooter>
            </Card>

            <div className="space-y-4">
                <Label className="text-lg">Active Providers</Label>
                {profilesList.length === 0 && (
                    <p className="text-sm text-muted-foreground">No providers configured yet. Add one above.</p>
                )}
                {profilesList.map((p) => {
                    const stats = config.auth?.usageStats?.[p.key]
                    const isCooldown = stats?.cooldownUntil && stats.cooldownUntil > Date.now()
                    const isVisible = visibleKeys.has(p.key)
                    const secret = p.key || p.api_key || p.email || ""
                    const isDeleting = deletingKey === p.key
                    return (
                        <Card key={p.key} className={`relative group ${isCooldown ? 'border-orange-500/30 bg-orange-500/5' : ''}`}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-center">
                                    <CardTitle className="text-sm font-mono flex items-center gap-2">
                                        <Key className="h-4 w-4 text-muted-foreground" />
                                        {p.key}
                                        {isCooldown && <Badge variant="outline" className="text-[10px] bg-orange-500 text-white border-none ml-1 uppercase">Cooldown</Badge>}
                                        {!isCooldown && (stats?.errorCount || 0) > 0 && <Badge variant="outline" className="text-[10px] bg-yellow-500 text-white border-none ml-1 uppercase">Warning</Badge>}
                                        {!isCooldown && stats?.lastUsed && (stats?.errorCount || 0) === 0 && <Badge variant="outline" className="text-[10px] bg-green-500 text-white border-none ml-1 uppercase">Healthy</Badge>}
                                    </CardTitle>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => toggleVisibility(p.key)}>
                                            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => handleEdit(p.key, p)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                            onClick={() => handleDelete(p.key)}
                                            disabled={isDeleting}
                                        >
                                            {isDeleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                                            <span className="text-red-500">Errors: {stats?.errorCount}</span>
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

function AliasesEditor({ config, projectId, onUpdate }: {
    config: OpenClawConfig
    projectId: string
    onUpdate: () => void
}) {
    const [aliases, setAliases] = useState<{ [key: string]: string }>({})
    const [newAlias, setNewAlias] = useState({ key: '', value: '' })
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)

    useEffect(() => {
        const models = config.agents?.models || {}
        const loadedAliases: { [key: string]: string } = {}
        Object.entries(models).forEach(([key, val]) => {
            if (val.alias) loadedAliases[key] = val.alias
        })
        setAliases(loadedAliases)
    }, [config])

    const handleSave = async () => {
        if (!newAlias.key || !newAlias.value) return
        setSaving(true)
        try {
            await apiFetch(`/api/projects/${projectId}/command`, {
                method: 'POST',
                body: JSON.stringify({
                    args: ['config', 'set', `agents.models.${newAlias.key}.alias`, newAlias.value]
                })
            })
            setNewAlias({ key: '', value: '' })
            onUpdate()
            showToast(`Alias added: ${newAlias.value} -> ${newAlias.key}`)
        } catch (e) {
            showToast("Failed to add alias", "error")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (modelKey: string) => {
        if (!confirm(`Remove alias for ${modelKey}?`)) return
        setDeleting(modelKey)
        try {
            const newConfig = JSON.parse(JSON.stringify(config))
            if (newConfig.agents?.models?.[modelKey]) {
                delete newConfig.agents.models[modelKey]
                await apiFetch(`/api/projects/${projectId}/config`, {
                    method: 'PUT',
                    body: JSON.stringify(newConfig)
                })
                onUpdate()
                showToast("Alias removed")
            }
        } catch (e) {
            showToast("Failed to remove alias", "error")
        } finally {
            setDeleting(null)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Model Aliases</CardTitle>
                <CardDescription>Map long model names to short aliases for easier CLI/API usage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input
                        placeholder="Model ID (e.g. google/gemini-pro)"
                        value={newAlias.key}
                        onChange={(e) => setNewAlias({ ...newAlias, key: e.target.value })}
                        className="flex-1"
                    />
                    <Input
                        placeholder="Alias (e.g. gemini)"
                        value={newAlias.value}
                        onChange={(e) => setNewAlias({ ...newAlias, value: e.target.value })}
                        className="w-32"
                    />
                    <Button onClick={handleSave} disabled={saving || !newAlias.key || !newAlias.value}>
                        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                </div>

                <div className="space-y-2">
                    {Object.entries(aliases).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No aliases configured.</p>
                    )}
                    {Object.entries(aliases).map(([model, alias]) => (
                        <div key={model} className="flex items-center justify-between p-2 border rounded-md bg-muted/20">
                            <div className="flex flex-col">
                                <span className="font-mono text-xs font-semibold text-primary">{alias}</span>
                                <span className="text-[10px] text-muted-foreground">{model}</span>
                            </div>
                            <Button
                                variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-500"
                                onClick={() => handleDelete(model)}
                                disabled={deleting === model}
                            >
                                {deleting === model ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </Button>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

