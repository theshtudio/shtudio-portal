// HTML sanitisation for admin-provided block override content.
//
// The full client-side sanitisation lives in sanitiseHtmlClient (which uses
// DOMPurify and is imported by the editor before saving). The server-side
// validator below is the last-line check in the API route — it runs in a
// Node context where DOMPurify isn't trivially available without JSDOM.
//
// Threat model: the only writers are authenticated admins, so the
// server-side check is conservative-but-not-bulletproof. Anything that
// looks like a script tag, javascript: URL, or inline event handler is
// rejected. The full sanitisation happens client-side before send.

const FORBIDDEN_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'style',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
];

const FORBIDDEN_TAG_RE = new RegExp(
  `<\\s*(${FORBIDDEN_TAGS.join('|')})\\b`,
  'i',
);

// onclick=, onload=, onerror=, etc.
const ON_HANDLER_RE = /\son\w+\s*=/i;

// javascript:, vbscript:, data:text/html
const DANGEROUS_PROTOCOL_RE = /(href|src|action|formaction)\s*=\s*["']?\s*(javascript|vbscript|data\s*:\s*text\/html)/i;

const MAX_OVERRIDE_LENGTH = 64 * 1024; // 64KB per block

export interface SanitiseResult {
  ok: boolean;
  reason?: string;
}

// Server-side last-line validator. Returns ok=false if anything dangerous
// is detected. Caller should reject the request with the reason.
export function validateOverrideHtmlServer(html: string): SanitiseResult {
  if (typeof html !== 'string') {
    return { ok: false, reason: 'override html must be a string' };
  }
  if (html.length > MAX_OVERRIDE_LENGTH) {
    return { ok: false, reason: `override html exceeds ${MAX_OVERRIDE_LENGTH} bytes` };
  }
  if (FORBIDDEN_TAG_RE.test(html)) {
    return { ok: false, reason: 'override html contains a forbidden tag' };
  }
  if (ON_HANDLER_RE.test(html)) {
    return { ok: false, reason: 'override html contains an inline event handler' };
  }
  if (DANGEROUS_PROTOCOL_RE.test(html)) {
    return { ok: false, reason: 'override html contains a dangerous URL protocol' };
  }
  return { ok: true };
}
