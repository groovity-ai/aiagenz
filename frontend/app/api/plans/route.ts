import { NextResponse } from "next/server"

export async function GET() {
    try {
        const backendUrl = process.env.BACKEND_URL || "http://localhost:4001"
        const res = await fetch(`${backendUrl}/api/plans`)
        const data = await res.json()
        return NextResponse.json(data)
    } catch {
        return NextResponse.json([], { status: 500 })
    }
}
