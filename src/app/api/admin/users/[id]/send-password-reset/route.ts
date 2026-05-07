import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/superAdmin';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(
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
      { error: 'Only the super admin can send password resets.' },
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

  if (lookupError || !target?.email) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://portal.shtudio.com.au';
  const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/set-password`;

  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json(
      { error: linkError?.message ?? 'Failed to generate recovery link.' },
      { status: 500 },
    );
  }

  try {
    const result = await sendPasswordResetEmail({
      to: target.email,
      fullName: target.full_name,
      actionLink: linkData.properties.action_link,
    });
    if (!result.sent) {
      return NextResponse.json(
        { error: 'Email service is not configured (RESEND_API_KEY missing).' },
        { status: 500 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send email.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
