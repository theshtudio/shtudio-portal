import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { client_id, title, period_start, period_end, report_type, ai_enhanced_html } = body;

  if (!client_id || !title || !ai_enhanced_html) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const adminSupabase = createServiceSupabase();

  const { data: report, error: insertError } = await adminSupabase
    .from('reports')
    .insert({
      client_id,
      title,
      period_start: period_start || null,
      period_end: period_end || null,
      report_type: report_type || 'pre-formatted',
      ai_enhanced_html,
      ai_status: 'completed',
      is_published: false,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ report });
}
