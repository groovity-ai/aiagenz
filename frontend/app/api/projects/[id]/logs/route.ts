import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BACKEND_BASE = 'http://localhost:4001/api/projects';

async function getToken() {
    const cookieStore = await cookies();
    return cookieStore.get('token')?.value;
}

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
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
