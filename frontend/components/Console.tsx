"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import "xterm/css/xterm.css"

interface ConsoleProps {
    projectId: string
}

// Helper to get JWT token from cookies (client-side)
function getTokenFromCookies(): string | null {
    const match = document.cookie.match(/(?:^|;\s*)token=([^;]*)/)
    return match ? decodeURIComponent(match[1]) : null
}

export default function Console({ projectId }: ConsoleProps) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const termRef = useRef<any>(null)
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState(false)

    const connectWs = useCallback(async () => {
        if (!terminalRef.current) return

        // Clean up previous terminal
        if (termRef.current) {
            termRef.current.dispose()
            termRef.current = null
        }
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }

        setError(false)
        setConnected(false)

        const { Terminal } = await import("xterm")
        const { FitAddon } = await import("xterm-addon-fit")
        const { WebLinksAddon } = await import("xterm-addon-web-links")

        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#09090b',
                foreground: '#a1a1aa',
                cursor: '#ffffff'
            },
            fontFamily: 'monospace',
            fontSize: 14
        })
        termRef.current = term

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.loadAddon(new WebLinksAddon())

        if (terminalRef.current) {
            term.open(terminalRef.current)
            fitAddon.fit()
        }

        // Get JWT token for WebSocket authentication
        const token = getTokenFromCookies()
        if (!token) {
            term.write('\r\n\x1b[31m❌ Not authenticated. Please log in first.\x1b[0m\r\n')
            setError(true)
            return
        }

        // Build WebSocket URL — through Nginx /ws/ proxy (same host, same port)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/ws/projects/${projectId}/console?token=${encodeURIComponent(token)}`

        term.write(`\x1b[90mConnecting to ${window.location.host}...\x1b[0m\r\n`)

        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        // Keepalive ping every 30s to prevent idle timeout
        let pingInterval: NodeJS.Timeout | null = null

        ws.onopen = () => {
            setConnected(true)
            setError(false)
            term.write('\r\n\x1b[32m🔌 Connected to Agent Container...\x1b[0m\r\n')
            term.write('\x1b[34mℹ️ Type commands to interact (e.g. "ls", "top")\x1b[0m\r\n\r\n')

            // Keepalive: send empty ping periodically
            pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send('')
                }
            }, 30000)
        }

        ws.onmessage = (event: MessageEvent) => {
            term.write(event.data)
        }

        ws.onerror = () => {
            setError(true)
            setConnected(false)
            term.write('\r\n\x1b[31m❌ Connection Error — backend may not be reachable.\x1b[0m\r\n')
            term.write('\x1b[90mMake sure the backend is running and port is accessible.\x1b[0m\r\n')
        }

        ws.onclose = () => {
            setConnected(false)
            if (pingInterval) clearInterval(pingInterval)
            term.write('\r\n\x1b[33m🔌 Connection Closed\x1b[0m\r\n')
            term.write('\x1b[90mClick "Reconnect" to try again.\x1b[0m\r\n')
        }

        // Terminal Input -> WebSocket
        term.onData((data: string) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(data)
            }
        })

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit()
        })
        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current)
        }
    }, [projectId])

    useEffect(() => {
        connectWs()

        return () => {
            if (wsRef.current) wsRef.current.close()
            if (termRef.current) termRef.current.dispose()
        }
    }, [connectWs])

    return (
        <div className="relative">
            {!connected && (
                <div className="absolute top-2 right-2 z-10">
                    <button
                        onClick={connectWs}
                        className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                    >
                        🔄 Reconnect
                    </button>
                </div>
            )}
            <div className="h-[500px] w-full bg-zinc-950 rounded-lg border border-slate-800 p-2 overflow-hidden">
                <div ref={terminalRef} className="h-full w-full" />
            </div>
        </div>
    )
}
