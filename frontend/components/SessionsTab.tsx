"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Trash2, MessageSquare, History } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SessionsTabProps {
    projectId: string
}

interface Session {
    id: string
    workspace?: string
    agent?: string
    turnCount?: number
    updatedAt?: string
    isArchived?: boolean
}

interface ToolCall {
    function?: {
        name?: string
    }
}

interface SessionHistoryMessage {
    role?: string
    content?: string
    tool_calls?: ToolCall[]
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (type === 'error') toast.error(message)
    else toast.success(message)
}

export function SessionsTab({ projectId }: SessionsTabProps) {
    const [sessions, setSessions] = useState<Session[]>([])
    const [loading, setLoading] = useState(false)

    const [historyOpen, setHistoryOpen] = useState(false)
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
    const [historyData, setHistoryData] = useState<SessionHistoryMessage[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    useEffect(() => {
        fetchSessions()
    }, [projectId])

    const fetchSessions = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/sessions`)
            if (res.ok) {
                const payload = await res.json()
                const list = Array.isArray(payload.data) ? payload.data : []
                setSessions(list)
            }
        } catch (e) {
            console.error('fetchSessions failed:', e)
            showToast('Failed to load sessions', 'error')
        }
        setLoading(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm(`Are you sure you want to delete session ${id}?`)) return
        try {
            const res = await fetch(`/api/projects/${projectId}/sessions/${id}`, { method: "DELETE" })
            if (res.ok) {
                showToast(`Session ${id} deleted`)
                fetchSessions()
            } else {
                const err = await res.json()
                showToast(err.error || "Failed to delete session", "error")
            }
        } catch (e) {
            showToast("Error deleting session", "error")
        }
    }

    const viewHistory = async (id: string) => {
        setActiveSessionId(id)
        setHistoryOpen(true)
        setLoadingHistory(true)
        setHistoryData([])
        try {
            const res = await fetch(`/api/projects/${projectId}/sessions/${id}/history`)
            if (res.ok) {
                const payload = await res.json()
                setHistoryData(Array.isArray(payload.data) ? payload.data : [])
            } else {
                showToast("Failed to load history", "error")
            }
        } catch (e) {
            showToast("Error loading history", "error")
        }
        setLoadingHistory(false)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle>Active Sessions</CardTitle>
                        <CardDescription>Manage your OpenClaw conversation sessions spanning multiple channels and workspaces.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading && sessions.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">Loading sessions...</div>
                    ) : sessions.length === 0 ? (
                        <div className="py-8 text-center border border-dashed rounded text-muted-foreground">
                            No active sessions found.
                        </div>
                    ) : (
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                            {sessions.map((s) => (
                                <Card key={s.id} className="overflow-hidden">
                                    <div className="p-4 flex flex-col h-full">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                                                <span className="font-mono text-sm font-semibold truncate max-w-[130px] sm:max-w-[150px]" title={s.id}>{s.id}</span>
                                            </div>
                                            {s.isArchived && <Badge variant="secondary" className="text-[10px]">Archived</Badge>}
                                        </div>

                                        <div className="space-y-1 mb-4 text-xs text-muted-foreground flex-1">
                                            <div className="flex justify-between">
                                                <span>Workspace:</span>
                                                <span className="text-foreground">{s.workspace || 'default'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Agent Role:</span>
                                                <span className="text-foreground">{s.agent || 'main'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Turns:</span>
                                                <span className="text-foreground">{s.turnCount || 0}</span>
                                            </div>
                                            {s.updatedAt && (
                                                <div className="flex justify-between mt-2 pt-2 border-t">
                                                    <span>Updated:</span>
                                                    <span>{new Date(s.updatedAt).toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 mt-auto">
                                            <Button variant="secondary" size="sm" className="w-full gap-1.5" onClick={() => viewHistory(s.id)}>
                                                <History className="h-3.5 w-3.5" /> History
                                            </Button>
                                            <Button variant="ghost" size="icon" className="shrink-0 text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => handleDelete(s.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="text-base sm:text-lg">Session History</DialogTitle>
                        <DialogDescription className="font-mono text-[10px] sm:text-xs truncate">{activeSessionId}</DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="flex-1 mt-4 border rounded-md p-3 sm:p-4 bg-muted/20 w-full overflow-x-auto">
                        {loadingHistory ? (
                            <div className="flex justify-center items-center h-32 text-xs sm:text-sm text-muted-foreground">Loading history...</div>
                        ) : historyData.length === 0 ? (
                            <div className="flex justify-center items-center h-32 text-xs sm:text-sm text-muted-foreground border-dashed border rounded">No history found for this session.</div>
                        ) : (
                            <div className="space-y-4">
                                {historyData.map((msg, idx) => (
                                    <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className="text-[9px] sm:text-[10px] text-muted-foreground mb-1 uppercase tracking-wider px-1">{msg.role}</div>
                                        <div className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg max-w-[90%] sm:max-w-[85%] text-xs sm:text-sm whitespace-pre-wrap break-words ${msg.role === 'user'
                                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                                            : msg.role === 'system'
                                                ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20'
                                                : 'bg-muted rounded-tl-none'
                                            }`}>
                                            {msg.content || (msg.tool_calls ? `[Tool Calls: ${msg.tool_calls.map((t: ToolCall) => t.function?.name).join(', ')}]` : '[Empty]')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    )
}
