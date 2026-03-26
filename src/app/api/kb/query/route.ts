import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { embedText, formatVector } from '@/lib/kb/embed';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const FALLBACK_ANSWER =
  "I don't have information on that yet. Please speak to your Shtudio manager.";

const SYSTEM_PROMPT =
  "You are Shtudio's internal knowledge assistant. Answer the question using ONLY the " +
  "provided context. If the context doesn't contain enough information to answer, say " +
  "'I don't have enough information on that. Please speak to your Shtudio manager.' " +
  "Do not speculate or use knowledge outside the provided context.";

export async function POST(request: NextRequest) {
  // ── Auth: logged-in admin only ─────────────────────────────────────────────
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

  // ── Parse body ─────────────────────────────────────────────────────────────
  let question: string;
  try {
    const body = await request.json();
    question = (body.question ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: '"question" is required' }, { status: 400 });
  }

  const adminSupabase = createServiceSupabase();

  // ── Embed the question ─────────────────────────────────────────────────────
  let embedding: number[];
  try {
    embedding = await embedText(question);
  } catch (err: any) {
    console.error('[POST /api/kb/query] embed failed:', err.message);
    return NextResponse.json({ error: 'Embedding failed' }, { status: 500 });
  }

  // ── Vector search ──────────────────────────────────────────────────────────
  const { data: chunks, error: rpcError } = await adminSupabase.rpc('match_kb_chunks', {
    query_embedding: formatVector(embedding),
    match_threshold: 0.75,
    match_count:     6,
    allowed_tiers:   ['general', 'sensitive', 'admin'],
  });

  if (rpcError) {
    console.error('[POST /api/kb/query] match_kb_chunks RPC failed:', rpcError.message);
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const hadResults = Array.isArray(chunks) && chunks.length > 0;

  // ── Generate answer ────────────────────────────────────────────────────────
  let answer: string;

  if (!hadResults) {
    answer = FALLBACK_ANSWER;
  } else {
    const context = (chunks as any[])
      .map((c, i) => `[${i + 1}] ${c.content}`)
      .join('\n\n');

    try {
      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` }],
      });

      answer = response.content[0].type === 'text'
        ? response.content[0].text
        : FALLBACK_ANSWER;
    } catch (err: any) {
      console.error('[POST /api/kb/query] Claude call failed:', err.message);
      return NextResponse.json({ error: 'AI call failed' }, { status: 500 });
    }
  }

  // ── Log to kb_queries ──────────────────────────────────────────────────────
  await adminSupabase.from('kb_queries').insert({
    question,
    answer,
    chunks_used: hadResults ? (chunks as any[]).length : 0,
    had_results: hadResults,
    queried_by:  user.id,
  });

  // ── Respond ────────────────────────────────────────────────────────────────
  return NextResponse.json({
    answer,
    hadResults,
    sources: hadResults ? (chunks as any[]).map((c) => c.id) : [],
  });
}
