import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isCrmRoute = request.nextUrl.pathname.startsWith('/crm')
  const isPortalRoute = request.nextUrl.pathname.startsWith('/portal')
  const isAuthRoute = request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup'

  // Redirect to login if unauthenticated user tries to access /crm
  if ((isCrmRoute || isPortalRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect to dashboard if authenticated user tries to access login/signup
  let authenticatedHome = '/crm/dashboard'
  if (user && (isAuthRoute || request.nextUrl.pathname === '/')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,customer_id')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (profile?.role === 'customer_admin' && profile.customer_id) authenticatedHome = '/portal/dashboard'
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    url.pathname = authenticatedHome
    return NextResponse.redirect(url)
  }

  // Also redirect root to /crm/dashboard
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? authenticatedHome : '/login'
    return NextResponse.redirect(url)
  }

  if (
    request.nextUrl.pathname.startsWith('/driver-activation/') ||
    request.nextUrl.pathname === '/reset-password' ||
    isPortalRoute
  ) {
    supabaseResponse.headers.set('Cache-Control', 'private, no-store, max-age=0')
    supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    if (!isPortalRoute) supabaseResponse.headers.set('Referrer-Policy', 'no-referrer')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
