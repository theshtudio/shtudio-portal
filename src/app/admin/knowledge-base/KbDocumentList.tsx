'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import styles from './page.module.css';

export interface KbDocument {
  id: string;
  title: string;
  file_name: string | null;
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
  initialDocuments: KbDocument[];
}

export function KbDocumentList({ initialDocuments }: KbDocumentListProps) {
  const [docs, setDocs] = useState<KbDocument[]>(initialDocuments);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();

  const hasProcessing = docs.some((d) => d.status === 'processing');

  const fetchDocs = useCallback(async () => {
    const { data } = await supabase
      .from('kb_documents')
      .select('id, title, file_name, access_tier, category, status, chunk_count, error, created_at')
      .order('created_at', { ascending: false });

    if (data) setDocs(data as KbDocument[]);
  }, [supabase]);

  // Poll every 5 s while any document is processing
  useEffect(() => {
    if (!hasProcessing) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(fetchDocs, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [hasProcessing, fetchDocs]);

  // Expose a refresh method via a custom event so the upload panel can trigger it
  useEffect(() => {
    function onRefresh() { fetchDocs(); }
    window.addEventListener('kb:refresh', onRefresh);
    return () => window.removeEventListener('kb:refresh', onRefresh);
  }, [fetchDocs]);

  if (docs.length === 0) {
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
            <th className={styles.th}>Chunks</th>
            <th className={styles.th}>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => {
            const { badge, label } = statusToBadge(doc.status);
            return (
              <tr key={doc.id} className={styles.tr}>
                <td className={styles.td}>
                  <span className={styles.docTitle}>{doc.title}</span>
                  {doc.status === 'failed' && doc.error && (
                    <span className={styles.docError} title={doc.error}>
                      {' '}— {doc.error.slice(0, 60)}{doc.error.length > 60 ? '…' : ''}
                    </span>
                  )}
                </td>
                <td className={styles.td}>
                  <span className={styles.fileName}>{doc.file_name ?? '—'}</span>
                </td>
                <td className={styles.td}>
                  <span className={`${styles.tierBadge} ${styles[`tier_${doc.access_tier}`]}`}>
                    {TIER_LABELS[doc.access_tier] ?? doc.access_tier}
                  </span>
                </td>
                <td className={styles.td}>
                  {doc.category ? (
                    <span className={styles.categoryTag}>{doc.category}</span>
                  ) : (
                    <span className={styles.none}>—</span>
                  )}
                </td>
                <td className={styles.td}>
                  <StatusBadge status={badge} label={label} />
                </td>
                <td className={styles.td}>
                  <span className={styles.chunkCount}>
                    {doc.chunk_count !== null ? doc.chunk_count : (doc.status === 'processing' ? '…' : '—')}
                  </span>
                </td>
                <td className={styles.td}>
                  <span className={styles.dateCell}>
                    {format(new Date(doc.created_at), 'dd MMM yyyy')}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
