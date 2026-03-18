import { createServerSupabase } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { Button } from '@/components/Button/Button';
import Link from 'next/link';
import styles from './page.module.css';

export default async function ClientsPage() {
  const supabase = await createServerSupabase();

  const { data: clients } = await supabase
    .from('clients')
    .select('*, reports(count)')
    .order('name');

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.heading}>Clients</h1>
        <Link href="/admin/clients/new">
          <Button>+ New Client</Button>
        </Link>
      </div>

      <div className={styles.grid}>
        {clients && clients.length > 0 ? (
          clients.map((client: any) => (
            <Link
              key={client.id}
              href={`/admin/clients/${client.id}`}
              className={styles.clientCard}
            >
              <div className={styles.clientHeader}>
                {client.logo_url ? (
                  <img
                    src={client.logo_url}
                    alt={`${client.name} logo`}
                    className={styles.clientLogo}
                  />
                ) : (
                  <div className={styles.clientLogoPlaceholder}>
                    {client.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w: string) => w[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                )}
                <h3 className={styles.clientName}>{client.name}</h3>
              </div>
              <div className={styles.clientMeta}>
                {client.primary_contact_email || 'No contact set'}
              </div>
              <div className={styles.clientFooter}>
                <span className={styles.reportCount}>
                  {client.reports?.[0]?.count || 0} reports
                </span>
                <StatusBadge status={client.is_active ? 'active' : 'inactive'} />
              </div>
            </Link>
          ))
        ) : (
          <div className={styles.empty}>
            No clients yet. Create your first client to get started.
          </div>
        )}
      </div>
    </>
  );
}
