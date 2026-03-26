import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: { flagged?: boolean; flag_comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  const adminSupabase = createServiceSupabase();
  const { error } = await adminSupabase
    .from('kb_queries')
    .update({
      flagged:      body.flagged ?? true,
      flag_comment: body.flag_comment ?? null,
    })
    .eq('id', params.id);

  if (error) {
    console.error('[PATCH /api/kb/queries/[id]/flag]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
