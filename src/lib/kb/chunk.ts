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
 * @param targetWords Target words per chunk (default 500 ≈ ~380 tokens, well under ada-002's 8191 limit).
 * @param overlapWords Words of overlap between consecutive chunks (default 50).
 * @returns           Array of Chunk objects in document order.
 */
export function chunkText(
  text: string,
  targetWords = 500,
  overlapWords = 50,
): Chunk[] {
  // Normalise whitespace but preserve paragraph structure for splitting
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let buffer: string[] = [];

  function flush(isLast: boolean) {
    if (buffer.length === 0) return;
    const content = buffer.join(' ');
    chunks.push({
      content,
      index: chunks.length,
      tokenCount: approxTokens(content),
    });
    // Keep overlap words for the next chunk
    buffer = isLast ? [] : buffer.slice(-overlapWords);
  }

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    buffer.push(...words);

    // Flush whenever we've accumulated enough words
    while (buffer.length >= targetWords) {
      flush(false);
    }
  }

  // Flush whatever's left
  if (buffer.length > 0) flush(true);

  return chunks;
}

/**
 * Convenience: chunk an array of already-split paragraphs / sections.
 * Each section is chunked independently so boundaries are never crossed.
 */
export function chunkSections(
  sections: Array<{ content: string; sourceRef?: string }>,
  targetWords = 500,
  overlapWords = 50,
): Array<Chunk & { sourceRef?: string }> {
  return sections.flatMap(({ content, sourceRef }) =>
    chunkText(content, targetWords, overlapWords).map((c) => ({
      ...c,
      sourceRef,
    })),
  );
}
