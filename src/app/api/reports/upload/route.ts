export const maxDuration = 60;

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

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const clientId = formData.get('clientId') as string | null;

  if (!file || !clientId) {
    return NextResponse.json({ error: 'Missing file or clientId' }, { status: 400 });
  }

  // Sanitize filename
  const safeName = file.name
    .replace(/'/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  const filePath = `${clientId}/${Date.now()}-${safeName}`;

  // Upload using service role client to bypass storage RLS
  const adminSupabase = createServiceSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await adminSupabase.storage
    .from('report-pdfs')
    .upload(filePath, buffer, {
      contentType: file.type || 'application/pdf',
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({ filePath });
}
