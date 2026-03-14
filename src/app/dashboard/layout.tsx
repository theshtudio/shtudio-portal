import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ClientHeader } from './ClientHeader';
import styles from './layout.module.css';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'client') redirect('/admin');

  // Get the client info for this user
  const { data: clientUser } = await supabase
    .from('client_users')
    .select('*, clients(*)')
    .eq('user_id', user.id)
    .single();

  const client = clientUser?.clients as any;

  return (
    <div className={styles.layout}>
      <ClientHeader
        profile={profile}
        clientName={client?.name || 'Portal'}
      />
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
