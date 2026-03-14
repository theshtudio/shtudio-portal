import { createServerSupabase } from '@/lib/supabase/server';
import { format } from 'date-fns';
import Link from 'next/link';
import styles from './page.module.css';

export default async function ClientDashboard() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // Get client for current user
  const { data: clientUser } = await supabase
    .from('client_users')
    .select('client_id')
    .eq('user_id', user!.id)
    .single();

  // Get published reports for this client
  // RLS ensures clients only see their published reports
  const { data: reports } = await supabase
    .from('reports')
    .select('id, title, period_start, period_end, published_at, created_at')
    .eq('client_id', clientUser?.client_id || '')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  return (
    <>
      <h1 className={styles.heading}>Your Reports</h1>
      <p className={styles.subtitle}>
        Access your latest performance reports and analytics insights.
      </p>

      <div className={styles.grid}>
        {reports && reports.length > 0 ? (
          reports.map((report) => (
            <Link
              key={report.id}
              href={`/dashboard/reports/${report.id}`}
              className={styles.reportCard}
            >
              <h3 className={styles.reportTitle}>{report.title}</h3>
              {report.period_start && report.period_end && (
                <div className={styles.reportPeriod}>
                  {format(new Date(report.period_start), 'MMM yyyy')} — {format(new Date(report.period_end), 'MMM yyyy')}
                </div>
              )}
              <div className={styles.reportFooter}>
                <span className={styles.reportDate}>
                  Published {format(new Date(report.published_at || report.created_at), 'dd MMM yyyy')}
                </span>
                <span className={styles.viewLink}>View Report →</span>
              </div>
            </Link>
          ))
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📊</div>
            <div className={styles.emptyText}>
              No reports available yet. Check back soon!
            </div>
          </div>
        )}
      </div>
    </>
  );
}
