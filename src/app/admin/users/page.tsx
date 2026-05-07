import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/auth/superAdmin';
import type { Profile } from '@/lib/types';
import { UsersPageClient } from './UsersPageClient';

export default async function UsersPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/dashboard');

  const adminSupabase = createServiceSupabase();
  const { data: admins } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('role', 'admin')
    .order('created_at', { ascending: true });

  return (
    <UsersPageClient
      currentUserEmail={user.email ?? ''}
      isSuperAdmin={isSuperAdmin(user.email)}
      initialAdmins={(admins ?? []) as Profile[]}
    />
  );
}
