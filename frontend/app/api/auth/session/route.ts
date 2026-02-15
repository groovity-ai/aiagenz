import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token } = await request.json()
  
  const response = NextResponse.json({ success: true })
  response.cookies.set('token', token, { 
    httpOnly: false, // Allow client JS (WebSocket) to read token
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  })
  
  return response
}
