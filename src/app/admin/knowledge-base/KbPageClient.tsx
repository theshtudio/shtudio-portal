'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { KbDocumentList } from './KbDocumentList';
import { KbUploadPanel }  from './KbUploadPanel';
import type { KbDocument } from './KbDocumentList';
import styles from './page.module.css';

interface KbPageClientProps {
  initialDocuments: KbDocument[];
}

export function KbPageClient({ initialDocuments }: KbPageClientProps) {
  const [documents,    setDocuments]    = useState<KbDocument[]>(initialDocuments);
  const [justReadyIds, setJustReadyIds] = useState<Set<string>>(new Set());

  // Re-process all state
  const [reprocessingAll,  setReprocessingAll]  = useState(false);
  const [reprocessCurrent, setReprocessCurrent] = useState(0);
  const [reprocessTotal,   setReprocessTotal]   = useState(0);

  // Keep a ref so callbacks can access the latest docs without being listed as deps
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  const hasProcessing = documents.some((d) => d.status === 'processing');

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async (): Promise<KbDocument[]> => {
    try {
      const res = await fetch('/api/kb/documents');
      if (!res.ok) return documentsRef.current;
      const json = await res.json();
      return (json.documents ?? []) as KbDocument[];
    } catch {
      return documentsRef.current;
    }
  }, []);

  // ── Apply fresh data + detect processing → ready transitions ───────────────

  const applyFresh = useCallback((fresh: KbDocument[]) => {
    const newReadyIds = new Set<string>();
    for (const doc of fresh) {
      const prev = documentsRef.current.find((d) => d.id === doc.id);
      if (prev?.status === 'processing' && doc.status === 'ready') {
        newReadyIds.add(doc.id);
      }
    }

    setDocuments(fresh);

    if (newReadyIds.size > 0) {
      setJustReadyIds((prev) => new Set([...prev, ...newReadyIds]));
      // Clear the green flash after 2 s
      setTimeout(() => {
        setJustReadyIds((prev) => {
          const next = new Set(prev);
          newReadyIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 2_000);
    }
  }, []);

  // ── Poll every 3 s while any document is processing ────────────────────────

  useEffect(() => {
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      const fresh = await fetchDocuments();
      applyFresh(fresh);
    }, 3_000);

    return () => clearInterval(interval);
  }, [hasProcessing, fetchDocuments, applyFresh]);

  // ── Callbacks from child components ────────────────────────────────────────

  async function handleUploaded() {
    const fresh = await fetchDocuments();
    applyFresh(fresh);
  }

  function handleDeleted(id: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  function handleReprocessed(id: string) {
    // Optimistically mark as processing so the progress bar appears immediately
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, status: 'processing', chunk_count: null, error: null } : d,
      ),
    );
  }

  // ── Re-process all (sequential to avoid hammering the embedding API) ────────

  async function handleReprocessAll() {
    const docsToProcess = documentsRef.current;
    if (docsToProcess.length === 0) return;

    setReprocessingAll(true);
    setReprocessCurrent(0);
    setReprocessTotal(docsToProcess.length);

    for (let i = 0; i < docsToProcess.length; i++) {
      const doc = docsToProcess[i];
      setReprocessCurrent(i + 1);

      // Optimistically flip to processing
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...d, status: 'processing', chunk_count: null, error: null } : d,
        ),
      );

      // Only reprocess documents that have a stored source file
      if (doc.file_path) {
        await fetch(`/api/kb/documents/${doc.id}/reprocess`, { method: 'POST' });
      }
    }

    setReprocessingAll(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      <div className={styles.listCol}>

        {/* Toolbar above the document table */}
        <div className={styles.listToolbar}>
          {reprocessingAll ? (
            <span className={styles.reprocessProgress}>
              <span className={styles.reprocessSpinner} />
              Re-processing {reprocessCurrent} of {reprocessTotal}…
            </span>
          ) : (
            <button
              className={styles.reprocessAllBtn}
              onClick={handleReprocessAll}
              disabled={documents.length === 0}
              title="Re-translate, re-chunk and re-embed every document in the list"
            >
              ↺ Re-process all ({documents.length})
            </button>
          )}
        </div>

        <KbDocumentList
          documents={documents}
          justReadyIds={justReadyIds}
          onDeleted={handleDeleted}
          onReprocessed={handleReprocessed}
        />
      </div>

      <div className={styles.uploadCol}>
        <KbUploadPanel onUploaded={handleUploaded} />
      </div>
    </div>
  );
}
