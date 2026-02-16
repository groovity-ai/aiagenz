import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BACKEND_BASE = `${process.env.BACKEND_URL || 'http://localhost:4001'}/api/projects`;

// Helper to get token (Manual Auth)
async function getToken() {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    
    // Debug: Print all cookies
    console.log('[Debug] Cookies received:', cookieStore.getAll().map(c => c.name));
    if (!token) {
        console.log('[Debug] Token is missing!');
    } else {
        console.log('[Debug] Token found (len):', token.length);
    }
    
    return token;
}

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
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
