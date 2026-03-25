import OpenAI from 'openai';

// text-embedding-ada-002: 1536 dimensions, max 8191 tokens per call
const MODEL = 'text-embedding-ada-002';

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
 * Embed a single string.
 * Returns a 1536-dimensional float array.
 */
export async function embedText(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: MODEL,
    input: text.replace(/\n+/g, ' '), // newlines degrade quality
  });
  return response.data[0].embedding;
}

/**
 * Embed a batch of strings in one API call (max ~2048 inputs per request).
 * Returns embeddings in the same order as the input array.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await getClient().embeddings.create({
    model: MODEL,
    input: texts.map((t) => t.replace(/\n+/g, ' ')),
  });
  // API returns results sorted by index, but let's be safe
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Format a number[] embedding as the Postgres vector literal
 * that Supabase's JS client accepts as a column value.
 * e.g.  "[0.1, -0.3, ...]"
 */
export function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
