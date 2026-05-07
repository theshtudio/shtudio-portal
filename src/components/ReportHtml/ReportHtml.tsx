'use client';

import { useEffect, useRef } from 'react';

interface ReportHtmlProps {
  html: string;
  className?: string;
}

// React's dangerouslySetInnerHTML inserts <script> nodes into the DOM but
// the browser does NOT execute them — only scripts created via
// document.createElement('script') run. After mounting, we walk the
// container, replace each inert <script> with a fresh one in document
// order, and await external src loads before processing any later inline
// scripts so dependencies (e.g. Chart.js → new Chart(...)) line up.
export function ReportHtml({ html, className }: ReportHtmlProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Per-mount guard: prevents double execution under React StrictMode
  // (which intentionally invokes effects twice in dev) and any
  // same-html re-render. Different html string ⇒ run again.
  const lastExecutedHtml = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !html) return;
    if (lastExecutedHtml.current === html) return;
    lastExecutedHtml.current = html;

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
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
