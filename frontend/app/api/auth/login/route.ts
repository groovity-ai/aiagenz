import { NextResponse } from 'next/server';

const BACKEND_BASE = `${process.env.BACKEND_URL || 'http://localhost:4001'}/api/auth/login`;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const res = await fetch(BACKEND_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
