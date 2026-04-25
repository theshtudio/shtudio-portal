import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// ── PATCH: update report fields (dismiss mismatch, reassign client) ──
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const body = await request.json();

  const adminSupabase = createServiceSupabase();

  // Build the update object — only allow specific fields
  const updates: Record<string, any> = {};

  if (body.dismiss_mismatch) {
    updates.client_mismatch = false;
    updates.detected_client_name = null;
  }

  if (body.client_id) {
    updates.client_id = body.client_id;
    updates.client_mismatch = false;
    updates.detected_client_name = null;
  }

  if (typeof body.title === 'string' && body.title.trim()) {
    updates.title = body.title.trim();
  }

  if (typeof body.report_type !== 'undefined') {
    updates.report_type = body.report_type;
  }

  if (typeof body.period_start !== 'undefined') {
    updates.period_start = body.period_start;
  }

  if (typeof body.period_end !== 'undefined') {
    updates.period_end = body.period_end;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error: updateError } = await adminSupabase
    .from('reports')
    .update(updates)
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createServiceSupabase();

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role, can_delete_files')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin' || !profile.can_delete_files) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  // Get the report first so we can delete storage and write a rich audit log
  const { data: report, error: fetchError } = await adminSupabase
    .from('reports')
    .select('id, title, pdf_storage_path, pdf_storage_paths, client_id')
    .eq('id', id)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // Delete all PDFs from storage
  const pathsToDelete = [
    ...(report.pdf_storage_path ? [report.pdf_storage_path] : []),
    ...(report.pdf_storage_paths ?? []),
  ].filter((p, i, arr) => arr.indexOf(p) === i); // deduplicate

  if (pathsToDelete.length > 0) {
    await adminSupabase.storage.from('report-pdfs').remove(pathsToDelete);
  }

  // Delete the report record
  const { error: deleteError } = await adminSupabase
    .from('reports')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Audit log
  await adminSupabase.from('audit_log').insert({
    user_id: user.id,
    action: 'delete_report',
    resource_type: 'report',
    resource_id: id,
    metadata: {
      title: report.title,
      client_id: report.client_id,
    },
  });

  return NextResponse.json({ success: true });
}
