'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import type { Report } from '@/lib/types';
import styles from './page.module.css';

interface ReportActionsProps {
  report: Report;
  showRefresh?: boolean;
  showRetry?: boolean;
}

export function ReportActions({ report, showRefresh, showRetry }: ReportActionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [toggling, setToggling] = useState(false);
  const [retrying, setRetrying] = useState(false);

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
    </>
  );
}
