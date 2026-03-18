'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { ClientLogoUpload } from './ClientLogoUpload';
import styles from './page.module.css';

interface ClientData {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  industry: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface ClientDetailsProps {
  client: ClientData;
}

export function ClientDetails({ client }: ClientDetailsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    name: client.name,
    website: client.website || '',
    industry: client.industry || '',
    primary_contact_name: client.primary_contact_name || '',
    primary_contact_email: client.primary_contact_email || '',
    primary_contact_phone: client.primary_contact_phone || '',
  });

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCancel() {
    setForm({
      name: client.name,
      website: client.website || '',
      industry: client.industry || '',
      primary_contact_name: client.primary_contact_name || '',
      primary_contact_email: client.primary_contact_email || '',
      primary_contact_phone: client.primary_contact_phone || '',
    });
    setEditing(false);
    setErrorMsg('');
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setErrorMsg('Client name is required.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setEditing(false);
      setSuccessMsg('Client updated successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <ClientLogoUpload clientId={client.id} currentLogoUrl={client.logo_url} />
          {editing ? (
            <input
              className={styles.editInput}
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Client name"
            />
          ) : (
            <h1 className={styles.heading}>{client.name}</h1>
          )}
        </div>
        <div className={styles.headerActions}>
          <StatusBadge status={client.is_active ? 'active' : 'inactive'} />
          {!editing && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit Client
            </Button>
          )}
        </div>
      </div>

      {successMsg && <div className={styles.successMessage}>{successMsg}</div>}
      {errorMsg && <div className={styles.errorMessage}>{errorMsg}</div>}

      <div className={styles.grid}>
        <div className={styles.infoCard}>
          <h3 className={styles.infoTitle}>Client Details</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Website</span>
            {editing ? (
              <input
                className={styles.editInputSm}
                value={form.website}
                onChange={(e) => handleChange('website', e.target.value)}
                placeholder="https://example.com"
              />
            ) : (
              <span className={styles.infoValue}>{client.website || '—'}</span>
            )}
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Industry</span>
            {editing ? (
              <input
                className={styles.editInputSm}
                value={form.industry}
                onChange={(e) => handleChange('industry', e.target.value)}
                placeholder="e.g. Technology"
              />
            ) : (
              <span className={styles.infoValue}>{client.industry || '—'}</span>
            )}
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Slug</span>
            <span className={styles.infoValue}>{client.slug}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Created</span>
            <span className={styles.infoValue}>
              {new Date(client.created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        <div className={styles.infoCard}>
          <h3 className={styles.infoTitle}>Primary Contact</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Name</span>
            {editing ? (
              <input
                className={styles.editInputSm}
                value={form.primary_contact_name}
                onChange={(e) => handleChange('primary_contact_name', e.target.value)}
                placeholder="Contact name"
              />
            ) : (
              <span className={styles.infoValue}>{client.primary_contact_name || '—'}</span>
            )}
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Email</span>
            {editing ? (
              <input
                className={styles.editInputSm}
                type="email"
                value={form.primary_contact_email}
                onChange={(e) => handleChange('primary_contact_email', e.target.value)}
                placeholder="email@example.com"
              />
            ) : (
              <span className={styles.infoValue}>{client.primary_contact_email || '—'}</span>
            )}
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Phone</span>
            {editing ? (
              <input
                className={styles.editInputSm}
                type="tel"
                value={form.primary_contact_phone}
                onChange={(e) => handleChange('primary_contact_phone', e.target.value)}
                placeholder="+1 234 567 890"
              />
            ) : (
              <span className={styles.infoValue}>{client.primary_contact_phone || '—'}</span>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <div className={styles.editActions}>
          <Button size="sm" onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
          <Button size="sm" variant="secondary" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      )}
    </>
  );
}
