/**
 * Session 1 sanity test — pgvector + embedding pipeline
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/test-kb-embed.ts
 *
 * What it does:
 *  1. Chunks a hardcoded sample text
 *  2. Embeds every chunk via OpenAI text-embedding-ada-002
 *  3. Inserts the chunks into kb_chunks (Supabase)
 *  4. Runs a similarity search via match_kb_chunks() RPC
 *  5. Cleans up the test rows so the table stays tidy
 */

import { createClient } from '@supabase/supabase-js';
import { chunkText } from '../src/lib/kb/chunk';
import { embedBatch, embedText, formatVector } from '../src/lib/kb/embed';

// ── Validate env ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY) {
  console.error(
    '\n❌  Missing env vars. Make sure .env.local contains:\n' +
    '   NEXT_PUBLIC_SUPABASE_URL\n' +
    '   SUPABASE_SERVICE_ROLE_KEY\n' +
    '   OPENAI_API_KEY\n',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Sample text ───────────────────────────────────────────────────────────────

const SAMPLE_TEXT = `
Shtudio is a full-service digital marketing agency based in Australia.
We specialise in Google Ads, Meta Ads, SEO, and Google Business Profile management.
Our team of certified specialists has managed over $50 million in ad spend across
hundreds of clients in industries ranging from healthcare and legal to retail and
hospitality.

Google Ads is one of our core services. We build, optimise, and scale campaigns on
Google Search, Display, Shopping, YouTube, and Performance Max. Our Google Ads
specialists hold active Google certifications and attend regular training sessions to
stay ahead of platform changes.

SEO at Shtudio covers both on-page and off-page optimisation. We use industry-leading
tools including SEMrush, Ahrefs, and Google Search Console to identify opportunities
and track progress. Monthly reports include keyword rankings, backlink profiles,
traffic analysis, and a plan for the coming month.

Meta Ads management includes Facebook and Instagram campaigns across all objectives:
awareness, traffic, leads, and conversions. We handle creative strategy, audience
targeting, A/B testing, and budget allocation. Our team liaises directly with Meta
Business Support where required to resolve policy or account issues.

Google Business Profile (GBP) management keeps your local presence strong. We
optimise your profile, post regularly, respond to reviews, and provide monthly reports
showing interactions, search terms, and platform breakdown. A strong GBP directly
contributes to local SEO performance.

Our client portal gives you 24/7 access to your reports. AI-enhanced reports are
generated from raw data files uploaded by our team, structured and summarised using
Claude AI, and published directly to your portal dashboard. You can leave comments,
ask questions, and track your campaign performance over time.
`.trim();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧩  Step 1 — Chunking sample text…');
  const chunks = chunkText(SAMPLE_TEXT, 100, 15); // small words for this short sample
  console.log(`   → ${chunks.length} chunk(s) produced`);
  chunks.forEach((c, i) =>
    console.log(`   Chunk ${i}: ${c.tokenCount} approx tokens — "${c.content.slice(0, 60)}…"`),
  );

  console.log('\n🔢  Step 2 — Embedding chunks via OpenAI ada-002…');
  const embeddings = await embedBatch(chunks.map((c) => c.content));
  console.log(`   → ${embeddings.length} embedding(s) received (dim: ${embeddings[0].length})`);

  console.log('\n💾  Step 3 — Inserting into kb_chunks…');
  const rows = chunks.map((chunk, i) => ({
    content:     chunk.content,
    embedding:   formatVector(embeddings[i]),
    source_type: 'test',
    source_ref:  'scripts/test-kb-embed.ts',
    chunk_index: chunk.index,
    token_count: chunk.tokenCount,
    metadata:    { test: true, run: new Date().toISOString() },
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('kb_chunks')
    .insert(rows)
    .select('id');

  if (insertError) {
    console.error('❌  Insert failed:', insertError.message);
    process.exit(1);
  }
  const insertedIds = inserted!.map((r: { id: string }) => r.id);
  console.log(`   → Inserted ${insertedIds.length} row(s): ${insertedIds.join(', ')}`);

  console.log('\n🔍  Step 4 — Similarity search (query: "google ads campaigns")…');
  const queryEmbedding = await embedText('google ads campaigns performance');
  const { data: matches, error: rpcError } = await supabase.rpc('match_kb_chunks', {
    query_embedding: formatVector(queryEmbedding),
    match_threshold: 0.70,
    match_count: 3,
  });

  if (rpcError) {
    console.error('❌  RPC failed:', rpcError.message);
    // Still proceed to cleanup
  } else {
    console.log(`   → ${matches?.length ?? 0} match(es) found:`);
    (matches ?? []).forEach((m: { similarity: number; content: string }) =>
      console.log(
        `   [${(m.similarity * 100).toFixed(1)}%] "${m.content.slice(0, 80)}…"`,
      ),
    );
  }

  console.log('\n🧹  Step 5 — Cleaning up test rows…');
  const { error: delError } = await supabase
    .from('kb_chunks')
    .delete()
    .in('id', insertedIds);
  if (delError) {
    console.warn('   ⚠️  Cleanup failed (rows left in db):', delError.message);
  } else {
    console.log(`   → Deleted ${insertedIds.length} test row(s)`);
  }

  console.log('\n✅  All steps completed — pgvector pipeline is working!\n');
}

main().catch((err) => {
  console.error('\n❌  Unexpected error:', err);
  process.exit(1);
});
