import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { embedText, formatVector } from '@/lib/kb/embed';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const FALLBACK_ANSWER =
  "I don't have information on that yet. Please speak to your Shtudio manager.";

const SYSTEM_PROMPT = `\
You are Shtudio's internal knowledge assistant — a professional business tool for answering \
questions about agency operations, client work, campaigns, and internal processes.

Answer questions using ONLY the provided context. Do not speculate or use knowledge outside \
the provided context. If the context doesn't contain enough information to answer, say \
"I don't have enough information on that. Please speak to your Shtudio manager."

ALLOWED topics:
- Agency operations, workflows, and processes
- Client campaigns, projects, and business performance
- Meeting summaries about business topics, decisions, and deliverables

STRICTLY DECLINED topics — refuse immediately without referencing the context:
- Questions about what a specific named person said about another specific named person \
  (e.g. "what did Alex say about Julius", "what did Madina say about Eugene")
- Personal opinions, private conversations, or interpersonal commentary from meeting transcripts
- Questions about personal relationships, conflicts, or private matters between individuals
- Any information about salaries, rates, hourly charges, contractor fees, or compensation \
  amounts for any individual — whether staff, contractors, or freelancers — even if such \
  figures appear in the provided context; never reveal, confirm, or hint at them

If you decline a question about personal or interpersonal content, respond with exactly: \
"That question relates to personal or private conversation content which isn't available \
through this knowledge base. Try asking about business topics, client campaigns, or agency \
processes instead."

If you decline a question about compensation, rates, or fees, respond with exactly: \
"Compensation and rate information is confidential and not available through this knowledge base."

Always respond in plain conversational prose. Never use markdown formatting such as bold \
(**text**), bullet points, headers, or asterisks in your responses. Write as if speaking \
naturally to a colleague.

When a follow-up question refers to a specific client or entity mentioned in the conversation \
history, always anchor your answer to that specific client. If the retrieved context does not \
contain specific information about that client for the topic being asked, say so clearly — for \
example "I don't have specific information about who handles SEO for Skyecap — please check \
with your Shtudio manager." Never give a generic answer about how Shtudio works in general \
when the question is clearly about a specific client.`;

const MAX_HISTORY = 6;

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
  let history: HistoryMessage[] = [];
  try {
    const body = await request.json();
    question = (body.question ?? '').trim();
    if (Array.isArray(body.history)) {
      // Cap to last MAX_HISTORY messages; validate shape minimally
      history = (body.history as any[])
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_HISTORY);
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  console.log('Received history:', JSON.stringify(history));

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

  // ── Period detection (e.g. "June 2024", "october 2024") ───────────────────
  const periodMatch = question.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i,
  );

  let periodChunks: any[] = [];
  if (periodMatch) {
    const period = `${periodMatch[1]} ${periodMatch[2]}`.toLowerCase(); // e.g. "june 2024"
    console.log('KB_QUERY_PERIOD_DETECTED', { period });

    // Find documents whose title contains the detected month+year
    const { data: matchingDocs } = await adminSupabase
      .from('kb_documents')
      .select('id')
      .ilike('title', `%${period}%`)
      .eq('status', 'ready');

    if (matchingDocs && matchingDocs.length > 0) {
      const docIds = matchingDocs.map((d) => d.id);
      console.log('KB_QUERY_PERIOD_DOCS', { period, docIds });

      // Fetch chunks directly from those documents (up to 10)
      const { data: directChunks } = await adminSupabase
        .from('kb_chunks')
        .select('id, content, document_id, chunk_index')
        .in('document_id', docIds)
        .order('chunk_index', { ascending: true })
        .limit(10);

      if (directChunks && directChunks.length > 0) {
        periodChunks = directChunks;
        console.log('KB_QUERY_PERIOD_CHUNKS', { period, count: periodChunks.length });
      }
    }
  }

  // ── Vector search ──────────────────────────────────────────────────────────
  const { data: vectorChunks, error: rpcError } = await adminSupabase.rpc('match_kb_chunks', {
    query_embedding: formatVector(embedding),
    match_threshold: 0.3,
    match_count:     10,
    allowed_tiers:   ['general', 'sensitive', 'admin'],
  });

  if (rpcError) {
    console.error('[POST /api/kb/query] match_kb_chunks RPC failed:', rpcError.message);
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  // Merge: period chunks first, then vector results — deduplicated by chunk id
  const seenIds = new Set<string>();
  const chunks: any[] = [];
  for (const c of [...periodChunks, ...(vectorChunks ?? [])]) {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      chunks.push(c);
    }
  }

  const hadResults = chunks.length > 0;

  // ── Generate answer ────────────────────────────────────────────────────────
  // Always call Claude — even with an empty context — so the system prompt can
  // handle privacy refusals correctly instead of bypassing them with an early
  // generic fallback.
  let answer: string;

  const context = hadResults
    ? (chunks as any[]).map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
    : '';

  try {
    // Build the messages array: prior history + current turn
    // The context is injected into the final user message only — it's the
    // freshest retrieval result and previous turns already have their own context.
    const historyMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role:    m.role,
      content: m.content,
    }));

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [
        ...historyMessages,
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
      ],
    });

    answer = response.content[0].type === 'text'
      ? response.content[0].text
      : FALLBACK_ANSWER;
  } catch (err: any) {
    console.error('[POST /api/kb/query] Claude call failed:', err.message);
    return NextResponse.json({ error: 'AI call failed' }, { status: 500 });
  }

  // ── Log to kb_queries ──────────────────────────────────────────────────────
  const { data: queryRow } = await adminSupabase
    .from('kb_queries')
    .insert({
      question,
      answer,
      chunks_used: hadResults ? (chunks as any[]).length : 0,
      had_results: hadResults,
      queried_by:  user.id,
    })
    .select('id')
    .single();

  // ── Respond ────────────────────────────────────────────────────────────────
  return NextResponse.json({
    answer,
    hadResults,
    queryId: queryRow?.id ?? null,
    sources: hadResults ? (chunks as any[]).map((c) => c.id) : [],
  });
}
