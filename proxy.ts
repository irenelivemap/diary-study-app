/**
 * Next.js proxy middleware that runs before matching routes and protects route access where needed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/app/lib/session'

const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password']
const publicPrefixes = ['/join/']

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isPublic = publicRoutes.includes(path) || publicPrefixes.some((prefix) => path.startsWith(prefix))

  const cookie = req.cookies.get('session')?.value
  const session = await decrypt(cookie)

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  if (session && publicRoutes.includes(path)) {
    return NextResponse.redirect(
      new URL(session.role === 'ADMIN' ? '/admin' : '/dashboard', req.nextUrl)
    )
  }

  if (session && path.startsWith('/admin') && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
