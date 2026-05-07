import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/superAdmin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSuperAdmin(user.email)) {
    return NextResponse.json(
      { error: 'Only the super admin can resend invitations.' },
      { status: 403 },
    );
  }

  const { id } = await params;
  const adminSupabase = createServiceSupabase();

  const { data: target, error: lookupError } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', id)
    .single();

  if (lookupError || !target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const { data: authResult, error: authLookupError } =
    await adminSupabase.auth.admin.getUserById(id);
  if (authLookupError) {
    return NextResponse.json({ error: authLookupError.message }, { status: 500 });
  }
  if (authResult?.user?.last_sign_in_at) {
    return NextResponse.json(
      { error: 'This user has already accepted their invite.' },
      { status: 400 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://portal.shtudio.com.au';
  const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/set-password`;

  const { error } = await adminSupabase.auth.admin.inviteUserByEmail(target.email, {
    data: {
      full_name: target.full_name ?? '',
      role: 'admin',
      can_delete_files: false,
      invited_by: user.id,
    },
    redirectTo,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
