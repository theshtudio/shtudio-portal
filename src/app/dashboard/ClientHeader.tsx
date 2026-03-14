'use client';

import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import styles from './layout.module.css';

interface ClientHeaderProps {
  profile: Profile;
  clientName: string;
}

export function ClientHeader({ profile, clientName }: ClientHeaderProps) {
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.logo}>Shtudio</span>
        <div className={styles.divider} />
        <span className={styles.clientName}>{clientName}</span>
      </div>
      <div className={styles.headerRight}>
        <span className={styles.userName}>{profile.full_name || profile.email}</span>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
