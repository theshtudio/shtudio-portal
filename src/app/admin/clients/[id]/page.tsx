import { createServerSupabase } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { Button } from '@/components/Button/Button';
import { format } from 'date-fns';
import Link from 'next/link';
import styles from './page.module.css';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (!client) {
    return <div className={styles.notFound}>Client not found.</div>;
  }

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  return (
    <>
      <Link href="/admin/clients" className={styles.backLink}>
        ← Back to Clients
      </Link>

      <div className={styles.header}>
        <h1 className={styles.heading}>{client.name}</h1>
        <div className={styles.headerActions}>
          <StatusBadge status={client.is_active ? 'active' : 'inactive'} />
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.infoCard}>
          <h3 className={styles.infoTitle}>Client Details</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Website</span>
            <span className={styles.infoValue}>{client.website || '—'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Slug</span>
            <span className={styles.infoValue}>{client.slug}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Created</span>
            <span className={styles.infoValue}>
              {format(new Date(client.created_at), 'dd MMM yyyy')}
            </span>
          </div>
        </div>

        <div className={styles.infoCard}>
          <h3 className={styles.infoTitle}>Primary Contact</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Name</span>
            <span className={styles.infoValue}>{client.primary_contact_name || '—'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Email</span>
            <span className={styles.infoValue}>{client.primary_contact_email || '—'}</span>
          </div>
          {client.notes && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Notes</span>
              <span className={styles.infoValue}>{client.notes}</span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.reportsSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Reports</h2>
          <Link href={`/admin/reports/upload?client=${client.id}`}>
            <Button size="sm">Upload Report</Button>
          </Link>
        </div>

        {reports && reports.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Period</th>
                <th>AI Status</th>
                <th>Published</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>
                    <Link href={`/admin/reports/${report.id}`} className={styles.reportLink}>
                      {report.title}
                    </Link>
                  </td>
                  <td>
                    {report.period_start && report.period_end
                      ? `${format(new Date(report.period_start), 'MMM yyyy')} - ${format(new Date(report.period_end), 'MMM yyyy')}`
                      : '—'}
                  </td>
                  <td><StatusBadge status={report.ai_status as any} /></td>
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
            No reports for this client yet.
          </div>
        )}
      </div>
    </>
  );
}
