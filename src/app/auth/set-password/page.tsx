import Image from 'next/image';
import { SetPasswordForm } from './SetPasswordForm';
import styles from '../../login/page.module.css';

export const dynamic = 'force-dynamic';

export default function SetPasswordPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Image src="/logo.png" alt="Shtudio" width={160} height={60} priority />
          <p className={styles.subtitle}>Set your password</p>
        </div>

        <SetPasswordForm />

        <p className={styles.footer}>Powered by Shtudio</p>
      </div>
    </div>
  );
}
