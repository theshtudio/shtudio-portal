export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

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
  const clientId = formData.get('clientId') as string | null;
  const files = formData.getAll('files') as File[];

  // Backwards compat: also check for single 'file' field
  const singleFile = formData.get('file') as File | null;
  if (singleFile && files.length === 0) {
    files.push(singleFile);
  }

  if (files.length === 0 || !clientId) {
    return NextResponse.json({ error: 'Missing files or clientId' }, { status: 400 });
  }

  // Validate file types
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.name}. Accepted: PDF, Word, Excel.` },
        { status: 400 },
      );
    }
  }

  const adminSupabase = createServiceSupabase();
  const filePaths: string[] = [];

  for (const file of files) {
    const safeName = file.name
      .replace(/'/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
    const filePath = `${clientId}/${Date.now()}-${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminSupabase.storage
      .from('report-pdfs')
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    filePaths.push(filePath);
  }

  // Return both for backwards compatibility
  return NextResponse.json({
    filePath: filePaths[0],
    filePaths,
  });
}
