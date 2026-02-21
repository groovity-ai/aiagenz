import { NextResponse } from 'next/server';
import { getToken } from '@/lib/auth';
import { BACKEND_API } from '@/lib/api';

const BACKEND_BASE = `${BACKEND_API}/models/sync`;

export async function POST(request: Request) {
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const res = await fetch(BACKEND_BASE, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            console.error(`Backend fetch failed: ${res.status} ${res.statusText}`);
            return NextResponse.json({ error: 'Backend Error' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (e) {
        console.error('POST /api/models/sync failed:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
