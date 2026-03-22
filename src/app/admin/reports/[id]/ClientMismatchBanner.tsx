'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import type { Client } from '@/lib/types';
import styles from './page.module.css';

interface ClientMismatchBannerProps {
  reportId: string;
  detectedClientName: string;
  currentClientName: string;
}

export function ClientMismatchBanner({
  reportId,
  detectedClientName,
  currentClientName,
}: ClientMismatchBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!showClientPicker) return;
    const supabase = createClient();
    supabase
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setClients(data as Client[]);
      });
  }, [showClientPicker]);

  async function handleDismiss() {
    setSaving(true);
    await fetch(`/api/reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismiss_mismatch: true }),
    });
    setDismissed(true);
    setSaving(false);
  }

  async function handleReassign() {
    if (!selectedClientId) return;
    setSaving(true);
    await fetch(`/api/reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: selectedClientId }),
    });
    setSaving(false);
    router.refresh();
  }

  if (dismissed) return null;

  // Parse mismatch type from detected_client_name
  const isTypeMismatch = detectedClientName.startsWith('TYPE_MISMATCH:');
  const hasBothMismatches = !isTypeMismatch && detectedClientName.includes('(report type:');

  let clientWarning: string | null = null;
  let typeWarning: string | null = null;

  if (isTypeMismatch) {
    const parts = detectedClientName.split(':');
    typeWarning = `This PDF appears to be a ${parts[1]} report but was uploaded as ${parts[2]}.`;
  } else if (hasBothMismatches) {
    const nameMatch = detectedClientName.match(/^(.+?)\s*\(report type:\s*(.+?),\s*selected:\s*(.+?)\)$/);
    if (nameMatch) {
      clientWarning = `The PDF appears to be for \u201c${nameMatch[1]}\u201d but this report is filed under \u201c${currentClientName}\u201d.`;
      typeWarning = `This PDF appears to be a ${nameMatch[2]} report but was uploaded as ${nameMatch[3]}.`;
    } else {
      clientWarning = `The PDF appears to be for \u201c${detectedClientName}\u201d but this report is filed under \u201c${currentClientName}\u201d.`;
    }
  } else {
    clientWarning = `The PDF appears to be for \u201c${detectedClientName}\u201d but this report is filed under \u201c${currentClientName}\u201d.`;
  }

  return (
    <div className={styles.mismatchBanner}>
      <div className={styles.mismatchIcon}>&#9888;&#65039;</div>
      <div className={styles.mismatchContent}>
        <div className={styles.mismatchText}>
          <strong>Mismatch detected</strong><br />
          {clientWarning && <>{clientWarning}<br /></>}
          {typeWarning && <>{typeWarning}<br /></>}
          Please verify you uploaded the correct file before publishing.
        </div>

        {showClientPicker ? (
          <div className={styles.mismatchPicker}>
            <select
              className={styles.mismatchSelect}
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              <option value="">Select the correct client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Button
              variant="primary"
              size="sm"
              onClick={handleReassign}
              disabled={!selectedClientId || saving}
            >
              {saving ? 'Saving...' : 'Reassign'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowClientPicker(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className={styles.mismatchActions}>
            <Button variant="secondary" size="sm" onClick={handleDismiss} disabled={saving}>
              {saving ? 'Saving...' : 'Yes, this is correct'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowClientPicker(true)}>
              Change client
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
