import Anthropic from '@anthropic-ai/sdk';

// Use Haiku for cheap, fast language detection and translation
const MODEL = 'claude-haiku-4-5-20251001';

// Translate in segments of this many words to stay well under context limits
const SEGMENT_WORDS = 3_000;

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

/**
 * Ask Claude whether a short text sample is in English.
 * Returns true if English (or if detection is uncertain — fail open so we
 * don't accidentally translate already-English content).
 */
async function isEnglish(sample: string): Promise<boolean> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 5,
    messages: [
      {
        role: 'user',
        content:
          'Is the following text written in English? ' +
          'Reply with only YES or NO, nothing else.\n\n' +
          sample,
      },
    ],
  });

  const reply = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .toUpperCase();

  // Any non-YES answer (including uncertain replies) is treated as non-English
  return reply.startsWith('YES');
}

/**
 * Translate one segment of text to English.
 * The prompt instructs Claude to return only the translated text, no commentary.
 */
async function translateSegment(text: string): Promise<string> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4_096,
    messages: [
      {
        role: 'user',
        content:
          'Translate the following text to English. ' +
          'Return only the translated text — no preamble, no commentary, no explanations.\n\n' +
          text,
      },
    ],
  });

  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Detect the language of `text` by sampling its first 500 characters.
 * - If English: return the original text unchanged (no API cost).
 * - If not English: translate in overlapping segments of ~SEGMENT_WORDS words
 *   and return the concatenated English result.
 */
export async function translateToEnglish(text: string): Promise<string> {
  const sample = text.slice(0, 500);

  if (await isEnglish(sample)) {
    return text; // already English — no translation needed
  }

  console.log('KB_TRANSLATE_START', { chars: text.length });

  const words    = text.trim().split(/\s+/);
  const segments: string[] = [];

  for (let i = 0; i < words.length; i += SEGMENT_WORDS) {
    const segNum  = Math.floor(i / SEGMENT_WORDS) + 1;
    const total   = Math.ceil(words.length / SEGMENT_WORDS);
    console.log('KB_TRANSLATE_SEGMENT_START', { segment: segNum, of: total, wordOffset: i });
    const segment    = words.slice(i, i + SEGMENT_WORDS).join(' ');
    const translated = await translateSegment(segment);
    segments.push(translated);
    console.log('KB_TRANSLATE_SEGMENT_DONE', { segment: segNum, of: total, words: Math.min(i + SEGMENT_WORDS, words.length) });
  }

  const result = segments.join('\n\n');
  console.log('KB_TRANSLATE_DONE', { originalChars: text.length, translatedChars: result.length });
  return result;
}
