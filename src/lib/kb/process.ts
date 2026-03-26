/**
 * Shared KB document processing pipeline.
 *
 * Used by:
 *   - POST /api/kb/ingest       (initial upload)
 *   - POST /api/kb/documents/[id]/reprocess  (re-embed existing document)
 *
 * Pipeline steps:
 *   1. Fetch document metadata (access_tier, file_name) from kb_documents
 *   2. Translate to English if the text is not already English
 *   3. Chunk the translated text (~300 words per chunk, 30-word overlap)
 *   4. Embed all chunks via OpenAI text-embedding-ada-002 (1 chunk per call,
 *      2 000 ms delay between calls — see embed.ts for tuning constants)
 *   5. Delete any previous chunks for this document (idempotent)
 *   6. Insert the new chunks into kb_chunks
 *   7. Mark the document status → 'ready'
 *
 * On any error, the document status is set to 'failed' with the error message.
 */

import { createServiceSupabase } from '@/lib/supabase/server';
import { translateToEnglish }    from './translate';
import { chunkText }              from './chunk';
import { embedBatch, formatVector } from './embed';

export async function processDocument(
  docId:   string,
  rawText: string,
): Promise<void> {
  const supabase = createServiceSupabase();

  // Fetch metadata we need for chunk rows
  const { data: doc } = await supabase
    .from('kb_documents')
    .select('access_tier, file_name')
    .eq('id', docId)
    .single();

  const accessTier = doc?.access_tier ?? 'general';
  const fileName   = doc?.file_name   ?? null;

  try {
    console.log('KB_PROCESS_START', { docId, fileName, chars: rawText.length });

    // 1. Translate to English if needed
    const text = await translateToEnglish(rawText);

    // 2. Chunk (~300 words, 30-word overlap — set in chunk.ts defaults)
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('Text produced zero chunks after chunking');

    console.log('KB_PROCESS_CHUNKED', { docId, chunks: chunks.length });

    // 3. Embed — embedBatch already handles internal batching (10 per call)
    //    and per-chunk truncation to MAX_CHARS, so we pass everything at once.
    const embeddings = await embedBatch(chunks.map((c) => c.content));

    console.log('KB_PROCESS_EMBEDDED', { docId, embeddings: embeddings.length });

    // 4. Delete any previous chunks for this document (safe for re-runs)
    const { error: deleteError } = await supabase
      .from('kb_chunks')
      .delete()
      .eq('document_id', docId);

    if (deleteError) throw new Error(`Chunk delete failed: ${deleteError.message}`);

    // 5. Insert the new chunk rows
    const rows = chunks.map((chunk, i) => ({
      document_id: docId,
      content:     chunk.content,
      embedding:   formatVector(embeddings[i]),
      chunk_index: chunk.index,
      access_tier: accessTier,
      token_count: chunk.tokenCount,
      metadata:    { file_name: fileName },
    }));

    const { error: insertError } = await supabase.from('kb_chunks').insert(rows);
    if (insertError) throw new Error(`Chunk insert failed: ${insertError.message}`);

    // 6. Mark document as ready
    const { error: updateError } = await supabase
      .from('kb_documents')
      .update({ status: 'ready', chunk_count: chunks.length, error: null })
      .eq('id', docId);

    if (updateError) throw new Error(`Status update failed: ${updateError.message}`);

    console.log('KB_PROCESS_DONE', { docId, chunks: chunks.length });

  } catch (err: any) {
    console.error('KB_PROCESS_ERROR', {
      docId,
      message: err.message,
      stack:   err.stack ?? '(no stack)',
      error:   err,
    });
    await supabase
      .from('kb_documents')
      .update({ status: 'failed', error: err.message })
      .eq('id', docId);
  }
}
