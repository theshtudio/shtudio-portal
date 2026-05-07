import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from '@/lib/auth/superAdmin';
import { sendPasswordResetEmail } from '@/lib/email';

type AuditEntry = {
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, unknown>;
};

async function writeAudit(adminSupabase: SupabaseClient, entry: AuditEntry) {
  try {
    const { error } = await adminSupabase.from('audit_log').insert(entry);
    if (error) {
      console.error('[audit_log] insert failed:', entry.action, error.message);
    }
  } catch (err) {
    console.error('[audit_log] insert threw:', entry.action, err);
  }
}

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
    .select('id, email, full_name, can_delete_files')
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

  const beforeName = (target.full_name ?? '').trim();
  const beforeEmail = target.email?.toLowerCase() ?? '';
  const beforeCanDelete = target.can_delete_files;

  const nameChanged = hasFullName && fullName !== beforeName;
  const emailChanged = hasEmail && email !== beforeEmail;
  const canDeleteChanged = hasCanDelete && body.can_delete_files !== beforeCanDelete;

  let isPending = false;
  if (emailChanged) {
    const { data: existing } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('email', email!)
      .neq('id', id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'Another user already uses that email.' },
        { status: 409 },
      );
    }

    const { data: authResult, error: authLookupError } =
      await adminSupabase.auth.admin.getUserById(id);
    if (authLookupError) {
      return NextResponse.json({ error: authLookupError.message }, { status: 500 });
    }
    isPending = !authResult?.user?.last_sign_in_at;

    const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(id, {
      email: email!,
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

  // Best-effort: send a fresh password-setup link to the new address so the
  // pending user has a working path in. inviteUserByEmail errors when the
  // auth user already exists, so we use the recovery-link flow instead — it
  // works for never-signed-in users and lands them on /auth/set-password.
  let reinviteWarning: string | undefined;
  if (emailChanged && isPending) {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://portal.shtudio.com.au';
    const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/set-password`;
    try {
      const { data: linkData, error: linkError } =
        await adminSupabase.auth.admin.generateLink({
          type: 'recovery',
          email: email!,
          options: { redirectTo },
        });
      if (linkError || !linkData?.properties?.action_link) {
        throw new Error(linkError?.message ?? 'Failed to generate recovery link.');
      }
      const result = await sendPasswordResetEmail({
        to: email!,
        fullName: updated.full_name,
        actionLink: linkData.properties.action_link,
      });
      if (!result.sent) {
        reinviteWarning =
          'Email updated, but the new invite was not sent (RESEND_API_KEY missing). ' +
          'Use Resend Invite to retry.';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[invite] auto re-invite after email change failed:', message);
      reinviteWarning = `Email updated, but resending the invite failed: ${message}`;
    }
  }

  if (nameChanged) {
    await writeAudit(adminSupabase, {
      user_id: user.id,
      action: 'user.name_updated',
      resource_type: 'user',
      resource_id: id,
      metadata: { before: beforeName, after: fullName },
    });
  }
  if (emailChanged) {
    await writeAudit(adminSupabase, {
      user_id: user.id,
      action: 'user.email_updated',
      resource_type: 'user',
      resource_id: id,
      metadata: { before: beforeEmail, after: email, was_pending: isPending },
    });
  }
  if (canDeleteChanged) {
    await writeAudit(adminSupabase, {
      user_id: user.id,
      action: 'user.permission_updated',
      resource_type: 'user',
      resource_id: id,
      metadata: {
        field: 'can_delete_files',
        before: beforeCanDelete,
        after: body.can_delete_files,
      },
    });
  }

  return NextResponse.json({ profile: updated, warning: reinviteWarning });
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

  // Capture identity *before* deleteUser cascades the profile row.
  const { data: target, error: lookupError } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name')
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

  await writeAudit(adminSupabase, {
    user_id: user.id,
    action: 'user.deleted',
    resource_type: 'user',
    resource_id: id,
    metadata: {
      email: target.email,
      full_name: target.full_name,
    },
  });

  return NextResponse.json({ ok: true });
}
