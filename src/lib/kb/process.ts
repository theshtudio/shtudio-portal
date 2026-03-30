/**
 * Shared KB document processing pipeline.
 *
 * Used by:
 *   - POST /api/kb/ingest       (initial upload)
 *   - POST /api/kb/documents/[id]/reprocess  (re-embed existing document)
 *
 * Pipeline steps:
 *   1. Fetch document metadata (access_tier, file_name) from kb_documents
 *   2. Summarise the raw text into structured business prose via Claude
 *      (skipped when skipSummarise is true — raw text is used directly)
 *   3. Translate the summary (or raw text) to English if not already English
 *   4. Chunk the translated text (~300 words per chunk, 30-word overlap)
 *   5. Embed all chunks via OpenAI text-embedding-ada-002 (1 chunk per call,
 *      2 000 ms delay between calls — see embed.ts for tuning constants)
 *   6. Delete any previous chunks for this document (idempotent)
 *   7. Insert the new chunks into kb_chunks
 *   8. Mark the document status → 'ready' and summarised → true
 *
 * On any error, the document status is set to 'failed' with the error message.
 */

import { createServiceSupabase } from '@/lib/supabase/server';
import { summariseDocument }     from './summarise';
import { translateToEnglish }    from './translate';
import { chunkText }              from './chunk';
import { embedBatch, formatVector } from './embed';

export interface ProcessOptions {
  skipSummarise?: boolean;
}

export async function processDocument(
  docId:   string,
  rawText: string,
  options: ProcessOptions = {},
): Promise<void> {
  const { skipSummarise = false } = options;
  const supabase = createServiceSupabase();

  // Fetch metadata we need for chunk rows
  const { data: doc } = await supabase
    .from('kb_documents')
    .select('access_tier, file_name')
    .eq('id', docId)
    .single();

  const accessTier = doc?.access_tier ?? 'general';
  const fileName   = doc?.file_name   ?? null;
  const docTitle   = fileName ?? docId;

  try {
    console.log('KB_PROCESS_START', { docId, fileName, chars: rawText.length });

    // 1. Summarise raw text into structured business prose, and auto-categorise
    //    — skip this step if the caller set skipSummarise (doc is already clean)
    let textToProcess: string;
    if (skipSummarise) {
      console.log('KB_PROCESS_SKIP_SUMMARISE', { docId });
      textToProcess = rawText;
    } else {
      const { summary, categories } = await summariseDocument(rawText, docTitle);

      // Mark summarised immediately and save auto-generated categories
      await supabase
        .from('kb_documents')
        .update({ summarised: true, category: categories || null })
        .eq('id', docId);

      textToProcess = summary;
    }

    // 2. Translate to English if needed
    const text = await translateToEnglish(textToProcess);

    // 3. Chunk (~300 words, 30-word overlap — set in chunk.ts defaults)
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('Text produced zero chunks after chunking');

    console.log('KB_PROCESS_CHUNKED', { docId, chunks: chunks.length });

    // 4. Embed — embedBatch already handles internal batching (10 per call)
    //    and per-chunk truncation to MAX_CHARS, so we pass everything at once.
    const embeddings = await embedBatch(chunks.map((c) => c.content));

    console.log('KB_PROCESS_EMBEDDED', { docId, embeddings: embeddings.length });

    // 5. Delete any previous chunks for this document (safe for re-runs)
    const { error: deleteError } = await supabase
      .from('kb_chunks')
      .delete()
      .eq('document_id', docId);

    if (deleteError) throw new Error(`Chunk delete failed: ${deleteError.message}`);

    // 6. Insert the new chunk rows
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

    // 7. Mark document as ready
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
