import { NextResponse } from "next/server"
import { BACKEND_API } from '@/lib/api';

export async function GET() {
    try {
        const res = await fetch(`${BACKEND_API}/plans`)
        const data = await res.json()
        return NextResponse.json(data)
    } catch (e) {
        console.error('GET /api/plans failed:', e);
        return NextResponse.json([], { status: 500 })
    }
}
