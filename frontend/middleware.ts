import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Middleware to handle Auth & Proxy Headers
export function middleware(req: NextRequest) {
  const token = req.cookies.get('token')?.value

  // 1. For API Routes: Inject Authorization header from cookie if missing
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const requestHeaders = new Headers(req.headers)
    if (token && !requestHeaders.get('Authorization')) {
      requestHeaders.set('Authorization', `Bearer ${token}`)
    }
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  // 2. Protect Dashboard
  if (!token && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 3. Redirect Auth User
  if (token && (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register', '/api/:path*'],
}
