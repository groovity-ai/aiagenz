import { NextResponse } from 'next/server';
import { BACKEND_API } from '@/lib/api';

const BACKEND_BASE = `${BACKEND_API}/auth/login`;

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
