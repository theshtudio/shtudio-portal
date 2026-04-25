'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/Button/Button';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import type { Report } from '@/lib/types';
import { format } from 'date-fns';
import Link from 'next/link';
import styles from './page.module.css';
import reportStyles from './ClientReports.module.css';

const TYPE_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  seo: 'SEO',
  meta_ads: 'Meta Ads',
  microsoft_ads: 'Microsoft Ads',
  linkedin_ads: 'LinkedIn Ads',
  gbp: 'Google Business Profile',
  combined: 'Combined',
  'pre-formatted': 'Pre-formatted',
};

function typeLabel(type: string | null) {
  if (!type) return 'Other';
  return TYPE_LABELS[type] ?? type;
}

function reportYear(r: Report): string {
  const d = r.period_start ?? r.created_at;
  return d ? String(new Date(d).getFullYear()) : '—';
}

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

  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    reports.forEach((r) => seen.add(r.report_type ?? ''));
    return Array.from(seen).sort();
  }, [reports]);

  const yearOptions = useMemo(() => {
    const seen = new Set<string>();
    reports.forEach((r) => { const y = reportYear(r); if (y !== '—') seen.add(y); });
    return Array.from(seen).sort().reverse();
  }, [reports]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (filterType && (r.report_type ?? '') !== filterType) return false;
      if (filterYear && reportYear(r) !== filterYear) return false;
      if (filterStatus === 'published' && !r.is_published) return false;
      if (filterStatus === 'draft' && r.is_published) return false;
      return true;
    });
  }, [reports, filterType, filterYear, filterStatus]);

  const groups = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of filtered) {
      const key = r.report_type ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete one or more reports');
      }
    }

    setReports((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedIds(new Set());
    setShowModal(false);
    setDeleting(false);
  }

  const selectedReports = reports.filter((r) => selectedIds.has(r.id));
  const hasFilters = filterType || filterYear || filterStatus;

  return (
    <div className={styles.reportsSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Reports</h2>
        <div className={reportStyles.headerRight}>
          {canDelete && selectedIds.size > 0 && (
            <button className={reportStyles.deleteSelectedBtn} onClick={() => setShowModal(true)}>
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <Link href={`/admin/reports/upload?client=${clientId}`}>
            <Button size="sm">Upload Report</Button>
          </Link>
        </div>
      </div>

      {reports.length > 0 && (
        <div className={reportStyles.filterBar}>
          <select
            className={reportStyles.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All Services</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{typeLabel(t || null)}</option>
            ))}
          </select>
          <select
            className={reportStyles.filterSelect}
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="">All Years</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            className={reportStyles.filterSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          {hasFilters && (
            <button
              className={reportStyles.clearFilters}
              onClick={() => { setFilterType(''); setFilterYear(''); setFilterStatus(''); }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {error && <div className={reportStyles.error}>{error}</div>}

      {reports.length === 0 ? (
        <div className={styles.empty}>No reports for this client yet.</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No reports match the current filters.</div>
      ) : (
        <div className={reportStyles.groups}>
          {groups.map(([type, groupReports]) => (
            <div key={type} className={reportStyles.group}>
              <div className={reportStyles.groupHeader}>{typeLabel(type || null)}</div>
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
                  {groupReports.map((report) => (
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
                      <td><StatusBadge status={report.is_published ? 'published' : 'draft'} /></td>
                      <td>{format(new Date(report.created_at), 'dd MMM yyyy')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className={reportStyles.modalOverlay} onClick={() => !deleting && setShowModal(false)}>
          <div className={reportStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={reportStyles.modalTitle}>Delete Reports</h3>
            <p className={reportStyles.modalBody}>
              Are you sure you want to permanently delete these reports? This cannot be undone.
            </p>
            <ul className={reportStyles.modalFileList}>
              {selectedReports.map((r) => <li key={r.id}>{r.title}</li>)}
            </ul>
            <div className={reportStyles.modalActions}>
              <button className={reportStyles.modalCancelBtn} onClick={() => setShowModal(false)} disabled={deleting}>
                Cancel
              </button>
              <button className={reportStyles.modalDeleteBtn} onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
