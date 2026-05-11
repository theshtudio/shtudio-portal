// Phase A — block transform utility.
//
// Walks the AI-generated report HTML, finds every top-level
//   <section data-block-id="..." data-block-type="..." data-block-title="...">
// wrapper, and re-emits the HTML according to a BlocksConfig:
//   - `order` reshuffles the blocks (unlisted blocks fall back to their
//     original document order, after the listed ones)
//   - `hidden` drops blocks by id
//   - `overrides` replaces the inner HTML of a block, preserving the wrapper
//     <section> element so the block keeps its identity
//
// Everything outside the first/last block range (header, footer, <head>
// scripts, bottom-of-body chart-init script) is preserved verbatim.
//
// Implemented as pure string manipulation so the same transform runs in
// SSR and in the browser without a DOMParser/JSDOM dependency. The output
// hydrates without mismatch because both environments produce the same
// string for the same input.

import type { BlocksConfig } from './types';

export interface ParsedBlock {
  id: string;
  type: string;
  title: string | null;
  start: number;
  end: number;
  outerHtml: string;
  innerHtml: string;
}

function readAttr(attrs: string, name: string): string | null {
  // Tolerate single or double quoted values. We control the prompt so the
  // model emits double-quoted; the regex covers both for safety.
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = attrs.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

function extractInner(outerHtml: string): string {
  const openMatch = outerHtml.match(/^<section\b[^>]*>/i);
  const openLen = openMatch ? openMatch[0].length : 0;
  const closeIdx = outerHtml.lastIndexOf('</section');
  if (closeIdx < openLen) return '';
  return outerHtml.slice(openLen, closeIdx);
}

// Scan for top-level <section ...data-block-id="...">...</section> elements,
// tracking nesting depth so sections inside sections aren't treated as
// independent blocks. Exported so the block editor can render each block
// individually as a sortable React component.
export function findTopLevelBlocks(html: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const tagRe = /<(\/?)section\b([^>]*)>/gi;

  let depth = 0;
  let openStart = -1;
  let openAttrs = '';

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const isClose = m[1] === '/';
    const attrs = m[2] || '';
    const selfClosing = !isClose && /\/\s*$/.test(attrs);

    if (isClose) {
      if (depth === 0) continue; // stray </section>, skip
      depth--;
      if (depth === 0 && openStart >= 0) {
        const end = m.index + m[0].length;
        const id = readAttr(openAttrs, 'data-block-id');
        if (id) {
          const outerHtml = html.slice(openStart, end);
          blocks.push({
            id,
            type: readAttr(openAttrs, 'data-block-type') ?? 'unknown',
            title: readAttr(openAttrs, 'data-block-title'),
            start: openStart,
            end,
            outerHtml,
            innerHtml: extractInner(outerHtml),
          });
        }
        openStart = -1;
        openAttrs = '';
      }
      continue;
    }

    if (depth === 0) {
      openStart = m.index;
      openAttrs = attrs;
    }

    if (selfClosing) {
      if (depth === 0 && openStart >= 0) {
        const end = m.index + m[0].length;
        const id = readAttr(openAttrs, 'data-block-id');
        if (id) {
          const outerHtml = html.slice(openStart, end);
          blocks.push({
            id,
            type: readAttr(openAttrs, 'data-block-type') ?? 'unknown',
            title: readAttr(openAttrs, 'data-block-title'),
            start: openStart,
            end,
            outerHtml,
            innerHtml: extractInner(outerHtml),
          });
        }
        openStart = -1;
        openAttrs = '';
      }
    } else {
      depth++;
    }
  }

  return blocks;
}

function isConfigEmpty(blocks: BlocksConfig | null | undefined): boolean {
  if (!blocks) return true;
  const orderLen = blocks.order?.length ?? 0;
  const hiddenLen = blocks.hidden?.length ?? 0;
  const overrideCount = blocks.overrides ? Object.keys(blocks.overrides).length : 0;
  return orderLen === 0 && hiddenLen === 0 && overrideCount === 0;
}

export function applyBlocksToHtml(
  html: string,
  blocks: BlocksConfig | null | undefined,
): string {
  if (isConfigEmpty(blocks)) return html;
  const cfg = blocks as BlocksConfig;

  const found = findTopLevelBlocks(html);
  if (found.length === 0) {
    // Report pre-dates the block-wrapper prompt change — render as-is so
    // historical reports keep working.
    return html;
  }

  const hidden = new Set(cfg.hidden ?? []);
  const overrides = cfg.overrides ?? {};
  const explicitOrder = cfg.order ?? [];

  const byId = new Map(found.map((b) => [b.id, b]));

  // Final order: ids from cfg.order first (only those that actually exist),
  // followed by any blocks not mentioned in cfg.order in original document
  // order — that keeps newly-added block types visible even if the saved
  // order pre-dates them.
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const id of explicitOrder) {
    if (byId.has(id) && !seen.has(id)) {
      orderedIds.push(id);
      seen.add(id);
    }
  }
  for (const block of found) {
    if (!seen.has(block.id)) {
      orderedIds.push(block.id);
      seen.add(block.id);
    }
  }

  const rendered: string[] = [];
  for (const id of orderedIds) {
    if (hidden.has(id)) continue;
    const block = byId.get(id);
    if (!block) continue;
    const override = overrides[id];
    if (override && typeof override.html === 'string') {
      // Preserve the opening <section ...> tag (with its data attributes)
      // and only replace the inner content with the override HTML.
      const openTagMatch = block.outerHtml.match(/^<section\b[^>]*>/i);
      const openTag = openTagMatch ? openTagMatch[0] : '<section>';
      rendered.push(`${openTag}${override.html}</section>`);
    } else {
      rendered.push(block.outerHtml);
    }
  }

  // Splice the rendered block sequence back into the original HTML in place
  // of the original block range, preserving the surrounding scaffolding
  // (header, footer, <head> tags, bottom-of-body chart init script).
  const firstStart = found[0].start;
  const lastEnd = found[found.length - 1].end;
  const before = html.slice(0, firstStart);
  const after = html.slice(lastEnd);

  return before + rendered.join('\n') + after;
}

// Editor-specific helper: split the HTML into the scaffolding before the
// first block, the parsed block list, and the scaffolding after the last
// block. The block editor renders head + sortable list + tail so React
// controls each block as an independent sortable item while keeping
// styles, head scripts, and bottom-of-body init scripts in place.
export interface SplitForEditor {
  head: string;
  blocks: ParsedBlock[];
  tail: string;
}

export function splitHtmlForEditor(html: string): SplitForEditor {
  const blocks = findTopLevelBlocks(html);
  if (blocks.length === 0) {
    return { head: html, blocks: [], tail: '' };
  }
  const head = html.slice(0, blocks[0].start);
  const tail = html.slice(blocks[blocks.length - 1].end);
  return { head, blocks, tail };
}
