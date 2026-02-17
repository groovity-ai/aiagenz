"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Activity, Cpu, HardDrive, Heart, Shield, MessageSquare,
    Users, Zap, MemoryStick, CheckCircle2, XCircle, AlertTriangle,
    RefreshCw, Clock, Wifi, WifiOff, Bot
} from "lucide-react"

// --- Types ---
interface OverviewTabProps {
    projectId: string
    project: any
    logs: string
}

interface ContainerStats {
    cpu_percent?: number
    memory_percent?: number
    memory_usage_mb?: number
    memory_limit_mb?: number
}

interface QuickStats {
    sessions: number
    channels: number
    skills: number
    memory: number
}

// --- Helpers ---
function apiFetchJson(url: string) {
    return fetch(url)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
}

function formatUptime(startedAt: string | undefined): string {
    if (!startedAt) return "—"
    const diff = Date.now() - new Date(startedAt).getTime()
    if (diff < 0) return "—"
    const d = Math.floor(diff / 86400000)
    const h = Math.floor((diff % 86400000) / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

function gaugeColor(pct: number): string {
    if (pct < 50) return "text-green-500"
    if (pct < 80) return "text-yellow-500"
    return "text-red-500"
}

function gaugeBarColor(pct: number): string {
    if (pct < 50) return "bg-green-500"
    if (pct < 80) return "bg-yellow-500"
    return "bg-red-500"
}

function gaugeTrackColor(pct: number): string {
    if (pct < 50) return "bg-green-500/10"
    if (pct < 80) return "bg-yellow-500/10"
    return "bg-red-500/10"
}

// --- Sub-components ---
function ResourceBar({ label, icon: Icon, value, max, unit, pct }: {
    label: string; icon: any; value: number; max?: number; unit: string; pct: number
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className={`h-4 w-4 ${gaugeColor(pct)}`} />
                    {label}
                </div>
                <span className={`text-sm font-bold tabular-nums ${gaugeColor(pct)}`}>
                    {pct.toFixed(1)}%
                </span>
            </div>
            <div className={`h-2.5 rounded-full ${gaugeTrackColor(pct)}`}>
                <div
                    className={`h-full rounded-full transition-all duration-500 ${gaugeBarColor(pct)}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
            <div className="text-[11px] text-muted-foreground">
                {value.toFixed(1)} {unit}{max ? ` / ${max.toFixed(0)} ${unit}` : ''}
            </div>
        </div>
    )
}

function StatusDot({ status }: { status: string }) {
    const isRunning = status === "running"
    return (
        <span className="relative flex h-3 w-3">
            {isRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
        </span>
    )
}

function DiagnosticItem({ label, pass }: { label: string; pass: boolean | null }) {
    if (pass === null) return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> {label}: Unknown
        </div>
    )
    return (
        <div className={`flex items-center gap-2 text-xs ${pass ? 'text-green-600' : 'text-red-500'}`}>
            {pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {label}
        </div>
    )
}

function QuickStatCard({ icon: Icon, label, value, color }: {
    icon: any; label: string; value: number | string; color: string
}) {
    return (
        <Card>
            <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${color}`}>
                        <Icon className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="text-xl font-bold tabular-nums">{value}</div>
                        <div className="text-[11px] text-muted-foreground">{label}</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// --- Main Component ---
export function OverviewTab({ projectId, project, logs }: OverviewTabProps) {
    const [stats, setStats] = useState<ContainerStats | null>(null)
    const [health, setHealth] = useState<any>(null)
    const [doctor, setDoctor] = useState<any>(null)
    const [agentStatus, setAgentStatus] = useState<any>(null)
    const [quickStats, setQuickStats] = useState<QuickStats>({ sessions: 0, channels: 0, skills: 0, memory: 0 })
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const isRunning = project?.status === "running"

    const fetchAll = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true)

        // Only fetch monitoring data if container is running
        if (isRunning && project?.containerId) {
            const [statsData, healthData, doctorData, agentData, sessData, chanData, skillsData, memData] =
                await Promise.allSettled([
                    apiFetchJson(`/api/projects/${projectId}/stats`),
                    apiFetchJson(`/api/projects/${projectId}/health`),
                    apiFetchJson(`/api/projects/${projectId}/doctor`),
                    apiFetchJson(`/api/projects/${projectId}/agent-status`),
                    apiFetchJson(`/api/projects/${projectId}/sessions`),
                    apiFetchJson(`/api/projects/${projectId}/channels`),
                    apiFetchJson(`/api/projects/${projectId}/skills`),
                    apiFetchJson(`/api/projects/${projectId}/memory`),
                ])

            const val = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value : null

            setStats(val(statsData))
            setHealth(val(healthData))
            setDoctor(val(doctorData))
            setAgentStatus(val(agentData))

            const countItems = (data: any): number => {
                if (Array.isArray(data)) return data.length
                if (data && typeof data === 'object') {
                    // Could be { items: [...] } or { key: value }
                    if (data.items) return data.items.length
                    return Object.keys(data).length
                }
                return 0
            }

            setQuickStats({
                sessions: countItems(val(sessData)),
                channels: countItems(val(chanData)),
                skills: countItems(val(skillsData)),
                memory: countItems(val(memData)),
            })
        }

        setLoading(false)
        if (showRefresh) setRefreshing(false)
    }, [projectId, isRunning, project?.containerId])

    useEffect(() => {
        // Grace period: wait 10s before first poll to let OpenClaw initialize
        const initialDelay = setTimeout(() => {
            fetchAll()
        }, isRunning ? 10000 : 0)

        // Poll every 15s (reduced from 5s to avoid overwhelming the container)
        const interval = setInterval(() => fetchAll(), 15000)

        return () => {
            clearTimeout(initialDelay)
            clearInterval(interval)
        }
    }, [fetchAll, isRunning])

    // Parse agent status intelligently
    const agentModel = typeof agentStatus === 'object' && agentStatus
        ? (agentStatus.model || agentStatus.defaultModel || agentStatus.active_model || '—')
        : '—'
    const agentState = typeof agentStatus === 'object' && agentStatus
        ? (agentStatus.state || agentStatus.status || (isRunning ? 'active' : 'stopped'))
        : (isRunning ? 'active' : 'stopped')

    // Parse health response
    const healthStatus = typeof health === 'object' && health
        ? (health.status || health.overall || (health.healthy === true ? 'healthy' : health.healthy === false ? 'unhealthy' : 'unknown'))
        : (typeof health === 'string' ? health : null)

    // Parse doctor checks
    const doctorChecks: { label: string; pass: boolean | null }[] = []
    if (doctor && typeof doctor === 'object') {
        if (Array.isArray(doctor)) {
            doctor.forEach((check: any) => {
                doctorChecks.push({
                    label: check.name || check.check || check.label || 'Check',
                    pass: check.pass ?? check.ok ?? (check.status === 'pass' ? true : null)
                })
            })
        } else if (doctor.checks && Array.isArray(doctor.checks)) {
            doctor.checks.forEach((check: any) => {
                doctorChecks.push({
                    label: check.name || check.check || 'Check',
                    pass: check.pass ?? check.ok ?? null
                })
            })
        } else {
            // Key-value format: { "config": true, "network": false }
            Object.entries(doctor).forEach(([key, val]) => {
                if (typeof val === 'boolean') {
                    doctorChecks.push({ label: key, pass: val })
                } else if (typeof val === 'string') {
                    doctorChecks.push({ label: key, pass: val === 'pass' || val === 'ok' })
                }
            })
        }
    }

    return (
        <div className="space-y-4">
            {/* Row 1: Status + Refresh */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <StatusDot status={project?.status || "stopped"} />
                    <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            {project?.name}
                            <Badge variant={isRunning ? "default" : "destructive"} className="text-[10px] uppercase">
                                {project?.status || "unknown"}
                            </Badge>
                        </h2>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Uptime: {formatUptime(project?.uptime || project?.startedAt)}</span>
                            <span>•</span>
                            <span>{project?.type || "openclaw"}</span>
                            {project?.containerId && (
                                <>
                                    <span>•</span>
                                    <span className="font-mono text-[10px]">{project.containerId.substring(0, 12)}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <Button
                    variant="ghost" size="sm"
                    onClick={() => fetchAll(true)}
                    disabled={refreshing}
                >
                    <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Row 2: Quick Stats */}
            {isRunning && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <QuickStatCard icon={Users} label="Sessions" value={loading ? "…" : quickStats.sessions} color="bg-blue-500/10 text-blue-500" />
                    <QuickStatCard icon={Wifi} label="Channels" value={loading ? "…" : quickStats.channels} color="bg-purple-500/10 text-purple-500" />
                    <QuickStatCard icon={Zap} label="Skills" value={loading ? "…" : quickStats.skills} color="bg-amber-500/10 text-amber-500" />
                    <QuickStatCard icon={MemoryStick} label="Memory" value={loading ? "…" : quickStats.memory} color="bg-pink-500/10 text-pink-500" />
                </div>
            )}

            {/* Row 3: Resource Gauges + Health + Agent */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Resources */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Activity className="h-4 w-4 text-muted-foreground" />
                            Container Resources
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!isRunning ? (
                            <div className="text-center py-6 text-sm text-muted-foreground">
                                <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                Container not running
                            </div>
                        ) : loading || !stats ? (
                            <div className="space-y-4">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : (
                            <>
                                <ResourceBar
                                    label="CPU"
                                    icon={Cpu}
                                    value={stats.cpu_percent || 0}
                                    unit="%"
                                    pct={stats.cpu_percent || 0}
                                />
                                <ResourceBar
                                    label="Memory"
                                    icon={HardDrive}
                                    value={stats.memory_usage_mb || 0}
                                    max={stats.memory_limit_mb}
                                    unit="MB"
                                    pct={stats.memory_percent || 0}
                                />
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Health & Diagnostics */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Heart className="h-4 w-4 text-muted-foreground" />
                            Health & Diagnostics
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!isRunning ? (
                            <div className="text-center py-6 text-sm text-muted-foreground">
                                <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                Container not running
                            </div>
                        ) : loading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Overall Health */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">Overall:</span>
                                    {healthStatus === 'healthy' || healthStatus === 'ok' ? (
                                        <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]">
                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Healthy
                                        </Badge>
                                    ) : healthStatus === 'unhealthy' || healthStatus === 'error' ? (
                                        <Badge className="bg-red-500/10 text-red-500 border-red-200 text-[10px]">
                                            <XCircle className="h-3 w-3 mr-1" /> Unhealthy
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px]">
                                            <AlertTriangle className="h-3 w-3 mr-1" /> {healthStatus || "N/A"}
                                        </Badge>
                                    )}
                                </div>

                                {/* Doctor Checks */}
                                {doctorChecks.length > 0 ? (
                                    <div className="space-y-1.5 border-t pt-2">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Diagnostics</span>
                                        {doctorChecks.map((c, i) => (
                                            <DiagnosticItem key={i} label={c.label} pass={c.pass} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground border-t pt-2">
                                        {health ? (
                                            <pre className="whitespace-pre-wrap text-[11px] font-mono bg-muted/50 rounded p-2 max-h-32 overflow-auto">
                                                {typeof health === 'string' ? health : JSON.stringify(health, null, 2)}
                                            </pre>
                                        ) : (
                                            "No diagnostic data available"
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Agent Status */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Bot className="h-4 w-4 text-muted-foreground" />
                            Agent Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!isRunning ? (
                            <div className="text-center py-6 text-sm text-muted-foreground">
                                <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                Container not running
                            </div>
                        ) : loading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-full" />
                                <Skeleton className="h-4 w-2/3" />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">State:</span>
                                    <Badge variant="outline" className={`text-[10px] uppercase ${agentState === 'active' || agentState === 'running'
                                        ? 'bg-green-500/10 text-green-600 border-green-200'
                                        : 'bg-orange-500/10 text-orange-600 border-orange-200'
                                        }`}>
                                        {agentState}
                                    </Badge>
                                </div>
                                <div>
                                    <span className="text-xs font-medium text-muted-foreground block mb-1">Model:</span>
                                    <span className="text-sm font-mono bg-muted/50 px-2 py-1 rounded block truncate">
                                        {agentModel}
                                    </span>
                                </div>

                                {/* Show raw agent status if it has more fields */}
                                {agentStatus && typeof agentStatus === 'object' && (
                                    <div className="border-t pt-2">
                                        {Object.entries(agentStatus)
                                            .filter(([k]) => !['model', 'defaultModel', 'active_model', 'state', 'status'].includes(k))
                                            .slice(0, 5)
                                            .map(([k, v]) => (
                                                <div key={k} className="flex justify-between text-xs py-0.5">
                                                    <span className="text-muted-foreground">{k}</span>
                                                    <span className="font-mono text-[11px] truncate max-w-[120px]">
                                                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Row 4: Live Logs */}
            <Card className="h-[400px] flex flex-col">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        Live Logs
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 bg-zinc-950 text-green-400 font-mono text-xs p-4 rounded-lg overflow-auto mx-4 mb-4">
                    <pre className="whitespace-pre-wrap">{logs || "Waiting for logs..."}</pre>
                </CardContent>
            </Card>
        </div>
    )
}
