import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth: admin only
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

  if (!id) {
    return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
  }

  // Delete via service role — kb_chunks will cascade delete automatically
  const adminSupabase = createServiceSupabase();
  const { error } = await adminSupabase
    .from('kb_documents')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[DELETE /api/kb/documents/[id]]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
