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

  const { id } = await params;

  // Use service role client to bypass RLS
  const adminSupabase = createServiceSupabase();

  // Get the report first so we can delete the PDF from storage
  const { data: report, error: fetchError } = await adminSupabase
    .from('reports')
    .select('id, pdf_storage_path, client_id')
    .eq('id', id)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // Delete the PDF from Supabase Storage if it exists
  if (report.pdf_storage_path) {
    await adminSupabase.storage
      .from('report-pdfs')
      .remove([report.pdf_storage_path]);
  }

  // Delete the report record from the database
  const { error: deleteError } = await adminSupabase
    .from('reports')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Log the action
  await adminSupabase.from('audit_log').insert({
    user_id: user.id,
    action: 'report.deleted',
    resource_type: 'report',
    resource_id: id,
    metadata: {
      client_id: report.client_id,
      pdf_storage_path: report.pdf_storage_path,
    },
  });

  return NextResponse.json({ success: true });
}
