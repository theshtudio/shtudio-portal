export const maxDuration = 300;

import { waitUntil }    from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { processDocument } from '@/lib/kb/process';

const STORAGE_BUCKET = 'kb-source-files';

// ── POST /api/kb/documents/[id]/reprocess ────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id: docId } = await params;

  // Fetch the document record (service role to bypass RLS)
  const adminSupabase = createServiceSupabase();
  const { data: doc, error: fetchError } = await adminSupabase
    .from('kb_documents')
    .select('id, title, file_path, file_name, access_tier, status')
    .eq('id', docId)
    .single();

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (!doc.file_path) {
    return NextResponse.json(
      { error: 'This document has no stored source file and cannot be re-processed. Please delete it and re-upload.' },
      { status: 400 },
    );
  }

  // Download the original source file from storage
  const { data: fileData, error: downloadError } = await adminSupabase.storage
    .from(STORAGE_BUCKET)
    .download(doc.file_path);

  if (downloadError || !fileData) {
    console.error('KB_REPROCESS_DOWNLOAD_ERROR', { docId, error: downloadError?.message });
    return NextResponse.json(
      { error: `Failed to download source file: ${downloadError?.message ?? 'unknown error'}` },
      { status: 500 },
    );
  }

  let rawText: string;
  try {
    rawText = await fileData.text();
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to read source file: ${err.message}` }, { status: 500 });
  }

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'Stored source file appears to be empty' }, { status: 400 });
  }

  // Reset the document to 'processing' state so the UI shows the progress bar
  const { error: resetError } = await adminSupabase
    .from('kb_documents')
    .update({ status: 'processing', chunk_count: null, error: null })
    .eq('id', docId);

  if (resetError) {
    return NextResponse.json({ error: `Failed to reset document status: ${resetError.message}` }, { status: 500 });
  }

  // Fire-and-forget: re-run the full pipeline (translate → chunk → embed → insert)
  waitUntil(processDocument(docId, rawText));

  return NextResponse.json({ success: true, documentId: docId, status: 'processing' });
}
