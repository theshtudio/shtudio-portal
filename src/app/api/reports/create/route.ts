import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  // Verify the user is authenticated and is an admin
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
  const { client_id, title, period_start, period_end, pdf_storage_path, pdf_storage_paths, custom_instructions, client_file_ids, report_type, report_options } = body;

  if (!client_id || !title || !pdf_storage_path) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Use service role client to bypass RLS
  const adminSupabase = createServiceSupabase();

  const { data: report, error: insertError } = await adminSupabase
    .from('reports')
    .insert({
      client_id,
      title,
      period_start: period_start || null,
      period_end: period_end || null,
      pdf_storage_path,
      pdf_storage_paths: pdf_storage_paths || null,
      custom_instructions: custom_instructions || null,
      client_file_ids: client_file_ids || null,
      report_type: report_type || null,
      report_options: report_options || null,
      ai_status: 'pending',
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ report });
}
