"use client"

import { useChat } from 'ai/react'
import { X, Send, User, Bot, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { useEffect, useRef } from 'react'

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
    // The Vercel AI SDK useChat hook automatically handles the SSE streaming, message history, and input state
    const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
        api: `/api/projects/${projectId}/chat`,
        id: projectId // Scope the chat history strictly to this project
    })

    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to the newest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    if (!open) return null

    return (
        <>
            {/* Backdrop overlay for focus */}
            <div
                className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Sliding Chat Drawer */}
            <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border/50 bg-card shadow-2xl transition-transform duration-300 ease-in-out sm:w-[400px]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">{projectName}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Direct Connect</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-muted">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground space-y-4">
                            <div className="h-16 w-16 rounded-full bg-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                                <Bot className="h-8 w-8 text-primary" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">Start a conversation.</p>
                                <p className="text-xs">The AI agent is listening to its container stream.</p>
                            </div>
                        </div>
                    ) : (
                        messages.map((m: any) => (
                            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-border/50 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/30'}`}>
                                    {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                </div>
                                <div className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%]`}>
                                    <div className={`rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user'
                                        ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-sm'
                                        : 'bg-muted/30 text-foreground rounded-tl-sm border border-border/50 shadow-sm'
                                        }`}>
                                        <span className="whitespace-pre-wrap leading-relaxed">{m.content}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    {isLoading && (
                        <div className="flex gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/30 ring-1 ring-border/50">
                                <Bot className="h-4 w-4" />
                            </div>
                            <div className="flex items-center rounded-2xl bg-muted/30 px-4 py-3 text-sm rounded-tl-sm border border-border/50">
                                <span className="flex gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </span>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="text-center text-xs text-destructive rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                            <strong>Connection Error</strong><br />
                            {error.message}. Is the container running?
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t border-border/50 p-4 bg-background/50 backdrop-blur-md">
                    <form onSubmit={handleSubmit} className="relative flex items-center">
                        <input
                            className="w-full rounded-full border border-border/50 bg-background px-5 py-3.5 pr-14 text-sm shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                            value={input}
                            onChange={handleInputChange}
                            placeholder="Message your agent..."
                            disabled={isLoading}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={isLoading || !input.trim()}
                            className="absolute right-1.5 h-9 w-9 rounded-full shadow-sm"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </form>
                </div>
            </div>
        </>
    )
}
