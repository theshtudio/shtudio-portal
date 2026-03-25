'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { REPORT_TYPES } from '@/lib/reportTypeConfig';
import type { Client } from '@/lib/types';
import styles from './page.module.css';

interface ReportDetailsCardProps {
  reportId: string;
  initialPeriodStart: string | null;
  initialPeriodEnd: string | null;
  initialClientId: string;
  initialReportType: string | null;
  allClients: Pick<Client, 'id' | 'name'>[];
}

// Convert ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH...) to YYYY-MM for <input type="month">
function toMonthValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 7);
}

// Convert YYYY-MM to first-of-month ISO string
function fromMonthValue(val: string): string | null {
  if (!val) return null;
  return `${val}-01`;
}

export function ReportDetailsCard({
  reportId,
  initialPeriodStart,
  initialPeriodEnd,
  initialClientId,
  initialReportType,
  allClients,
}: ReportDetailsCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);

  const [periodStart, setPeriodStart] = useState(toMonthValue(initialPeriodStart));
  const [periodEnd, setPeriodEnd] = useState(toMonthValue(initialPeriodEnd));
  const [clientId, setClientId] = useState(initialClientId);
  const [reportType, setReportType] = useState(initialReportType ?? '');

  function handleCancel() {
    setPeriodStart(toMonthValue(initialPeriodStart));
    setPeriodEnd(toMonthValue(initialPeriodEnd));
    setClientId(initialClientId);
    setReportType(initialReportType ?? '');
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        period_start: fromMonthValue(periodStart),
        period_end: fromMonthValue(periodEnd),
        client_id: clientId || undefined,
        report_type: reportType || null,
      }),
    });
    setSaving(false);
    setEditing(false);
    setToast(true);
    setTimeout(() => setToast(false), 2500);
    router.refresh();
  }

  const currentClientName = allClients.find((c) => c.id === clientId)?.name ?? '—';
  const currentReportType =
    REPORT_TYPES.find((rt) => rt.key === reportType)?.displayName ?? reportType ?? '—';

  return (
    <div className={styles.detailsSection}>
      <div className={styles.detailsHeader}>
        <h2 className={styles.sectionTitle}>Report Details</h2>
        {!editing && (
          <button className={styles.detailsEditBtn} onClick={() => setEditing(true)}>
            <PencilIcon /> Edit
          </button>
        )}
      </div>

      <div className={styles.detailsCard}>
        {editing ? (
          <>
            <div className={styles.detailsFieldGrid}>
              <div className={styles.detailsField}>
                <label className={styles.detailsLabel}>Period Start</label>
                <input
                  type="month"
                  className={styles.detailsInput}
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className={styles.detailsField}>
                <label className={styles.detailsLabel}>Period End</label>
                <input
                  type="month"
                  className={styles.detailsInput}
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
              <div className={styles.detailsField}>
                <label className={styles.detailsLabel}>Client</label>
                <select
                  className={styles.detailsSelect}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  {allClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.detailsField}>
                <label className={styles.detailsLabel}>Report Type</label>
                <select
                  className={styles.detailsSelect}
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option value="">— None —</option>
                  {REPORT_TYPES.map((rt) => (
                    <option key={rt.key} value={rt.key}>
                      {rt.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.detailsActions}>
              <button className={styles.titleCancelBtn} onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button className={styles.titleSaveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.detailsFieldGrid}>
            <div className={styles.detailsField}>
              <div className={styles.detailsLabel}>Period Start</div>
              <div className={styles.detailsValue}>{periodStart || '—'}</div>
            </div>
            <div className={styles.detailsField}>
              <div className={styles.detailsLabel}>Period End</div>
              <div className={styles.detailsValue}>{periodEnd || '—'}</div>
            </div>
            <div className={styles.detailsField}>
              <div className={styles.detailsLabel}>Client</div>
              <div className={styles.detailsValue}>{currentClientName}</div>
            </div>
            <div className={styles.detailsField}>
              <div className={styles.detailsLabel}>Report Type</div>
              <div className={styles.detailsValue}>{currentReportType}</div>
            </div>
          </div>
        )}
      </div>

      {toast && <div className={styles.titleToast}>Details updated</div>}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1464 1.14645L3.71885 8.57392C3.62439 8.66838 3.55027 8.78411 3.50998 8.90997L2.51069 12.1555C2.46945 12.283 2.50406 12.4218 2.59835 12.5161C2.69264 12.6104 2.83141 12.6451 2.95893 12.6038L6.20455 11.6045C6.33041 11.5642 6.44614 11.4901 6.54061 11.3957L13.9681 3.96823C14.1633 3.77297 14.1633 3.45638 13.9681 3.26112L11.8536 1.14645ZM11.5 2.20711L12.7929 3.49996L12.1464 4.14645L10.8536 2.85355L11.5 2.20711ZM10.1464 3.56066L11.4393 4.85355L5.54039 10.7525L4.27763 11.1738L3.83042 10.7266L4.25171 9.46385L10.1464 3.56066Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
