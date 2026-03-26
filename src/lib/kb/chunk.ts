export interface Chunk {
  content: string;
  index: number;
  /** Approximate token count (1 token ≈ 4 characters, good enough for ada-002) */
  tokenCount: number;
}

/** Rough token estimate — avoids a full tiktoken dep for now. */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split `text` into overlapping word-based chunks.
 *
 * @param text        The source text to chunk.
 * @param targetWords Target words per chunk (default 300 ≈ ~230 tokens, comfortably under ada-002's 8191 limit).
 * @param overlapWords Words of overlap between consecutive chunks (default 30).
 * @returns           Array of Chunk objects in document order.
 */
export function chunkText(
  text: string,
  targetWords = 300,
  overlapWords = 30,
): Chunk[] {
  // Split on any whitespace run so even documents with no blank lines get word-level splitting
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return [];

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < words.length) {
    const end     = Math.min(start + targetWords, words.length);
    const content = words.slice(start, end).join(' ');

    chunks.push({
      content,
      index:      chunks.length,
      tokenCount: approxTokens(content),
    });

    // Advance by (targetWords - overlapWords) so consecutive chunks share overlap
    const advance = targetWords - overlapWords;
    start += advance > 0 ? advance : targetWords; // guard against zero/negative advance
  }

  return chunks;
}

/**
 * Convenience: chunk an array of already-split paragraphs / sections.
 * Each section is chunked independently so boundaries are never crossed.
 */
export function chunkSections(
  sections: Array<{ content: string; sourceRef?: string }>,
  targetWords = 300,
  overlapWords = 30,
): Array<Chunk & { sourceRef?: string }> {
  return sections.flatMap(({ content, sourceRef }) =>
    chunkText(content, targetWords, overlapWords).map((c) => ({
      ...c,
      sourceRef,
    })),
  );
}
