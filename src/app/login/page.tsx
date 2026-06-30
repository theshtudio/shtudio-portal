import Image from 'next/image';
import { LoginForm } from './LoginForm';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  not_authorised:
    'This Google account is not authorised. Contact your administrator to be added to the portal.',
  auth: 'Sign-in could not be completed. Please try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError = error ? ERROR_MESSAGES[error] ?? '' : '';

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Image src="/logo.png" alt="Shtudio" width={160} height={60} priority />
          <p className={styles.subtitle}>Client Portal</p>
        </div>

        <LoginForm initialError={initialError} />

        <p className={styles.footer}>
          Powered by Shtudio
        </p>
      </div>
    </div>
  );
}
