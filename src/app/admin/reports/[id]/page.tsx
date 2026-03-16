import { createServerSupabase } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { format } from 'date-fns';
import Link from 'next/link';
import { ReportActions } from './ReportActions';
import styles from './page.module.css';

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: report } = await supabase
    .from('reports')
    .select('*, clients(id, name, slug)')
    .eq('id', id)
    .single();

  if (!report) {
    return <div className={styles.notFound}>Report not found.</div>;
  }

  const client = report.clients as any;

  return (
    <>
      <Link href={client ? `/admin/clients/${client.id}` : '/admin'} className={styles.backLink}>
        ← Back to {client?.name || 'Dashboard'}
      </Link>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.heading}>{report.title}</h1>
          <div className={styles.clientName}>{client?.name}</div>
        </div>
        <div className={styles.headerActions}>
          <StatusBadge status={report.ai_status as any} />
          <ReportActions report={report} />
        </div>
      </div>

      <div className={styles.metaGrid}>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>AI Status</div>
          <div className={styles.metaValue}>
            <StatusBadge status={report.ai_status as any} />
          </div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Published</div>
          <div className={styles.metaValue}>
            <StatusBadge status={report.is_published ? 'published' : 'draft'} />
          </div>
        </div>
        {report.period_start && report.period_end && (
          <div className={styles.metaCard}>
            <div className={styles.metaLabel}>Report Period</div>
            <div className={styles.metaValue}>
              {format(new Date(report.period_start), 'MMM yyyy')} — {format(new Date(report.period_end), 'MMM yyyy')}
            </div>
          </div>
        )}
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Created</div>
          <div className={styles.metaValue}>
            {format(new Date(report.created_at), 'dd MMM yyyy, HH:mm')}
          </div>
        </div>
      </div>

      <div className={styles.previewSection}>
        <h2 className={styles.sectionTitle}>Report Preview</h2>

        {report.ai_status === 'completed' && report.ai_enhanced_html ? (
          <div
            className={styles.htmlPreview}
            dangerouslySetInnerHTML={{ __html: report.ai_enhanced_html }}
          />
        ) : report.ai_status === 'processing' ? (
          <div className={styles.processingState}>
            <div className={styles.processingIcon}>⏳</div>
            <div className={styles.processingText}>
              AI is processing this report. This usually takes 30-60 seconds.
            </div>
            <ReportActions report={report} showRefresh />
          </div>
        ) : report.ai_status === 'failed' ? (
          <div>
            <div className={styles.errorBox}>
              Processing failed: {report.ai_error || 'Unknown error'}
            </div>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <ReportActions report={report} showRetry />
            </div>
          </div>
        ) : (
          <div className={styles.processingState}>
            <div className={styles.processingIcon}>📄</div>
            <div className={styles.processingText}>
              Report is pending AI processing.
            </div>
            <ReportActions report={report} showRetry />
          </div>
        )}
      </div>
    </>
  );
}
