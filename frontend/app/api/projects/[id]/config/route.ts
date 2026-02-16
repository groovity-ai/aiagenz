import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BACKEND_BASE = `${process.env.BACKEND_URL || 'http://aiagenz-backend:4001'}/api/projects`;

async function getToken() {
    const cookieStore = await cookies();
    return cookieStore.get('token')?.value;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const res = await fetch(`${BACKEND_BASE}/${id}/config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch config' }, { status: res.status });
        }
        
        const data = await res.json();
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const token = await getToken();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_BASE}/${id}/config`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to update config' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
