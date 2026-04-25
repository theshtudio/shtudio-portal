'use client';

import { useState, useMemo } from 'react';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { format } from 'date-fns';
import Link from 'next/link';
import type { Report } from '@/lib/types';
import styles from './reports.module.css';

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
  if (!type) return '—';
  return TYPE_LABELS[type] ?? type;
}

function reportYear(r: Report): string {
  const d = r.period_start ?? r.created_at;
  return d ? String(new Date(d).getFullYear()) : '—';
}

type ReportWithClient = Report & { clients: { id: string; name: string } | null };

interface AllReportsTableProps {
  initialReports: ReportWithClient[];
  clients: { id: string; name: string }[];
  canDelete: boolean;
}

export function AllReportsTable({ initialReports, clients, canDelete }: AllReportsTableProps) {
  const [reports, setReports] = useState<ReportWithClient[]>(initialReports);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    reports.forEach((r) => { if (r.report_type) seen.add(r.report_type); });
    return Array.from(seen).sort();
  }, [reports]);

  const yearOptions = useMemo(() => {
    const seen = new Set<string>();
    reports.forEach((r) => { const y = reportYear(r); if (y !== '—') seen.add(y); });
    return Array.from(seen).sort().reverse();
  }, [reports]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (filterClient && r.client_id !== filterClient) return false;
      if (filterType && r.report_type !== filterType) return false;
      if (filterYear && reportYear(r) !== filterYear) return false;
      if (filterStatus === 'published' && !r.is_published) return false;
      if (filterStatus === 'draft' && r.is_published) return false;
      return true;
    });
  }, [reports, filterClient, filterType, filterYear, filterStatus]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (filtered.every((r) => selectedIds.has(r.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
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
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const hasFilters = filterClient || filterType || filterYear || filterStatus;

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.filterBar}>
          <select className={styles.filterSelect} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className={styles.filterSelect} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Services</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{typeLabel(t)}</option>
            ))}
          </select>
          <select className={styles.filterSelect} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="">All Years</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select className={styles.filterSelect} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          {hasFilters && (
            <button className={styles.clearFilters} onClick={() => {
              setFilterClient(''); setFilterType(''); setFilterYear(''); setFilterStatus('');
            }}>
              Clear filters
            </button>
          )}
        </div>
        <div className={styles.toolbarRight}>
          <span className={styles.resultCount}>{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
          {canDelete && selectedIds.size > 0 && (
            <button className={styles.deleteSelectedBtn} onClick={() => setShowModal(true)}>
              Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {reports.length === 0 ? 'No reports yet.' : 'No reports match the current filters.'}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              {canDelete && (
                <th className={styles.checkboxCol}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    title="Select all visible"
                  />
                </th>
              )}
              <th>Client</th>
              <th>Title</th>
              <th>Service</th>
              <th>Period</th>
              <th>Published</th>
              <th>AI Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((report) => (
              <tr key={report.id} className={selectedIds.has(report.id) ? styles.rowSelected : ''}>
                {canDelete && (
                  <td className={styles.checkboxCol}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selectedIds.has(report.id)}
                      onChange={() => toggleSelect(report.id)}
                    />
                  </td>
                )}
                <td>
                  <Link href={`/admin/clients/${report.client_id}`} className={styles.clientLink}>
                    {report.clients?.name ?? '—'}
                  </Link>
                </td>
                <td>
                  <Link href={`/admin/reports/${report.id}`} className={styles.reportLink}>
                    {report.title}
                  </Link>
                </td>
                <td>{typeLabel(report.report_type)}</td>
                <td>
                  {report.period_start && report.period_end
                    ? `${format(new Date(report.period_start), 'MMM yyyy')} – ${format(new Date(report.period_end), 'MMM yyyy')}`
                    : '—'}
                </td>
                <td><StatusBadge status={report.is_published ? 'published' : 'draft'} /></td>
                <td><StatusBadge status={report.ai_status as any} /></td>
                <td>{format(new Date(report.created_at), 'dd MMM yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Delete Reports</h3>
            <p className={styles.modalBody}>
              Are you sure you want to permanently delete these reports? This cannot be undone.
            </p>
            <ul className={styles.modalFileList}>
              {selectedReports.map((r) => <li key={r.id}>{r.title}</li>)}
            </ul>
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={() => setShowModal(false)} disabled={deleting}>
                Cancel
              </button>
              <button className={styles.modalDeleteBtn} onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
