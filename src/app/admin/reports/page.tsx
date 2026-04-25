import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { AllReportsTable } from './AllReportsTable';
import styles from './reports.module.css';

export default async function AllReportsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const adminSupabase = createServiceSupabase();

  const [{ data: reports }, { data: clients }, { data: profile }] = await Promise.all([
    adminSupabase
      .from('reports')
      .select('*, clients(id, name)')
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    user
      ? adminSupabase.from('profiles').select('role, can_delete_files').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const canDelete = profile?.role === 'admin' && profile?.can_delete_files === true;

  return (
    <>
      <h1 className={styles.heading}>All Reports</h1>
      <AllReportsTable
        initialReports={reports ?? []}
        clients={clients ?? []}
        canDelete={canDelete}
      />
    </>
  );
}
