import { NextResponse } from 'next/server';
import { getToken } from '@/lib/auth';
import { BACKEND_API } from '@/lib/api';

const BACKEND_BASE = `${BACKEND_API}/projects`;

const ALLOWED_ACTIONS = ['start', 'stop', 'restart'] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { action } = await request.json();

        if (!ALLOWED_ACTIONS.includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const res = await fetch(`${BACKEND_BASE}/${id}/${action}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (e) {
        console.error('POST /api/projects/[id]/control failed:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
