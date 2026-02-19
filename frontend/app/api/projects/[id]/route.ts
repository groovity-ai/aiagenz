import { NextResponse } from 'next/server';
import { getToken } from '@/lib/auth';
import { BACKEND_API } from '@/lib/api';

const BACKEND_BASE = `${BACKEND_API}/projects`;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const res = await fetch(`${BACKEND_BASE}/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            console.error(`Backend fetch failed: ${res.status} ${res.statusText}`);
            return NextResponse.json({ error: 'Backend Error' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (e) {
        console.error('Proxy Error:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_BASE}/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (e) {
        console.error('PUT /api/projects/[id] failed:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const res = await fetch(`${BACKEND_BASE}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (e) {
        console.error('DELETE /api/projects/[id] failed:', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
