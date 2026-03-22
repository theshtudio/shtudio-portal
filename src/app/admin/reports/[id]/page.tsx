import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { format } from 'date-fns';
import Link from 'next/link';
import { ReportActions } from './ReportActions';
import { ShareLink } from './ShareLink';
import { CustomInstructions } from './CustomInstructions';
import { ReportComments } from './ReportComments';
import { ClientMismatchBanner } from './ClientMismatchBanner';
import type { ReportCommentWithAuthor } from '@/lib/types';
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

  // Fetch comments (using service role to bypass RLS for admin view)
  const serviceSupabase = createServiceSupabase();
  const { data: comments } = await serviceSupabase
    .from('report_comments')
    .select('*, profiles(full_name, email)')
    .eq('report_id', id)
    .order('created_at', { ascending: true });

  const typedComments = (comments || []) as ReportCommentWithAuthor[];

  return (
    <>
      <Link href={client ? `/admin/clients/${client.id}` : '/admin'} className={styles.backLink}>
        &larr; Back to {client?.name || 'Dashboard'}
      </Link>

      {report.client_mismatch && report.detected_client_name && (
        <ClientMismatchBanner
          reportId={report.id}
          detectedClientName={report.detected_client_name}
          currentClientName={client?.name || 'Unknown'}
        />
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.heading}>{report.title}</h1>
          <div className={styles.clientName}>{client?.name}</div>
        </div>
        <div className={styles.headerActions}>
          <StatusBadge status={report.ai_status as any} />
          <ReportActions report={report} clientId={client?.id} showDelete />
        </div>
      </div>

      {/* Publish + Share section */}
      {report.ai_status === 'completed' && (
        <div className={styles.publishSection}>
          <div className={styles.publishCard}>
            <div className={styles.publishHeader}>
              <div>
                <div className={styles.publishTitle}>Publish & Share</div>
                <div className={styles.publishDescription}>
                  {report.is_published
                    ? 'This report is live and accessible via the share link.'
                    : 'Publish this report to make it accessible via the share link.'}
                </div>
              </div>
              <ReportActions report={report} />
            </div>
            {report.is_published && (
              <div className={styles.shareRow}>
                <ShareLink reportId={report.id} />
              </div>
            )}
          </div>
        </div>
      )}

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
              {format(new Date(report.period_start), 'MMM yyyy')} &mdash; {format(new Date(report.period_end), 'MMM yyyy')}
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

      {/* Custom Instructions */}
      <CustomInstructions reportId={report.id} initialValue={report.custom_instructions || ''} />

      <div className={styles.previewSection}>
        <h2 className={styles.sectionTitle}>Report Preview</h2>

        {report.ai_status === 'completed' && report.ai_enhanced_html ? (
          <div
            className={styles.htmlPreview}
            dangerouslySetInnerHTML={{ __html: report.ai_enhanced_html }}
          />
        ) : report.ai_status === 'processing' ? (
          <div className={styles.processingState}>
            <div className={styles.processingIcon}>&#9203;</div>
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
            <div className={styles.processingIcon}>&#128196;</div>
            <div className={styles.processingText}>
              Report is pending AI processing.
            </div>
            <ReportActions report={report} showRetry />
          </div>
        )}
      </div>

      {/* Internal Comments */}
      <ReportComments reportId={report.id} initialComments={typedComments} />
    </>
  );
}
