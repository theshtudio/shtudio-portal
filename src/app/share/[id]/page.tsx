import { createServiceSupabase } from '@/lib/supabase/server';
import { DownloadButton } from './DownloadButton';
import type { Metadata } from 'next';
import styles from './page.module.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServiceSupabase();

  const { data: report } = await supabase
    .from('reports')
    .select('title, clients(name)')
    .eq('id', id)
    .eq('is_published', true)
    .single();

  if (!report) {
    return { title: 'Report Not Available | Shtudio' };
  }

  const clientName = (report.clients as any)?.name || '';
  return {
    title: `${report.title}${clientName ? ` – ${clientName}` : ''} | Shtudio`,
  };
}

export default async function ShareReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceSupabase();

  const { data: report } = await supabase
    .from('reports')
    .select('id, title, ai_enhanced_html, is_published, ai_status')
    .eq('id', id)
    .single();

  if (!report || !report.is_published || report.ai_status !== 'completed' || !report.ai_enhanced_html) {
    return (
      <div className={styles.unavailable}>
        <div className={styles.unavailableCard}>
          <div className={styles.unavailableIcon}>🔒</div>
          <h1 className={styles.unavailableTitle}>This report is not available</h1>
          <p className={styles.unavailableText}>
            This report may have been unpublished, removed, or is still being processed.
            Please contact your account manager for access.
          </p>
          <a href="https://www.shtudio.com.au" className={styles.unavailableLink}>
            www.shtudio.com.au
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sharePage}>
      <DownloadButton />
      <div
        className={styles.reportContainer}
        dangerouslySetInnerHTML={{ __html: report.ai_enhanced_html }}
      />
    </div>
  );
}
