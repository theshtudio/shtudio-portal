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
  pendingUserIds: string[];
}

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
  pendingUserIds,
}: UsersPageClientProps) {
  const router = useRouter();
  const [admins, setAdmins] = useState<Profile[]>(initialAdmins);
  const [showInvite, setShowInvite] = useState(false);
  const pendingSet = new Set(pendingUserIds);

  useEffect(() => {
    setAdmins(initialAdmins);
  }, [initialAdmins]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviting, setInviting] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resentId, setResentId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);

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
        body: JSON.stringify({ email: inviteEmail, full_name: inviteName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteError(json.error ?? 'Failed to send invite.');
        return;
      }
      setInviteSuccess(`Invitation sent to ${inviteEmail}.`);
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
          <div className={styles.actions}>
            <Button type="submit" loading={inviting}>
              Send Invite
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
              const isPending = pendingSet.has(p.id);
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
                    {isPending ? (
                      <div className={styles.statusCell}>
                        <span className={styles.pendingBadge}>Pending</span>
                        {isSuperAdmin && (
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
                        {resentId === p.id && (
                          <span className={styles.resentNote}>Sent ✓</span>
                        )}
                      </div>
                    ) : (
                      <span className={styles.activeBadge}>Active</span>
                    )}
                    {rowError?.id === p.id && (
                      <div className={styles.rowError}>{rowError.message}</div>
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
          isPending={pendingSet.has(manageProfile.id)}
          onClose={() => setManageId(null)}
          onUpdated={handleProfileUpdated}
          onDeleted={handleProfileDeleted}
        />
      )}
    </>
  );
}
