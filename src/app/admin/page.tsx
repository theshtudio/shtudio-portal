import { createServerSupabase } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { format } from 'date-fns';
import Link from 'next/link';
import styles from './page.module.css';

export default async function AdminDashboard() {
  const supabase = await createServerSupabase();

  const [
    { count: clientCount },
    { count: reportCount },
    { count: publishedCount },
    { count: processingCount },
    { data: recentReports },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('reports').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('is_published', true),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('ai_status', 'processing'),
    supabase
      .from('reports')
      .select('*, clients(name, slug)')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return (
    <>
      <h1 className={styles.heading}>Dashboard</h1>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Clients</div>
          <div className={`${styles.statValue} ${styles.statAccent}`}>{clientCount || 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Reports</div>
          <div className={styles.statValue}>{reportCount || 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Published</div>
          <div className={styles.statValue}>{publishedCount || 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Processing</div>
          <div className={styles.statValue}>{processingCount || 0}</div>
        </div>
      </div>

      <div className={styles.recentSection}>
        <h2 className={styles.sectionTitle}>Recent Reports</h2>
        {recentReports && recentReports.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Report</th>
                <th>Client</th>
                <th>AI Status</th>
                <th>Published</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentReports.map((report: any) => (
                <tr key={report.id}>
                  <td>
                    <Link href={`/admin/reports/${report.id}`} className={styles.reportLink}>
                      {report.title}
                    </Link>
                  </td>
                  <td>{report.clients?.name || '—'}</td>
                  <td><StatusBadge status={report.ai_status} /></td>
                  <td>
                    <StatusBadge status={report.is_published ? 'published' : 'draft'} />
                  </td>
                  <td>{format(new Date(report.created_at), 'dd MMM yyyy')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            No reports yet. Upload your first PDF to get started.
          </div>
        )}
      </div>
    </>
  );
}
