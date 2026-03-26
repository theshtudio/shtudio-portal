import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function GET() {
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

  // ── Query ──────────────────────────────────────────────────────────────────
  const adminSupabase = createServiceSupabase();
  const { data, error } = await adminSupabase
    .from('kb_queries')
    .select('id, question, answer, flag_comment, created_at')
    .eq('flagged', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/kb/queries/flagged]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ queries: data ?? [] });
}
