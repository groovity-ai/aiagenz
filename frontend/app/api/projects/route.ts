import { NextResponse } from 'next/server';
import { getToken } from '@/lib/auth';
import { BACKEND_API } from '@/lib/api';

const BACKEND_BASE = `${BACKEND_API}/projects`;

export async function GET(request: Request) {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const url = queryString ? `${BACKEND_BASE}?${queryString}` : BACKEND_BASE;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (e) {
        console.error('GET /api/projects failed:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const res = await fetch(BACKEND_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('POST /api/projects failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
