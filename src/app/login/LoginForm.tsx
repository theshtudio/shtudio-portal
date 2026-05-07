'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import { Input } from '@/components/Input/Input';
import styles from './page.module.css';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const message = /invalid login credentials/i.test(error.message)
        ? 'That email and password combination did not work. If you have not been invited to the portal, please contact your administrator — self sign-up is disabled.'
        : error.message;
      setError(message);
      setLoading(false);
      return;
    }

    window.location.href = '/';
  }

  return (
    <form className={styles.form} onSubmit={handleLogin}>
      {error && <div className={styles.error}>{error}</div>}

      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
      />

      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Your password"
        required
      />

      <Button type="submit" fullWidth loading={loading}>
        Sign In
      </Button>
    </form>
  );
}
