import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export async function POST(request: Request) {
  const { token } = await request.json()

  // Detect if running behind HTTPS (Cloudflare/Nginx sets X-Forwarded-Proto)
  const headersList = await headers()
  const proto = headersList.get('x-forwarded-proto') || 'http'
  const isSecure = proto === 'https'

  const response = NextResponse.json({ success: true })
  response.cookies.set('token', token, {
    httpOnly: false, // Allow client JS (WebSocket) to read token
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: isSecure,
    sameSite: 'lax'
  })

  return response
}
