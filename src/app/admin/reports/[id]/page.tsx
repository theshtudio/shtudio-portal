import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { format } from 'date-fns';
import Link from 'next/link';
import { ReportActions } from './ReportActions';
import { ShareLink } from './ShareLink';
import { CustomInstructions } from './CustomInstructions';
import { ReportComments } from './ReportComments';
import { ClientMismatchBanner } from './ClientMismatchBanner';
import { ProcessingProgress } from './ProcessingProgress';
import { EditableTitle } from './EditableTitle';
import { ReportDetailsCard } from './ReportDetailsCard';
import { ReportHtml } from '@/components/ReportHtml/ReportHtml';
import type { ReportCommentWithAuthor } from '@/lib/types';
import { ValidationWarnings } from './ValidationWarnings';
import styles from './page.module.css';

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // ?raw=1 bypasses any saved block customisations so admins can see the
  // unmodified AI output for debugging. Default is the customised view.
  const rawMode = sp.raw === '1';
  // ?preview=published forces the published block config (what clients see)
  // even when there's an unpublished draft saved. Useful for verifying the
  // "live" state without leaving the admin context.
  const previewPublished = sp.preview === 'published';
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

  // Fetch all clients for the reassignment dropdown
  const serviceSupabase = createServiceSupabase();
  const { data: allClients } = await serviceSupabase
    .from('clients')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  // Fetch validation warnings for this report
  const { data: validationWarnings } = await serviceSupabase
    .from('report_validation_warnings')
    .select('id, warning_type, details, created_at')
    .eq('report_id', id)
    .order('created_at', { ascending: false });

  // Fetch comments (using service role to bypass RLS for admin view)
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
          <EditableTitle reportId={report.id} initialTitle={report.title} />
          <div className={styles.clientName}>{client?.name}</div>
        </div>
        <div className={styles.headerActions}>
          <StatusBadge status={report.ai_status as any} />
          {report.ai_status === 'completed' && report.ai_enhanced_html && (
            <Link href={`/admin/reports/${report.id}/edit`} className={styles.editLayoutBtn}>
              Edit Layout
            </Link>
          )}
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
              <ReportActions report={report} showPublishToggle />
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

      {/* Report Details — editable card */}
      <ReportDetailsCard
        reportId={report.id}
        initialPeriodStart={report.period_start ?? null}
        initialPeriodEnd={report.period_end ?? null}
        initialClientId={client?.id ?? ''}
        initialReportType={report.report_type ?? null}
        allClients={allClients ?? []}
      />

      {/* Custom Instructions */}
      <CustomInstructions reportId={report.id} initialValue={report.custom_instructions || ''} />

      {validationWarnings && validationWarnings.length > 0 && (
        <ValidationWarnings warnings={validationWarnings as any} />
      )}

      <div className={styles.previewSection}>
        <h2 className={styles.sectionTitle}>Report Preview</h2>

        {report.ai_status === 'completed' && report.ai_enhanced_html ? (
          <ReportHtml
            className={styles.htmlPreview}
            html={report.ai_enhanced_html}
            blocks={
              rawMode
                ? null
                : previewPublished
                  ? (report.blocks ?? null)
                  : (report.blocks_draft ?? report.blocks ?? null)
            }
            // Default admin preview shows internal-only blocks so admins
            // can see what's there. ?preview=published acts like a client
            // view, ?raw=1 shows everything (effectively the same as not
            // respecting default-hidden — both intend "show me everything").
            respectDefaultHidden={previewPublished}
          />
        ) : report.ai_status === 'processing' ? (
          <ProcessingProgress reportId={report.id} />
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
