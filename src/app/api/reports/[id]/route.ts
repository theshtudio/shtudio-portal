import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

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
