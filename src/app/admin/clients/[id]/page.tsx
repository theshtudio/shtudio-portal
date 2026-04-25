import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { ClientDetails } from './ClientDetails';
import { ClientFiles } from './ClientFiles';
import { ClientReports } from './ClientReports';
import Link from 'next/link';
import styles from './page.module.css';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const adminSupabase = createServiceSupabase();

  const { data: client } = await adminSupabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (!client) {
    return <div className={styles.notFound}>Client not found.</div>;
  }

  const [{ data: reports }, { data: profile }] = await Promise.all([
    adminSupabase
      .from('reports')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
    user
      ? adminSupabase.from('profiles').select('role, can_delete_files').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const canDelete = profile?.role === 'admin' && profile?.can_delete_files === true;

  return (
    <>
      <Link href="/admin/clients" className={styles.backLink}>
        ← Back to Clients
      </Link>

      <ClientDetails client={client} />

      <ClientFiles clientId={client.id} />

      <ClientReports
        clientId={client.id}
        initialReports={reports ?? []}
        canDelete={canDelete}
      />
    </>
  );
}
