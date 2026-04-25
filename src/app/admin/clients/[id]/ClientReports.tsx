'use client';

import { useState } from 'react';
import { Button } from '@/components/Button/Button';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import type { Report } from '@/lib/types';
import { format } from 'date-fns';
import Link from 'next/link';
import styles from './page.module.css';
import reportStyles from './ClientReports.module.css';

interface ClientReportsProps {
  clientId: string;
  initialReports: Report[];
  canDelete: boolean;
}

export function ClientReports({ clientId, initialReports, canDelete }: ClientReportsProps) {
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmDelete() {
    setDeleting(true);
    setError('');
    const ids = Array.from(selectedIds);

    for (const reportId of ids) {
      try {
        const res = await fetch(`/api/reports/${reportId}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Delete failed');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to delete one or more reports');
      }
    }

    setReports((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedIds(new Set());
    setShowModal(false);
    setDeleting(false);
  }

  const selectedReports = reports.filter((r) => selectedIds.has(r.id));

  return (
    <div className={styles.reportsSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Reports</h2>
        <div className={reportStyles.headerRight}>
          {canDelete && selectedIds.size > 0 && (
            <button
              className={reportStyles.deleteSelectedBtn}
              onClick={() => setShowModal(true)}
            >
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <Link href={`/admin/reports/upload?client=${clientId}`}>
            <Button size="sm">Upload Report</Button>
          </Link>
        </div>
      </div>

      {error && <div className={reportStyles.error}>{error}</div>}

      {reports.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              {canDelete && <th className={reportStyles.checkboxCol}></th>}
              <th>Title</th>
              <th>Period</th>
              <th>AI Status</th>
              <th>Published</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr
                key={report.id}
                className={selectedIds.has(report.id) ? reportStyles.rowSelected : ''}
              >
                {canDelete && (
                  <td className={reportStyles.checkboxCol}>
                    <input
                      type="checkbox"
                      className={reportStyles.checkbox}
                      checked={selectedIds.has(report.id)}
                      onChange={() => toggleSelect(report.id)}
                    />
                  </td>
                )}
                <td>
                  <Link href={`/admin/reports/${report.id}`} className={styles.reportLink}>
                    {report.title}
                  </Link>
                </td>
                <td>
                  {report.period_start && report.period_end
                    ? `${format(new Date(report.period_start), 'MMM yyyy')} – ${format(new Date(report.period_end), 'MMM yyyy')}`
                    : '—'}
                </td>
                <td><StatusBadge status={report.ai_status as any} /></td>
                <td>
                  <StatusBadge status={report.is_published ? 'published' : 'draft'} />
                </td>
                <td>{format(new Date(report.created_at), 'dd MMM yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.empty}>No reports for this client yet.</div>
      )}

      {/* Confirmation modal */}
      {showModal && (
        <div className={reportStyles.modalOverlay} onClick={() => !deleting && setShowModal(false)}>
          <div className={reportStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={reportStyles.modalTitle}>Delete Reports</h3>
            <p className={reportStyles.modalBody}>
              Are you sure you want to permanently delete these reports? This cannot be undone.
            </p>
            <ul className={reportStyles.modalFileList}>
              {selectedReports.map((r) => (
                <li key={r.id}>{r.title}</li>
              ))}
            </ul>
            <div className={reportStyles.modalActions}>
              <button
                className={reportStyles.modalCancelBtn}
                onClick={() => setShowModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={reportStyles.modalDeleteBtn}
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
