import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/superAdmin';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSuperAdmin(user.email)) {
    return NextResponse.json(
      { error: 'Only the super admin can invite team members.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }

  const adminSupabase = createServiceSupabase();

  const { data: existing } = await adminSupabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'A user with that email already exists in the portal.' },
      { status: 409 },
    );
  }

  // Send invited users straight to /auth/set-password. The Supabase invite link
  // uses the implicit (hash-token) flow, so /auth/callback (which expects a ?code
  // query param) cannot consume it and ends up rendering blank or erroring.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://portal.shtudio.com.au';
  const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/set-password`;

  const { data, error } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role: 'admin',
      can_delete_files: false,
      invited_by: user.id,
    },
    redirectTo,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Defensive backfill: the handle_new_user() trigger should have created the
  // profile row with role='admin' and can_delete_files=false from the metadata
  // above, but if the trigger didn't run or used the default role we upsert
  // the canonical values here so the team list shows the new admin straight away.
  if (data.user) {
    await adminSupabase
      .from('profiles')
      .upsert(
        {
          id: data.user.id,
          email,
          full_name: fullName,
          role: 'admin',
          can_delete_files: false,
          invited_by: user.id,
          invited_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
  }

  return NextResponse.json({ user: data.user });
}
