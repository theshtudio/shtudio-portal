export const maxDuration = 300;

import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { chunkText } from '@/lib/kb/chunk';
import { embedBatch, formatVector } from '@/lib/kb/embed';

// ── Background processing ────────────────────────────────────────────────────

async function processDocument(
  docId: string,
  rawText: string,
  accessTier: string,
  fileName: string,
) {
  const supabase = createServiceSupabase();
  try {
    console.log('KB_INGEST_START', { docId, fileName, chars: rawText.length });

    // 1. Chunk the text
    const chunks = chunkText(rawText);
    if (chunks.length === 0) throw new Error('Text produced zero chunks after chunking');

    console.log('KB_INGEST_CHUNKED', { docId, chunks: chunks.length });

    // 2. Embed in batches of 100 (well under the OpenAI limit)
    const BATCH_SIZE = 100;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await embedBatch(batch.map((c) => c.content));
      allEmbeddings.push(...embeddings);
      console.log('KB_INGEST_EMBEDDED_BATCH', { docId, upTo: i + batch.length });
    }

    // 3. Remove any previously ingested chunks for this document (idempotent re-run)
    await supabase
      .from('kb_chunks')
      .delete()
      .eq('document_id', docId);

    // 4. Insert all new chunks
    const rows = chunks.map((chunk, i) => ({
      document_id: docId,
      content:     chunk.content,
      embedding:   formatVector(allEmbeddings[i]),
      chunk_index: chunk.index,
      access_tier: accessTier,
      token_count: chunk.tokenCount,
      metadata:    { file_name: fileName },
    }));

    const { error: insertError } = await supabase.from('kb_chunks').insert(rows);
    if (insertError) throw new Error(`Chunk insert failed: ${insertError.message}`);

    // 5. Mark document as ready
    const { error: updateError } = await supabase
      .from('kb_documents')
      .update({ status: 'ready', chunk_count: chunks.length, error: null })
      .eq('id', docId);

    if (updateError) throw new Error(`Status update failed: ${updateError.message}`);

    console.log('KB_INGEST_DONE', { docId, chunks: chunks.length });
  } catch (err: any) {
    console.error('KB_INGEST_ERROR', { docId, message: err.message });
    await supabase
      .from('kb_documents')
      .update({ status: 'failed', error: err.message })
      .eq('id', docId);
  }
}

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
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

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

  // Fire-and-forget background processing
  waitUntil(processDocument(doc.id, rawText, accessTier, file.name));

  return NextResponse.json({ success: true, documentId: doc.id, status: 'processing' });
}
