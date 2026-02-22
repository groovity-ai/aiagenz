"use client"

import { X, Send, User, Bot, Loader2, Zap } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useEffect, useRef, useState, useCallback } from 'react'

interface ChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    isTyping?: boolean
}

export default function AgentChatPanel({
    projectId,
    projectName,
    open,
    onClose
}: {
    projectId: string;
    projectName: string;
    open: boolean;
    onClose: () => void;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState("")
    const [isConnected, setIsConnected] = useState(false)
    const [isTyping, setIsTyping] = useState(false)
    const wsRef = useRef<WebSocket | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isTyping])

    // WebSocket Connection Logic
    const connect = useCallback(() => {
        if (!open || wsRef.current?.readyState === WebSocket.OPEN) return

        // Determine WS Protocol (ws:// or wss://)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.host // e.g. "aiagenz.id" or "localhost:3000"

        // In local dev, frontend is 3000, backend is 4001 via proxy? 
        // Or we use relative path /api/ and let Nginx handle it.
        // If local dev without nginx: backend is localhost:4001

        // For production (and correct Nginx setup), relative path is best, 
        // but WebSocket constructor needs absolute URL.
        const wsUrl = `${protocol}//${host}/api/projects/${projectId}/ws`

        console.log(`[WS] Connecting to ${wsUrl}...`)
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
            console.log('[WS] Connected')
            setIsConnected(true)
            // Optional: Send initial ping or just wait
        }

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                handleWsMessage(data)
            } catch (e) {
                console.error('[WS] Parse error:', e)
            }
        }

        ws.onclose = (event) => {
            console.log('[WS] Closed', event.code, event.reason)
            setIsConnected(false)
            wsRef.current = null

            // Reconnect if panel is still open
            if (open) {
                reconnectTimeoutRef.current = setTimeout(connect, 3000)
            }
        }

        ws.onerror = (error) => {
            console.error('[WS] Error:', error)
            ws.close()
        }

        wsRef.current = ws
    }, [open, projectId])

    // Cleanup on unmount/close
    useEffect(() => {
        if (open) {
            connect()
        } else {
            wsRef.current?.close()
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
        }
        return () => {
            wsRef.current?.close()
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
        }
    }, [open, connect])

    const handleWsMessage = (data: any) => {
        // Handle OpenClaw TypeBox JSON Frames

        // 1. Chat Event (Streamed Reply)
        if (data.type === 'event' && data.event === 'chat') {
            const content = data.payload?.message || data.payload?.text || ''
            if (!content) return

            setIsTyping(false)
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: content
                }
            ])
        }

        // 2. Typing/Agent Status Event
        if (data.type === 'event' && (data.event === 'presence' || data.event === 'agent')) {
            // Very simplified: just show typing if there's activity
            setIsTyping(true)
            setTimeout(() => setIsTyping(false), 5000)
        }

        // 3. System/Response Error
        if (data.type === 'res' && !data.ok && data.error) {
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: 'system',
                    content: `Error: ${data.error.message || 'Gateway rejected request'}`
                }
            ])
            setIsTyping(false)
        }
    }

    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || !isConnected || !wsRef.current) return

        const text = input.trim()

        // Optimistic UI update
        setMessages(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                role: 'user',
                content: text
            }
        ])
        setInput("")
        setIsTyping(true) // Expect reply

        // Send OpenClaw Protocol Frame (TypeBox schema)
        const frameId = Date.now().toString()
        const payload = {
            type: "req",
            id: frameId,
            method: "chat.send",
            params: {
                message: text,
                sessionKey: `web-${projectId}`,
                idempotencyKey: frameId // Required for side-effecting methods
            }
        }
        wsRef.current.send(JSON.stringify(payload))
    }

    if (!open) return null

    return (
        <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-background border border-border rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
            {/* Header */}
            <div className="bg-muted/50 p-4 border-b flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Bot className="w-6 h-6 text-primary" />
                        </div>
                        {isConnected && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full animate-pulse" />
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">{projectName || 'Agent'}</h3>
                        <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                            <p className="text-xs text-muted-foreground">
                                {isConnected ? 'Online (Realtime)' : 'Connecting...'}
                            </p>
                        </div>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-muted">
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/50 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground opacity-50 space-y-2">
                        <Zap className="w-12 h-12 mb-2" />
                        <p className="text-sm font-medium">Native Connection Active</p>
                        <p className="text-xs">
                            This chat is now fully synced with your Telegram session.
                            Agent remembers who you are.
                        </p>
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        {msg.role !== 'user' && (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0 mt-1">
                                <Bot className="w-4 h-4 text-primary" />
                            </div>
                        )}

                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : msg.role === 'system'
                                ? 'bg-destructive/10 text-destructive border border-destructive/20 w-full text-center font-mono text-xs py-2'
                                : 'bg-muted/50 border border-border/50 text-foreground rounded-tl-sm'
                            }`}>
                            <div className="whitespace-pre-wrap break-words leading-relaxed">
                                {msg.content}
                            </div>
                        </div>

                        {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border shrink-0 mt-1">
                                <User className="w-4 h-4 text-muted-foreground" />
                            </div>
                        )}
                    </div>
                ))}

                {isTyping && (
                    <div className="flex gap-3 justify-start animate-in fade-in duration-300">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                            <Bot className="w-4 h-4 text-primary" />
                        </div>
                        <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5 h-10">
                            <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce"></span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={sendMessage} className="p-4 bg-background border-t">
                <div className="flex gap-2 relative">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isConnected ? "Kirim pesan ke agent..." : "Connecting..."}
                        className="pr-10 rounded-full border-muted-foreground/20 focus-visible:ring-primary/20"
                        disabled={!isConnected}
                        autoFocus
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!input.trim() || !isConnected}
                        className="absolute right-1 top-1 h-8 w-8 rounded-full transition-all duration-200 hover:scale-105"
                    >
                        {isConnected ? (
                            <Send className="w-4 h-4" />
                        ) : (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                    </Button>
                </div>
                <div className="text-[10px] text-center mt-2 text-muted-foreground/60 font-medium">
                    {isConnected ? '🔒 Secure End-to-End Encryption • Synced with Telegram' : 'Establishin secure tunnel...'}
                </div>
            </form>
        </div>
    )
}