'use client';

import { useEffect, useMemo, useRef } from 'react';
import { applyBlocksToHtml } from '@/lib/reportBlocks';
import type { BlocksConfig } from '@/lib/types';

interface ReportHtmlProps {
  html: string;
  // Optional per-report layout customisation. Null/undefined means render
  // the AI output verbatim. When present, blocks are reordered, hidden,
  // and override-replaced before the HTML is injected — and before the
  // script-execution effect runs, so charts still initialise.
  blocks?: BlocksConfig | null;
  // When false, blocks marked with data-default-hidden="true" are
  // rendered (admin preview default). When true or undefined (the client
  // default), default-hidden blocks are stripped from the output unless
  // the admin has explicitly opted them in via blocks.shown.
  respectDefaultHidden?: boolean;
  className?: string;
}

// React's dangerouslySetInnerHTML inserts <script> nodes into the DOM but
// the browser does NOT execute them — only scripts created via
// document.createElement('script') run. After mounting, we walk the
// container, replace each inert <script> with a fresh one in document
// order, and await external src loads before processing any later inline
// scripts so dependencies (e.g. Chart.js → new Chart(...)) line up.
export function ReportHtml({
  html,
  blocks,
  respectDefaultHidden,
  className,
}: ReportHtmlProps) {
  // applyBlocksToHtml is pure string manipulation, so running it inside
  // useMemo produces the SAME string in SSR and after hydration — no
  // flash of the un-customised report, no hydration mismatch.
  const renderedHtml = useMemo(
    () =>
      applyBlocksToHtml(html ?? '', blocks ?? null, {
        respectDefaultHidden: respectDefaultHidden ?? true,
      }),
    [html, blocks, respectDefaultHidden],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Per-mount guard: prevents double execution under React StrictMode
  // (which intentionally invokes effects twice in dev) and any
  // same-html re-render. Different html string ⇒ run again.
  const lastExecutedHtml = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !renderedHtml) return;
    if (lastExecutedHtml.current === renderedHtml) return;
    lastExecutedHtml.current = renderedHtml;

    let cancelled = false;

    async function executeScripts() {
      if (!container) return;
      // Snapshot now — replaceWith() detaches nodes from the live list.
      const scripts = Array.from(container.querySelectorAll('script'));

      for (const oldScript of scripts) {
        if (cancelled) return;

        try {
          const newScript = document.createElement('script');
          for (const { name, value } of Array.from(oldScript.attributes)) {
            // Strict in-order execution: external must finish before later
            // inline scripts run, so async/defer would break us.
            if (name === 'async' || name === 'defer') continue;
            newScript.setAttribute(name, value);
          }

          if (oldScript.src) {
            await new Promise<void>((resolve) => {
              newScript.onload = () => resolve();
              newScript.onerror = () => {
                console.error('[ReportHtml] external script failed:', oldScript.src);
                resolve();
              };
              oldScript.replaceWith(newScript);
            });
          } else {
            // The report prompt wraps chart init in
            //   document.addEventListener('DOMContentLoaded', function() { ... });
            // DOMContentLoaded already fired by the time this report is
            // injected, so the listener body would never run. Unwrap it
            // when the document is past loading so the body runs now.
            let body = oldScript.textContent ?? '';
            if (document.readyState !== 'loading') {
              body = body.replace(
                /document\.addEventListener\(\s*['"]DOMContentLoaded['"]\s*,\s*function\s*\(\s*\)\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/,
                '(function(){$1})();',
              );
            }
            newScript.textContent = body;
            oldScript.replaceWith(newScript);
          }
        } catch (err) {
          console.error('[ReportHtml] failed to re-execute script:', err);
        }
      }
    }

    executeScripts();

    return () => {
      cancelled = true;
    };
  }, [renderedHtml]);

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
