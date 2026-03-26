import OpenAI from 'openai';

// text-embedding-ada-002: 1536 dimensions, max 8191 tokens per input
const MODEL = 'text-embedding-ada-002';

// Hard safety margin — leave 191 tokens of headroom below the 8191 limit
const MAX_TOKENS   = 8_000;
// Approximate characters that correspond to MAX_TOKENS (1 token ≈ 4 chars)
const MAX_CHARS    = MAX_TOKENS * 4; // 32 000

// Chunks sent per embeddings API call.
// Set to 1 (one chunk per call) to be maximally conservative on rate limits.
// text-embedding-ada-002 Tier 1 allows 500 RPM so batches of 10 would also
// be safe, but 1 eliminates any per-request token-count ambiguity entirely.
const BATCH_SIZE   = 10;

// Pause between consecutive embedding API calls.
// 200 ms → ~300 RPM ceiling, well within Tier 1's 500 RPM limit.
// Increase to 2 000 ms (2 s) if you're seeing 429 rate-limit errors,
// or check your tier at https://platform.openai.com/account/limits
const INTER_BATCH_DELAY_MS = 200;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/**
 * Normalise and hard-truncate a string so it never exceeds MAX_CHARS
 * (≈ MAX_TOKENS tokens for ada-002).  Truncation at a character boundary
 * is safe: ada-002 is byte-pair encoded so a partial word near the end
 * won't cause an error, it just drops a few trailing bytes.
 */
function prepareText(text: string): string {
  const normalised = text.replace(/\n+/g, ' ').trim();
  return normalised.length > MAX_CHARS ? normalised.slice(0, MAX_CHARS) : normalised;
}

/**
 * Embed a single string.
 * Returns a 1536-dimensional float array.
 */
export async function embedText(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: MODEL,
    input: prepareText(text),
  });
  return response.data[0].embedding;
}

/**
 * Embed an array of strings, processing them in sequential sub-batches of
 * BATCH_SIZE to stay well within per-request token budgets and rate limits.
 *
 * Each text is normalised (newlines → spaces) and hard-truncated to MAX_CHARS
 * before it is sent, so no single input can ever trip the 8191-token limit.
 *
 * Returns embeddings in the same order as the input array.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const prepared = texts.map(prepareText);
  const results: number[][] = new Array(prepared.length);

  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const slice    = prepared.slice(i, i + BATCH_SIZE);
    const response = await getClient().embeddings.create({
      model: MODEL,
      input: slice,
    });

    // API returns items sorted by index (relative to this sub-batch call),
    // but sort defensively to be safe.
    response.data
      .sort((a, b) => a.index - b.index)
      .forEach((item, j) => {
        results[i + j] = item.embedding;
      });

    // Pause between batches to avoid hitting OpenAI's requests-per-minute
    // rate limit. Skip the delay after the final batch.
    const hasMore = i + BATCH_SIZE < prepared.length;
    if (hasMore) {
      await new Promise<void>((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
    }
  }

  return results;
}

/**
 * Format a number[] embedding as the Postgres vector literal
 * that Supabase's JS client accepts as a column value.
 * e.g.  "[0.1, -0.3, ...]"
 */
export function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
