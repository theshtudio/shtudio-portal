export const maxDuration = 300;

import { waitUntil }    from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { processDocument } from '@/lib/kb/process';

const STORAGE_BUCKET = 'kb-source-files';

// ── POST /api/kb/ingest ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth: admin only
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file       = formData.get('file') as File | null;
  const title      = (formData.get('title') as string | null)?.trim();
  const accessTier = (formData.get('access_tier') as string) || 'general';
  const category   = (formData.get('category') as string | null)?.trim() || null;

  // Validate
  if (!file)  return NextResponse.json({ error: 'No file provided' },    { status: 400 });
  if (!title) return NextResponse.json({ error: 'Title is required' },   { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['txt', 'md'].includes(ext ?? '')) {
    return NextResponse.json(
      { error: 'Only .txt and .md files are supported. PDF support is coming soon.' },
      { status: 400 },
    );
  }

  if (!['general', 'sensitive', 'admin'].includes(accessTier)) {
    return NextResponse.json({ error: 'Invalid access tier' }, { status: 400 });
  }

  let rawText: string;
  try {
    rawText = await file.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 400 });
  }

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'File appears to be empty' }, { status: 400 });
  }

  // Create the document record (service role to bypass RLS)
  const adminSupabase = createServiceSupabase();
  const { data: doc, error: dbError } = await adminSupabase
    .from('kb_documents')
    .insert({
      title,
      file_name:   file.name,
      file_type:   ext,
      access_tier: accessTier,
      category,
      status:      'processing',
      created_by:  user.id,
    })
    .select()
    .single();

  if (dbError || !doc) {
    console.error('KB_INGEST_CREATE_ERROR', dbError?.message);
    return NextResponse.json(
      { error: dbError?.message || 'Failed to create document record' },
      { status: 500 },
    );
  }

  // Save the source file to storage so it can be re-processed later.
  // Path: {docId}/{originalFileName}
  const storagePath = `${doc.id}/${file.name}`;
  const { error: storageError } = await adminSupabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, { contentType: 'text/plain', upsert: true });

  if (storageError) {
    // Non-fatal: log the warning but don't block ingestion.
    // The document can still be processed; it just won't be re-processable later.
    console.warn('KB_INGEST_STORAGE_WARN', { docId: doc.id, error: storageError.message });
  } else {
    // Record the path on the document row
    await adminSupabase
      .from('kb_documents')
      .update({ file_path: storagePath })
      .eq('id', doc.id);
  }

  // Fire-and-forget background processing via the shared helper
  waitUntil(processDocument(doc.id, rawText));

  return NextResponse.json({ success: true, documentId: doc.id, status: 'processing' });
}
