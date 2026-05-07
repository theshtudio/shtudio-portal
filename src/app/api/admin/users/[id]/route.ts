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
      { error: 'Only the super admin can modify users.' },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const hasCanDelete = typeof body.can_delete_files === 'boolean';
  const hasFullName = typeof body.full_name === 'string';
  const hasEmail = typeof body.email === 'string';

  if (!hasCanDelete && !hasFullName && !hasEmail) {
    return NextResponse.json(
      { error: 'Provide at least one of: full_name, email, can_delete_files.' },
      { status: 400 },
    );
  }

  const fullName = hasFullName ? (body.full_name as string).trim() : undefined;
  const email = hasEmail ? (body.email as string).trim().toLowerCase() : undefined;

  if (hasFullName && !fullName) {
    return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
  }
  if (hasEmail && (!email || !email.includes('@'))) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
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

  const targetIsSuperAdmin = target.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  if (targetIsSuperAdmin && hasCanDelete && body.can_delete_files === false) {
    return NextResponse.json(
      { error: 'The super admin must keep delete permission.' },
      { status: 400 },
    );
  }
  if (targetIsSuperAdmin && hasEmail && email !== target.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "The super admin's email cannot be changed here." },
      { status: 400 },
    );
  }

  if (hasEmail && email && email !== target.email?.toLowerCase()) {
    const { data: existing } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .neq('id', id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'Another user already uses that email.' },
        { status: 409 },
      );
    }

    const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
    });
    if (authUpdateError) {
      return NextResponse.json({ error: authUpdateError.message }, { status: 500 });
    }
  }

  const update: Record<string, unknown> = {};
  if (hasFullName) update.full_name = fullName;
  if (hasEmail) update.email = email;
  if (hasCanDelete) update.can_delete_files = body.can_delete_files;

  const { data: updated, error: updateError } = await adminSupabase
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ profile: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSuperAdmin(user.email)) {
    return NextResponse.json(
      { error: 'Only the super admin can remove users.' },
      { status: 403 },
    );
  }

  const { id } = await params;

  if (id === user.id) {
    return NextResponse.json(
      { error: 'You cannot remove your own account.' },
      { status: 400 },
    );
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

  if (target.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
    return NextResponse.json(
      { error: 'The super admin cannot be removed.' },
      { status: 400 },
    );
  }

  const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
