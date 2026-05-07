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

  const origin = request.headers.get('origin') ?? new URL(request.url).origin;
  const redirectTo = `${origin}/auth/callback?next=/auth/set-password`;

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

  return NextResponse.json({ user: data.user });
}
