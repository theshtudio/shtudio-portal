'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/Button/Button';
import { Input } from '@/components/Input/Input';
import type { Profile } from '@/lib/types';
import styles from './page.module.css';

interface ManageUserModalProps {
  profile: Profile;
  isSelf: boolean;
  isTargetSuperAdmin: boolean;
  onClose: () => void;
  onUpdated: (next: Profile) => void;
  onDeleted: (id: string) => void;
}

export function ManageUserModal({
  profile,
  isSelf,
  isTargetSuperAdmin,
  onClose,
  onUpdated,
  onDeleted,
}: ManageUserModalProps) {
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [email, setEmail] = useState(profile.email);
  const [canDelete, setCanDelete] = useState(profile.can_delete_files);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !confirmDelete && !saving && !deleting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmDelete, saving, deleting]);

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const nameChanged = trimmedName !== (profile.full_name ?? '').trim();
  const emailChanged = trimmedEmail !== profile.email.toLowerCase();
  const canEditEmail = !isTargetSuperAdmin;
  const dirty = nameChanged || (canEditEmail && emailChanged);

  async function handleSave() {
    setError('');
    setSuccess('');
    if (!trimmedName) {
      setError('Name cannot be empty.');
      return;
    }
    if (canEditEmail && (!trimmedEmail || !trimmedEmail.includes('@'))) {
      setError('A valid email is required.');
      return;
    }

    const update: Record<string, unknown> = {};
    if (nameChanged) update.full_name = trimmedName;
    if (canEditEmail && emailChanged) update.email = trimmedEmail;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Failed to save changes.');
        return;
      }
      onUpdated(json.profile as Profile);
      setSuccess('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleCanDelete(next: boolean) {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ can_delete_files: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Failed to update permission.');
        return;
      }
      setCanDelete(next);
      onUpdated(json.profile as Profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setError('');
    setSuccess('');
    setResetSent(false);
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}/send-password-reset`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Failed to send password reset.');
        return;
      }
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send password reset.');
    } finally {
      setResetting(false);
    }
  }

  async function handleDelete() {
    setError('');
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Failed to remove user.');
        setConfirmDelete(false);
        return;
      }
      onDeleted(profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  const displayName = trimmedName || profile.email;
  const busy = saving || resetting || deleting;

  return (
    <div className={styles.modalOverlay} onClick={() => !busy && !confirmDelete && onClose()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Manage user</h3>
            <p className={styles.modalSubtitle}>{profile.email}</p>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && !error && <div className={styles.success}>{success}</div>}

        <Input
          label="Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={saving}
        />
        <div style={{ height: 12 }} />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={saving || !canEditEmail}
          hint={!canEditEmail ? 'Super admin email cannot be changed.' : undefined}
        />

        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!dirty || busy}>
            Save Changes
          </Button>
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionTitle}>File deletion permission</div>
          <div className={styles.modalActionRow}>
            <label className={styles.toggleWrap}>
              <input
                type="checkbox"
                checked={canDelete}
                disabled={saving || isTargetSuperAdmin || isSelf}
                onChange={(e) => handleToggleCanDelete(e.target.checked)}
              />
              <span>{canDelete ? 'Can delete files' : 'Cannot delete files'}</span>
            </label>
          </div>
          {(isTargetSuperAdmin || isSelf) && (
            <p className={styles.modalNote}>
              {isTargetSuperAdmin
                ? 'The super admin always retains delete permission.'
                : 'You cannot change your own permissions.'}
            </p>
          )}
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionTitle}>Password</div>
          <div className={styles.modalActionRow}>
            <span className={styles.modalNote}>
              Send a recovery email so {displayName} can set a new password.
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResetPassword}
              loading={resetting}
              disabled={busy}
            >
              {resetSent ? 'Sent ✓' : 'Send Password Reset'}
            </Button>
          </div>
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionTitle}>Danger zone</div>
          <div className={styles.modalActionRow}>
            <span className={styles.modalNote}>
              Removes this user from the portal entirely.
            </span>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => setConfirmDelete(true)}
              disabled={busy || isSelf || isTargetSuperAdmin}
            >
              Delete User
            </button>
          </div>
          {(isSelf || isTargetSuperAdmin) && (
            <p className={styles.modalNote}>
              {isSelf
                ? 'You cannot remove your own account.'
                : 'The super admin cannot be removed.'}
            </p>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div
          className={styles.modalOverlay}
          onClick={() => !deleting && setConfirmDelete(false)}
          style={{ zIndex: 1100 }}
        >
          <div
            className={`${styles.modal} ${styles.modalConfirm}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Remove user</h3>
            <p className={styles.modalBody}>
              Are you sure you want to remove <strong>{displayName}</strong> from the portal?
              This cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <button
                type="button"
                className={styles.dangerBtnSolid}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Removing…' : 'Yes, Remove User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
