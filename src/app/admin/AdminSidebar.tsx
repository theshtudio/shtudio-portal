'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import styles from './layout.module.css';

interface AdminSidebarProps {
  profile: Profile;
}

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/clients', label: 'Clients', icon: '👥' },
  { href: '/admin/reports/upload', label: 'Upload Report', icon: '📄' },
];

export function AdminSidebar({ profile }: AdminSidebarProps) {
  const pathname = usePathname();
  const supabase = createClient();

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const initials = profile.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase()
    : profile.email[0].toUpperCase();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <Image src="/logo-white.png" alt="Shtudio" width={140} height={45} />
        <div className={styles.logoSub}>Admin Portal</div>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navLink} ${isActive(item.href) ? styles.navLinkActive : ''}`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.userInfo}>
          <div className={styles.userAvatar}>{initials}</div>
          <div>
            <div className={styles.userName}>{profile.full_name || 'Admin'}</div>
            <div className={styles.userEmail}>{profile.email}</div>
          </div>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
