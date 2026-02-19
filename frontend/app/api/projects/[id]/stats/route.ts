import { NextResponse } from 'next/server';
import { getToken } from '@/lib/auth';
import { BACKEND_API } from '@/lib/api';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const res = await fetch(`${BACKEND_API}/projects/${id}/stats`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (e) {
        console.error('GET /api/projects/[id]/stats failed:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
