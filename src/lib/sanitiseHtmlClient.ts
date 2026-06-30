'use client';

// Client-only DOMPurify wrapper. The editor calls this on contenteditable
// output before sending the override to the server. The server-side
// validator (validateOverrideHtmlServer) is the last-line whitelist check;
// this function is the primary defense.

import DOMPurify from 'dompurify';

// Inline formatting only — no headings, divs, or spans. This matches what
// narrative blocks support and prevents execCommand from introducing elements
// that break the block's existing CSS wrapper and spacing.
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
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

export function sanitiseOverrideHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'class', 'style', 'id'],
    ALLOW_DATA_ATTR: false,
  });
}
