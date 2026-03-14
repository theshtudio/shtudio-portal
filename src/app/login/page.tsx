import Image from 'next/image';
import { LoginForm } from './LoginForm';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Image src="/logo.png" alt="Shtudio" width={160} height={60} priority />
          <p className={styles.subtitle}>Client Portal</p>
        </div>

        <LoginForm />

        <p className={styles.footer}>
          Powered by Shtudio
        </p>
      </div>
    </div>
  );
}
