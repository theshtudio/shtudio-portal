import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    // Auth: must be a logged-in admin
    const supabase = await createServerSupabase();

    let user;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      user = data.user;
    } catch (err) {
      console.error('[GET /api/kb/documents] auth.getUser failed:', err);
      return NextResponse.json({ error: 'Auth error' }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let profile;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      profile = data;
    } catch (err) {
      console.error('[GET /api/kb/documents] profiles fetch failed:', err);
      return NextResponse.json({ error: 'Profile fetch error' }, { status: 500 });
    }

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch document list with service role to bypass RLS
    const adminSupabase = createServiceSupabase();

    let documents;
    try {
      const { data, error } = await adminSupabase
        .from('kb_documents')
        .select('id, title, file_name, file_path, access_tier, category, status, chunk_count, error, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      documents = data;
    } catch (err) {
      console.error('[GET /api/kb/documents] kb_documents fetch failed:', err);
      return NextResponse.json({ error: 'DB fetch error' }, { status: 500 });
    }

    return NextResponse.json({ documents: documents ?? [] });

  } catch (err) {
    console.error('[GET /api/kb/documents] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
