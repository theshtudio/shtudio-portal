'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import { Input } from '@/components/Input/Input';
import styles from '../../login/page.module.css';

export function SetPasswordForm() {
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Supabase invite links land here with the session encoded in the URL hash
    // (#access_token=...&refresh_token=...). The browser client picks it up
    // asynchronously via detectSessionInUrl, so we wait for the auth event
    // before deciding the link is invalid.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        setHasSession(true);
        setError('');
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.user) {
        setHasSession(true);
        setReady(true);
        return;
      }
      // Give the client a moment to consume an implicit-flow hash, then give up.
      setTimeout(() => {
        if (cancelled) return;
        supabase.auth.getSession().then(({ data: retry }) => {
          if (cancelled) return;
          if (retry.session?.user) {
            setHasSession(true);
          } else {
            setError('Your invitation link has expired or is invalid. Please ask for a new invite.');
          }
          setReady(true);
        });
      }, 500);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    window.location.href = '/admin';
  }

  if (!ready) return null;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}

      <Input
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
        required
        disabled={!hasSession}
      />

      <Input
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repeat your password"
        required
        disabled={!hasSession}
      />

      <Button type="submit" fullWidth loading={loading} disabled={!hasSession}>
        Set password & continue
      </Button>
    </form>
  );
}
