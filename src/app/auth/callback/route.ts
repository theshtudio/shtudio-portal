import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createServerSupabase();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Invite-only gate. A profile row exists only for users an admin invited (or
  // the super admin) — see the handle_new_user() trigger. Any other Google
  // account that reaches here self-registered into auth.users with no profile;
  // reject it and delete the orphaned auth user so it cannot accumulate or be
  // mistaken for an authorised account later.
  const admin = createServiceSupabase();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    await admin.auth.admin.deleteUser(user.id).catch(() => {
      // Best-effort cleanup; the gate already blocked access.
    });
    return NextResponse.redirect(`${origin}/login?error=not_authorised`);
  }

  // First successful sign-in promotes the invite from pending to active.
  if (profile.status === 'pending') {
    await admin
      .from('profiles')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', user.id);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
