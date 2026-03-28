/**
 * Summarises a raw document into structured business prose using Claude Sonnet.
 *
 * For large documents (> SEGMENT_WORDS words) the text is summarised in
 * segments and then merged with one additional Claude call so the final
 * summary is coherent and within a reasonable length.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL        = 'claude-sonnet-4-5';
const SEGMENT_WORDS = 3_000;

const SYSTEM_PROMPT = `You are processing an internal business document for a digital marketing agency called Shtudio based in Sydney, Australia. Your job is to extract and summarise the key business information from this document into clean, structured prose that will be stored in a knowledge base and searched later.

Always start the summary with the date or time period of the document prominently (e.g. "June 2024 meeting" or "March 2026 document"). This is important because older information may be outdated and newer information should take precedence.

Extract and include:
- All clients mentioned — what was discussed, what work was being done, project status, issues
- All decisions made
- All action items and who was responsible
- Any business strategies, plans or ideas discussed
- Any operational issues or processes mentioned
- Services being offered or developed
- Pricing discussed for client-facing services (e.g. what was quoted or charged to a client for a project) — always note the date this was from so it can be treated as potentially outdated
- People and organisations: for every person mentioned, extract their full name, the company or agency they represent, their location if mentioned, and their role or what they were responsible for in the context of this document. Format this as a dedicated "People & Organisations Mentioned" section at the end of every summary. Example format:
  - Oleksii Sheiko — LuxSite Digital Agency (Kyiv) — external developer, handles frontend development for client websites
  - Madina Mukhamedova — Shtudio — SEO and project coordination

Do NOT include:
- Small talk or off-topic conversation
- Personal opinions about individuals
- Internal staff salaries, contractor rates, or what individual team members are paid
- Exact quotes or transcript-style formatting

Be extremely careful with names — only include client names, people names, and company names that are clearly and explicitly stated in the source text. If a name is unclear or you are not certain, omit it rather than guess. Never invent or approximate names.

At the end of every summary, always include a dedicated "People & Organisations Mentioned" section listing every person referenced in the document. For each person include: full name, company or agency they represent, location if mentioned, and their role or what they were responsible for. Example format:
- Oleksii Sheiko — LuxSite Digital Agency (Kyiv) — external developer, handles frontend development for client websites
- Madina Mukhamedova — Shtudio (Sydney) — SEO and project coordination
Only include people who are clearly and explicitly named in the source text. Never guess or infer names.

Write in clear business English as structured paragraphs. If the source is a meeting transcript, write it as "In the [month/date] meeting, the team discussed..." Format it so someone reading it later can quickly understand what happened and what was decided.`;

const MERGE_SYSTEM_PROMPT = `You are merging several segment summaries of the same business document into one coherent summary. Combine them into a single, flowing document without repeating information. Keep the date/time period prominent at the start. Preserve all clients, decisions, action items, strategies, and pricing details mentioned across all segments.`;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

async function summariseSegment(
  text:    string,
  title:   string,
  segLabel?: string,
): Promise<string> {
  console.log('KB_SUMMARISE_SEGMENT_START', { title, segment: segLabel, chars: text.length });

  const message = await getClient().messages.create({
    model:      MODEL,
    max_tokens: 2_048,
    system:     SYSTEM_PROMPT,
    messages:   [{
      role:    'user',
      content: `Document title: ${title}\n\n${text}`,
    }],
  });

  const result = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  console.log('KB_SUMMARISE_SEGMENT_DONE', { title, segment: segLabel, outputChars: result.length });
  return result;
}

async function mergeSegmentSummaries(
  summaries: string[],
  title:     string,
): Promise<string> {
  console.log('KB_SUMMARISE_MERGE_START', { title, segments: summaries.length });

  const combined = summaries
    .map((s, i) => `--- Segment ${i + 1} ---\n${s}`)
    .join('\n\n');

  const message = await getClient().messages.create({
    model:      MODEL,
    max_tokens: 4_096,
    system:     MERGE_SYSTEM_PROMPT,
    messages:   [{
      role:    'user',
      content: `Document title: ${title}\n\n${combined}`,
    }],
  });

  const result = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  console.log('KB_SUMMARISE_MERGE_DONE', { title, outputChars: result.length });
  return result;
}

/**
 * Summarise `text` into structured business prose.
 *
 * - Short documents (≤ SEGMENT_WORDS words): single Claude call.
 * - Long documents: summarised in SEGMENT_WORDS-word segments, then merged
 *   with a second Claude call to produce one coherent summary.
 */
export async function summariseDocument(
  text:  string,
  title: string,
): Promise<string> {
  console.log('KB_SUMMARISE_START', { title, chars: text.length });

  const words = text.trim().split(/\s+/);

  if (words.length <= SEGMENT_WORDS) {
    // Short document — single call
    return summariseSegment(text, title, '1/1');
  }

  // Long document — segment → merge
  const segmentSummaries: string[] = [];
  const total = Math.ceil(words.length / SEGMENT_WORDS);

  for (let i = 0; i < words.length; i += SEGMENT_WORDS) {
    const segNum   = Math.floor(i / SEGMENT_WORDS) + 1;
    const segment  = words.slice(i, i + SEGMENT_WORDS).join(' ');
    const summary  = await summariseSegment(segment, title, `${segNum}/${total}`);
    segmentSummaries.push(summary);
  }

  return mergeSegmentSummaries(segmentSummaries, title);
}
