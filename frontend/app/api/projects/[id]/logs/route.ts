import { NextResponse } from 'next/server';
import { getToken } from '@/lib/auth';
import { BACKEND_API } from '@/lib/api';

const BACKEND_BASE = `${BACKEND_API}/projects`;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const res = await fetch(`${BACKEND_BASE}/${id}/logs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const text = await res.text();
        return new NextResponse(text);
    } catch (e) {
        console.error('GET /api/projects/[id]/logs failed:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
