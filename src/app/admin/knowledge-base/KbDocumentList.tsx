'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import styles from './page.module.css';

export interface KbDocument {
  id: string;
  title: string;
  file_name: string | null;
  file_path: string | null;
  access_tier: string;
  category: string | null;
  status: 'processing' | 'ready' | 'failed';
  chunk_count: number | null;
  error: string | null;
  created_at: string;
}

const TIER_LABELS: Record<string, string> = {
  general:   'General',
  sensitive: 'Sensitive',
  admin:     'Admin',
};

function statusToBadge(status: string): { badge: 'processing' | 'completed' | 'failed'; label: string } {
  if (status === 'ready')      return { badge: 'completed', label: 'Ready' };
  if (status === 'processing') return { badge: 'processing', label: 'Processing' };
  return { badge: 'failed', label: 'Failed' };
}

interface KbDocumentListProps {
  documents:      KbDocument[];
  justReadyIds:   Set<string>;
  onDeleted:      (id: string) => void;
  onReprocessed:  (id: string) => void;
}

export function KbDocumentList({
  documents,
  justReadyIds,
  onDeleted,
  onReprocessed,
}: KbDocumentListProps) {
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [now,            setNow]            = useState(() => Date.now());

  const hasProcessing = documents.some((d) => d.status === 'processing');

  // 1-second tick — only runs while at least one doc is processing
  useEffect(() => {
    if (!hasProcessing) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [hasProcessing]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/kb/documents/${id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(id);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReprocess(id: string) {
    setReprocessingId(id);
    try {
      const res = await fetch(`/api/kb/documents/${id}/reprocess`, { method: 'POST' });
      if (res.ok) {
        onReprocessed(id); // parent updates status → 'processing' optimistically
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? 'Re-process failed. Please try again.');
      }
    } finally {
      setReprocessingId(null);
    }
  }

  if (!documents || documents.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📚</div>
        <div className={styles.emptyText}>No documents yet. Upload your first one →</div>
      </div>
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Title</th>
            <th className={styles.th}>File</th>
            <th className={styles.th}>Tier</th>
            <th className={styles.th}>Category</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Sections</th>
            <th className={styles.th}>Uploaded</th>
            <th className={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const { badge, label } = statusToBadge(doc.status);
            const isDeleting     = deletingId     === doc.id;
            const isReprocessing = reprocessingId === doc.id;
            const isProcessing   = doc.status === 'processing';
            const isJustReady    = justReadyIds.has(doc.id);
            const canReprocess   = !!doc.file_path && !isProcessing && !isReprocessing && !isDeleting;

            // Seconds elapsed since document was created (≈ since processing began)
            const elapsedSec = isProcessing
              ? Math.max(0, Math.floor((now - new Date(doc.created_at).getTime()) / 1_000))
              : 0;

            // Negative animation-delay fast-forwards the keyframe to the current position
            const progressDelay = `-${Math.min(elapsedSec, 29)}s`;

            return (
              <tr
                key={doc.id}
                className={[
                  styles.tr,
                  isJustReady ? styles.trFlashGreen : '',
                ].filter(Boolean).join(' ')}
              >

                {/* Title + inline error */}
                <td className={styles.td}>
                  <span className={styles.docTitle}>{doc.title}</span>
                  {doc.status === 'failed' && doc.error && (
                    <span className={styles.docError} title={doc.error}>{doc.error}</span>
                  )}
                </td>

                {/* File name */}
                <td className={styles.td}>
                  <span className={styles.fileName}>{doc.file_name ?? '—'}</span>
                </td>

                {/* Access tier */}
                <td className={styles.td}>
                  <span className={`${styles.tierBadge} ${styles[`tier_${doc.access_tier}`]}`}>
                    {TIER_LABELS[doc.access_tier] ?? doc.access_tier}
                  </span>
                </td>

                {/* Category */}
                <td className={styles.td}>
                  {doc.category ? (
                    <span className={styles.categoryTag}>{doc.category}</span>
                  ) : (
                    <span className={styles.none}>—</span>
                  )}
                </td>

                {/* Status — badge + progress bar + elapsed timer */}
                <td className={styles.td}>
                  <StatusBadge status={badge} label={label} />

                  {/* Progress bar: animated while processing, jumps to 100 % green when just ready */}
                  {(isProcessing || isJustReady) && (
                    <div className={styles.progressTrack}>
                      <div
                        className={isJustReady ? styles.progressFillDone : styles.progressFill}
                        style={isProcessing ? { animationDelay: progressDelay } : undefined}
                      />
                    </div>
                  )}

                  {/* Live elapsed-time counter */}
                  {isProcessing && (
                    <span className={styles.elapsedTime}>{elapsedSec}s elapsed</span>
                  )}
                </td>

                {/* Chunk count */}
                <td className={styles.td}>
                  <span className={styles.chunkCount}>
                    {doc.chunk_count !== null ? doc.chunk_count : isProcessing ? '…' : '—'}
                  </span>
                </td>

                {/* Upload date */}
                <td className={styles.td}>
                  <span className={styles.dateCell}>
                    {format(new Date(doc.created_at), 'd MMM yyyy, h:mm aaa')}
                  </span>
                </td>

                {/* Actions: Re-process + Delete */}
                <td className={styles.td}>
                  <div className={styles.actionBtns}>
                    <button
                      className={styles.reprocessBtn}
                      onClick={() => handleReprocess(doc.id)}
                      disabled={!canReprocess}
                      title={
                        !doc.file_path
                          ? 'No source file stored — delete and re-upload to enable re-processing'
                          : isProcessing
                          ? 'Currently processing…'
                          : 'Re-translate, re-chunk and re-embed this document'
                      }
                      aria-label={`Re-process ${doc.title}`}
                    >
                      {isReprocessing ? '…' : '↺'}
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(doc.id)}
                      disabled={isDeleting || isReprocessing}
                      aria-label={`Delete ${doc.title}`}
                    >
                      {isDeleting ? '…' : 'Delete'}
                    </button>
                  </div>
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
