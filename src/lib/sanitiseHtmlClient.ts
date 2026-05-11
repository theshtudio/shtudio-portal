'use client';

// Client-only DOMPurify wrapper. The editor calls this on contenteditable
// output before sending the override to the server. The server-side
// validator (validateOverrideHtmlServer) is the last-line whitelist check;
// this function is the primary defense.

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'span',
  'div',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

export function sanitiseOverrideHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Belt-and-braces: even though ALLOWED_TAGS / ATTR is restrictive,
    // these flags prevent a stale DOMPurify version from letting through
    // anything we don't want.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    ALLOW_DATA_ATTR: false,
  });
}
