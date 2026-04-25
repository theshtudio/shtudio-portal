'use client';

import { useState, useMemo } from 'react';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { format } from 'date-fns';
import Link from 'next/link';
import type { Report } from '@/lib/types';
import styles from './page.module.css';

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

interface DashboardReportsTableProps {
  initialReports: ReportWithClient[];
  clients: { id: string; name: string }[];
}

export function DashboardReportsTable({ initialReports, clients }: DashboardReportsTableProps) {
  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    initialReports.forEach((r) => { if (r.report_type) seen.add(r.report_type); });
    return Array.from(seen).sort();
  }, [initialReports]);

  const yearOptions = useMemo(() => {
    const seen = new Set<string>();
    initialReports.forEach((r) => { const y = reportYear(r); if (y !== '—') seen.add(y); });
    return Array.from(seen).sort().reverse();
  }, [initialReports]);

  const filtered = useMemo(() => {
    return initialReports.filter((r) => {
      if (filterClient && r.client_id !== filterClient) return false;
      if (filterType && r.report_type !== filterType) return false;
      if (filterYear && reportYear(r) !== filterYear) return false;
      if (filterStatus === 'published' && !r.is_published) return false;
      if (filterStatus === 'draft' && r.is_published) return false;
      return true;
    });
  }, [initialReports, filterClient, filterType, filterYear, filterStatus]);

  const hasFilters = filterClient || filterType || filterYear || filterStatus;

  return (
    <>
      <div className={styles.reportsHeader}>
        <h2 className={styles.sectionTitle}>Reports</h2>
        <div className={styles.filterBar}>
          <select
            className={styles.filterSelect}
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All Services</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{typeLabel(t)}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="">All Years</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          {hasFilters && (
            <button
              className={styles.clearFilters}
              onClick={() => { setFilterClient(''); setFilterType(''); setFilterYear(''); setFilterStatus(''); }}
            >
              Clear filters
            </button>
          )}
          <span className={styles.resultCount}>
            {filtered.length} report{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {initialReports.length === 0
            ? 'No reports yet. Upload your first PDF to get started.'
            : 'No reports match the current filters.'}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Report</th>
              <th>Client</th>
              <th>Service</th>
              <th>AI Status</th>
              <th>Published</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((report) => (
              <tr key={report.id}>
                <td>
                  <Link href={`/admin/reports/${report.id}`} className={styles.reportLink}>
                    {report.title}
                  </Link>
                </td>
                <td>
                  <Link href={`/admin/clients/${report.client_id}`} className={styles.clientLink}>
                    {report.clients?.name ?? '—'}
                  </Link>
                </td>
                <td>{typeLabel(report.report_type)}</td>
                <td><StatusBadge status={report.ai_status as any} /></td>
                <td><StatusBadge status={report.is_published ? 'published' : 'draft'} /></td>
                <td>{format(new Date(report.created_at), 'dd MMM yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
