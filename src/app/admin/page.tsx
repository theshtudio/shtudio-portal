import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { DashboardReportsTable } from './DashboardReportsTable';
import styles from './page.module.css';

export default async function AdminDashboard() {
  const supabase = await createServerSupabase();
  const adminSupabase = createServiceSupabase();

  const [
    { count: clientCount },
    { count: reportCount },
    { count: publishedCount },
    { count: processingCount },
    { data: reports },
    { data: clients },
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('reports').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('is_published', true),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('ai_status', 'processing'),
    adminSupabase
      .from('reports')
      .select('*, clients(id, name)')
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
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
        <DashboardReportsTable
          initialReports={reports ?? []}
          clients={clients ?? []}
        />
      </div>
    </>
  );
}
