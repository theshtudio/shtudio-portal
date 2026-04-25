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
  { href: '/admin/reports', label: 'All Reports', icon: '📋', exact: false, excludePrefix: '/admin/reports/upload' },
  { href: '/admin/reports/upload', label: 'Upload Report', icon: '📄' },
  { href: '/admin/knowledge-base', label: 'Knowledge Base', icon: '📚' },
];

export function AdminSidebar({ profile }: AdminSidebarProps) {
  const pathname = usePathname();
  const supabase = createClient();

  const isActive = (item: typeof navItems[number]) => {
    if (item.href === '/admin') return pathname === '/admin';
    if ('excludePrefix' in item && item.excludePrefix && pathname.startsWith(item.excludePrefix)) return false;
    return pathname.startsWith(item.href);
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
            className={`${styles.navLink} ${isActive(item) ? styles.navLinkActive : ''}`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <Link
          href="/admin/help"
          className={`${styles.navLink} ${pathname.startsWith('/admin/help') ? styles.navLinkActive : ''}`}
        >
          <span className={styles.navIcon}>❓</span>
          Help & Best Practices
        </Link>
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
