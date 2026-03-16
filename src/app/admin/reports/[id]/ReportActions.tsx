'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import type { Report } from '@/lib/types';
import styles from './page.module.css';

interface ReportActionsProps {
  report: Report;
  clientId?: string;
  showRefresh?: boolean;
  showRetry?: boolean;
  showDelete?: boolean;
}

export function ReportActions({ report, clientId, showRefresh, showRetry, showDelete }: ReportActionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [toggling, setToggling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Auto-poll every 5 seconds while in processing state (showRefresh = true)
  useEffect(() => {
    if (!showRefresh) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [showRefresh, router]);

  async function togglePublish() {
    setToggling(true);
    const newState = !report.is_published;

    await supabase
      .from('reports')
      .update({
        is_published: newState,
        published_at: newState ? new Date().toISOString() : null,
      })
      .eq('id', report.id);

    router.refresh();
    setToggling(false);
  }

  async function retryProcessing() {
    setRetrying(true);

    await fetch('/api/reports/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: report.id }),
    });

    router.refresh();
    setRetrying(false);
  }

  return (
    <>
      {report.ai_status === 'completed' && (
        <div className={styles.toggle} onClick={togglePublish}>
          <div className={`${styles.toggleSwitch} ${report.is_published ? styles.active : ''}`}>
            <div className={styles.toggleKnob} />
          </div>
          <span>{toggling ? 'Saving...' : report.is_published ? 'Published' : 'Draft'}</span>
        </div>
      )}

      {showRefresh && (
        <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
          Refresh Status
        </Button>
      )}

      {showRetry && (
        <Button size="sm" onClick={retryProcessing} loading={retrying}>
          Retry Processing
        </Button>
      )}

      {showDelete && (
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            if (!window.confirm('Are you sure you want to delete this report? This will also remove the uploaded PDF. This action cannot be undone.')) {
              return;
            }
            setDeleting(true);
            try {
              const res = await fetch(`/api/reports/${report.id}`, { method: 'DELETE' });
              if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete report');
              }
              // Redirect to client page or admin dashboard
              router.push(clientId ? `/admin/clients/${clientId}` : '/admin');
              router.refresh();
            } catch (err: any) {
              alert(err.message || 'Failed to delete report');
              setDeleting(false);
            }
          }}
          loading={deleting}
        >
          Delete Report
        </Button>
      )}
    </>
  );
}
