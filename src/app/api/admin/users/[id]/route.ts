import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from '@/lib/auth/superAdmin';

export async function PATCH(
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
      { error: 'Only the super admin can change user permissions.' },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.can_delete_files !== 'boolean') {
    return NextResponse.json({ error: 'can_delete_files must be a boolean.' }, { status: 400 });
  }

  const adminSupabase = createServiceSupabase();

  const { data: target, error: lookupError } = await adminSupabase
    .from('profiles')
    .select('id, email')
    .eq('id', id)
    .single();

  if (lookupError || !target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (target.email?.toLowerCase() === SUPER_ADMIN_EMAIL && body.can_delete_files === false) {
    return NextResponse.json(
      { error: 'The super admin must keep delete permission.' },
      { status: 400 },
    );
  }

  const { data: updated, error: updateError } = await adminSupabase
    .from('profiles')
    .update({ can_delete_files: body.can_delete_files })
    .eq('id', id)
    .select('id, can_delete_files')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ profile: updated });
}
