"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, Activity, DollarSign, Zap } from "lucide-react"

interface UsageTabProps {
    projectId: string
}

interface UsageStatsData {
    lastUsed?: number
    errorCount?: number
    cooldownUntil?: number
    cost?: number
    totalTokens?: number
}

interface ConfigData {
    auth?: { usageStats?: Record<string, UsageStatsData> }
    usageStats?: Record<string, UsageStatsData>
}

export function UsageTab({ projectId }: UsageTabProps) {
    const [config, setConfig] = useState<ConfigData | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetchConfig()
    }, [projectId])

    async function fetchConfig() {
        setLoading(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/config`)
            if (res.ok) {
                const data = await res.json()
                setConfig(data)
            }
        } catch (e) {
            console.error(e)
        }
        setLoading(false)
    }

    // Attempt to extract usage stats from auth.profiles or root 
    const stats = config?.auth?.usageStats || config?.usageStats || {}
    const items = Object.entries(stats).map(([provider, data]: [string, UsageStatsData]) => ({
        provider,
        lastUsed: data.lastUsed,
        errorCount: data.errorCount || 0,
        cooldownUntil: data.cooldownUntil,
        cost: data.cost || 0,
        tokens: data.totalTokens || 0
    }))

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle>Token Usage & Statistics</CardTitle>
                        <CardDescription>Track API usage, errors, and approximate costs across your configured models.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading && !config ? (
                        <div className="py-8 text-center text-muted-foreground">Loading usage data...</div>
                    ) : items.length === 0 ? (
                        <div className="py-8 text-center border border-dashed rounded text-muted-foreground">
                            No usage statistics accumulated yet. Your agent needs to process requests first.
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {items.map((item, idx) => (
                                <Card key={idx} className="bg-muted/30">
                                    <div className="p-4 flex flex-col h-full space-y-4">
                                        <div className="flex items-center gap-2 border-b pb-2">
                                            <Zap className="h-4 w-4 text-yellow-500" />
                                            <span className="font-semibold capitalize">{item.provider.replace(':', ' ')}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="flex flex-col">
                                                <span className="text-muted-foreground text-xs">Tokens</span>
                                                <span className="font-mono">{item.tokens.toLocaleString()}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-muted-foreground text-xs flex items-center gap-1"><DollarSign className="h-3 w-3" /> Est. Cost</span>
                                                <span className="font-mono">${(item.cost).toFixed(4)}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                                            <div className="flex flex-col">
                                                <span className="text-muted-foreground text-xs">Errors</span>
                                                <span className="font-mono text-red-400">{item.errorCount}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-muted-foreground text-xs">Last Used</span>
                                                <span className="text-[10px] text-muted-foreground mt-1 text-right">
                                                    {item.lastUsed ? new Date(item.lastUsed).toLocaleString() : 'Never'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
