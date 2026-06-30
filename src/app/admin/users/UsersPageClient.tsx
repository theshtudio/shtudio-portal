'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import { Input } from '@/components/Input/Input';
import type { Profile } from '@/lib/types';
import { ManageUserModal } from './ManageUserModal';
import styles from './page.module.css';

interface UsersPageClientProps {
  currentUserEmail: string;
  currentUserId: string;
  isSuperAdmin: boolean;
  initialAdmins: Profile[];
}

type SigninMethod = 'google' | 'password';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function UsersPageClient({
  currentUserEmail,
  currentUserId,
  isSuperAdmin,
  initialAdmins,
}: UsersPageClientProps) {
  const router = useRouter();
  const [admins, setAdmins] = useState<Profile[]>(initialAdmins);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    setAdmins(initialAdmins);
  }, [initialAdmins]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteMethod, setInviteMethod] = useState<SigninMethod>('google');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviting, setInviting] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resentId, setResentId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  // Map of user id → unix ms when the 30s spam guard expires
  const [resetCooldownUntil, setResetCooldownUntil] = useState<Record<string, number>>({});
  const [resetSentId, setResetSentId] = useState<string | null>(null);
  const [resetError, setResetError] = useState<{ id: string; message: string } | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);

  // Tick once a second while any cooldown is active so disabled buttons
  // re-enable themselves at the right moment.
  const [, setNow] = useState(0);
  useEffect(() => {
    const anyActive = Object.values(resetCooldownUntil).some((t) => t > Date.now());
    if (!anyActive) return;
    const interval = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [resetCooldownUntil]);

  async function handleSendPasswordReset(profile: Profile) {
    setResetError(null);
    setResetSentId(null);
    setResettingId(profile.id);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/send-password-reset`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResetError({
          id: profile.id,
          message: json.error ?? 'Failed to send password reset.',
        });
        return;
      }
      setResetSentId(profile.id);
      // 30-second spam guard
      setResetCooldownUntil((prev) => ({
        ...prev,
        [profile.id]: Date.now() + 30_000,
      }));
      // Clear the "✓ Sent" pill after 3s; cooldown timer continues
      setTimeout(() => {
        setResetSentId((id) => (id === profile.id ? null : id));
      }, 3000);
    } catch (err) {
      setResetError({
        id: profile.id,
        message: err instanceof Error ? err.message : 'Failed to send password reset.',
      });
    } finally {
      setResettingId(null);
    }
  }

  async function handleResend(profile: Profile) {
    setRowError(null);
    setResentId(null);
    setResendingId(profile.id);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/resend-invite`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRowError({ id: profile.id, message: json.error ?? 'Failed to resend invite.' });
        return;
      }
      setResentId(profile.id);
    } catch (err) {
      setRowError({
        id: profile.id,
        message: err instanceof Error ? err.message : 'Failed to resend invite.',
      });
    } finally {
      setResendingId(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviting(true);

    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteName,
          method: inviteMethod,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteError(json.error ?? 'Failed to send invite.');
        return;
      }
      setInviteSuccess(
        inviteMethod === 'google'
          ? `${inviteName || inviteEmail} added. They can now sign in at the portal with Google.`
          : `Invitation sent to ${inviteEmail}.`,
      );
      setInviteEmail('');
      setInviteName('');
      router.refresh();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  }

  function handleProfileUpdated(next: Profile) {
    setAdmins((prev) => prev.map((p) => (p.id === next.id ? { ...p, ...next } : p)));
  }

  function handleProfileDeleted(id: string) {
    setAdmins((prev) => prev.filter((p) => p.id !== id));
    setManageId(null);
    router.refresh();
  }

  const manageProfile = manageId ? admins.find((p) => p.id === manageId) ?? null : null;

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.heading}>Team</h1>
        {isSuperAdmin && (
          <Button onClick={() => setShowInvite((s) => !s)}>
            {showInvite ? 'Cancel' : '+ Invite User'}
          </Button>
        )}
      </div>

      {!isSuperAdmin && (
        <div className={styles.notice}>
          Only the super admin (alex@shtud.io) can invite new team members or manage user
          accounts.
        </div>
      )}

      {showInvite && isSuperAdmin && (
        <form className={styles.inviteForm} onSubmit={handleInvite}>
          {inviteError && <div className={styles.error}>{inviteError}</div>}
          {inviteSuccess && <div className={styles.success}>{inviteSuccess}</div>}
          <div className={styles.row}>
            <Input
              label="Name"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Full name"
              required
            />
            <Input
              label="Email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@shtud.io"
              required
            />
          </div>
          <fieldset className={styles.methodGroup}>
            <legend className={styles.methodLegend}>Sign-in method</legend>
            <label className={styles.methodOption}>
              <input
                type="radio"
                name="signin_method"
                value="google"
                checked={inviteMethod === 'google'}
                onChange={() => setInviteMethod('google')}
              />
              <span>
                <strong>Google</strong> — no email sent; tell them to sign in with Google
              </span>
            </label>
            <label className={styles.methodOption}>
              <input
                type="radio"
                name="signin_method"
                value="password"
                checked={inviteMethod === 'password'}
                onChange={() => setInviteMethod('password')}
              />
              <span>
                <strong>Email / password</strong> — sends an invite email to set a password
              </span>
            </label>
          </fieldset>
          <div className={styles.actions}>
            <Button type="submit" loading={inviting}>
              {inviteMethod === 'google' ? 'Add user' : 'Send Invite'}
            </Button>
          </div>
        </form>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Permissions</th>
              <th>Status</th>
              {isSuperAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 && (
              <tr>
                <td colSpan={isSuperAdmin ? 7 : 6} className={styles.empty}>
                  No admin users yet.
                </td>
              </tr>
            )}
            {admins.map((p) => {
              const isMe = p.email === currentUserEmail;
              const isSuper = p.email?.toLowerCase() === 'alex@shtud.io';
              const isPending = p.status === 'pending';
              const isGoogle = p.signin_method === 'google';

              // Resend Invite only applies to email/password invites — Google
              // users were never sent an email.
              const showResend = isPending && isSuperAdmin && !isGoogle;

              // Send Password Reset is super-admin-only, hidden for self (super
              // admin uses the regular forgot-password flow) and for Google
              // accounts (they have no password to reset).
              const showResetBtn = isSuperAdmin && !isMe && !isGoogle;
              const cooldownExpiry = resetCooldownUntil[p.id] ?? 0;
              const cooldownSecondsLeft = Math.max(
                0,
                Math.ceil((cooldownExpiry - Date.now()) / 1000),
              );
              const resetDisabled =
                resettingId === p.id || cooldownSecondsLeft > 0;
              const resetLabel =
                resettingId === p.id
                  ? 'Sending…'
                  : resetSentId === p.id
                    ? '✓ Sent'
                    : cooldownSecondsLeft > 0
                      ? `Wait ${cooldownSecondsLeft}s`
                      : 'Send Password Reset';

              return (
                <tr key={p.id}>
                  <td>
                    {p.full_name || '—'}
                    {isMe && <span className={styles.youBadge}>you</span>}
                  </td>
                  <td>{p.email}</td>
                  <td>
                    <span className={styles.roleBadge}>
                      {isSuper ? 'super admin' : 'admin'}
                    </span>
                  </td>
                  <td>{formatDate(p.created_at)}</td>
                  <td>
                    {p.can_delete_files
                      ? 'Full access (can delete files)'
                      : 'Limited (cannot delete files)'}
                  </td>
                  <td>
                    <div className={styles.statusCell}>
                      {isPending ? (
                        <span className={styles.pendingBadge}>Pending</span>
                      ) : (
                        <span className={styles.activeBadge}>Active</span>
                      )}
                      {showResend && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={resendingId === p.id}
                          onClick={() => handleResend(p)}
                        >
                          Resend Invite
                        </Button>
                      )}
                      {isPending && resentId === p.id && (
                        <span className={styles.resentNote}>Sent ✓</span>
                      )}
                      {showResetBtn && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={resettingId === p.id}
                          disabled={resetDisabled}
                          onClick={() => handleSendPasswordReset(p)}
                        >
                          {resetLabel}
                        </Button>
                      )}
                    </div>
                    {rowError?.id === p.id && !isSuperAdmin && (
                      <div className={styles.rowError}>{rowError.message}</div>
                    )}
                    {resetError?.id === p.id && (
                      <div className={styles.rowError}>{resetError.message}</div>
                    )}
                  </td>
                  {isSuperAdmin && (
                    <td>
                      <button
                        type="button"
                        className={styles.manageBtn}
                        onClick={() => setManageId(p.id)}
                      >
                        Manage
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {manageProfile && (
        <ManageUserModal
          profile={manageProfile}
          isSelf={manageProfile.id === currentUserId}
          isTargetSuperAdmin={manageProfile.email?.toLowerCase() === 'alex@shtud.io'}
          isPending={manageProfile.status === 'pending'}
          onClose={() => setManageId(null)}
          onUpdated={handleProfileUpdated}
          onDeleted={handleProfileDeleted}
        />
      )}
    </>
  );
}
