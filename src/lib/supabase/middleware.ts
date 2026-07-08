import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Public routes that don't need auth.
  // /auth/set-password is reached from email invite links where the session is
  // delivered in the URL hash and only materialises in the browser, so the
  // server-side middleware can't see a cookie on first load.
  // /api/telegram is called by Telegram's servers with no session cookie; it
  // authenticates via the x-telegram-bot-api-secret-token header in the route
  // itself, so it must bypass the login redirect (Telegram won't follow it).
  const publicRoutes = ['/login', '/auth/callback', '/auth/set-password', '/share', '/api/telegram'];
  // The report PDF endpoint backs the Download button on the public /share
  // page, so anonymous visitors must reach it without a login redirect. The
  // route handler itself only serves *published* reports to anonymous callers
  // (drafts stay admin/owner-only), mirroring the share page's own access.
  const isPublicReportPdf = /^\/api\/reports\/[^/]+\/pdf$/.test(pathname);
  const isPublic = isPublicReportPdf || publicRoutes.some(r => pathname.startsWith(r));

  // Not logged in? Redirect to login (unless already on public route)
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logged in on login page? Redirect to their home
  if (user && pathname === '/login') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const url = request.nextUrl.clone();
    url.pathname = profile?.role === 'admin' ? '/admin' : '/dashboard';
    return NextResponse.redirect(url);
  }

  // Role-based routing enforcement
  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/dashboard'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single();

    // Promote the invite to active on first authenticated load. The OAuth
    // callback already does this for Google sign-ins; this covers email/password
    // users, who reach the app via /auth/set-password instead. One-time: once
    // active, the condition never fires again.
    if (profile?.status === 'pending') {
      await supabase
        .from('profiles')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    if (profile) {
      // Admins trying to access /dashboard → /admin
      if (profile.role === 'admin' && pathname.startsWith('/dashboard')) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin';
        return NextResponse.redirect(url);
      }
      // Clients trying to access /admin → /dashboard
      if (profile.role === 'client' && pathname.startsWith('/admin')) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
    }
  }

  // Root redirect
  if (user && pathname === '/') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const url = request.nextUrl.clone();
    url.pathname = profile?.role === 'admin' ? '/admin' : '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
