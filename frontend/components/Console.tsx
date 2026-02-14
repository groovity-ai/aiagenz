"use client"

import { useEffect, useRef } from "react"
import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit"
import { WebLinksAddon } from "xterm-addon-web-links"
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

    useEffect(() => {
        if (!terminalRef.current) return

        // Init Xterm
        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#09090b', // zinc-950 (Shadcn Dark)
                foreground: '#a1a1aa', // zinc-400
                cursor: '#ffffff'
            },
            fontFamily: 'monospace',
            fontSize: 14
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.loadAddon(new WebLinksAddon())

        term.open(terminalRef.current)
        fitAddon.fit()

        // Get JWT token for WebSocket authentication
        const token = getTokenFromCookies()
        if (!token) {
            term.write('\r\n\x1b[31m❌ Not authenticated. Please log in first.\x1b[0m\r\n')
            return
        }

        // Init WebSocket with JWT auth via query param
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.hostname}:4001/projects/${projectId}/console?token=${encodeURIComponent(token)}`

        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
            term.write('\r\n\x1b[32m🔌 Connected to Agent Container...\x1b[0m\r\n')
            term.write('\x1b[34mℹ️ Type commands to interact (e.g. "ls", "top")\x1b[0m\r\n\r\n')
        }

        ws.onmessage = (event) => {
            term.write(event.data)
        }

        ws.onerror = () => {
            term.write('\r\n\x1b[31m❌ Connection Error\x1b[0m\r\n')
        }

        ws.onclose = () => {
            term.write('\r\n\x1b[33m🔌 Connection Closed\x1b[0m\r\n')
        }

        // Terminal Input -> WebSocket
        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data)
            }
        })

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit()
        })
        resizeObserver.observe(terminalRef.current)

        return () => {
            ws.close()
            term.dispose()
            resizeObserver.disconnect()
        }
    }, [projectId])

    return (
        <div className="h-[500px] w-full bg-zinc-950 rounded-lg border border-slate-800 p-2 overflow-hidden">
            <div ref={terminalRef} className="h-full w-full" />
        </div>
    )
}
