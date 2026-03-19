import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id: clientId, fileId } = await params;

  // Auth check
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

  const adminSupabase = createServiceSupabase();

  // Get the file record first to find the storage path
  const { data: fileRecord, error: fetchError } = await adminSupabase
    .from('client_files')
    .select('*')
    .eq('id', fileId)
    .eq('client_id', clientId)
    .single();

  if (fetchError || !fileRecord) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Delete from storage
  const { error: storageError } = await adminSupabase.storage
    .from('client-files')
    .remove([fileRecord.file_path]);

  if (storageError) {
    console.error('Failed to delete file from storage:', storageError.message);
    // Continue with DB deletion even if storage fails
  }

  // Delete from database
  const { error: deleteError } = await adminSupabase
    .from('client_files')
    .delete()
    .eq('id', fileId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
