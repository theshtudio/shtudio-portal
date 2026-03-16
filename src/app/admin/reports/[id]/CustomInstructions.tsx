'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import styles from './page.module.css';

interface CustomInstructionsProps {
  reportId: string;
  initialValue: string;
}

export function CustomInstructions({ reportId, initialValue }: CustomInstructionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const hasChanged = value !== initialValue;

  async function handleSave() {
    setSaving(true);
    await supabase
      .from('reports')
      .update({ custom_instructions: value || null })
      .eq('id', reportId);
    setSaving(false);
    router.refresh();
  }

  async function handleSaveAndReprocess() {
    setReprocessing(true);

    // Save instructions first
    await supabase
      .from('reports')
      .update({ custom_instructions: value || null })
      .eq('id', reportId);

    // Trigger re-processing
    await fetch('/api/reports/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId }),
    });

    setReprocessing(false);
    router.refresh();
  }

  return (
    <div className={styles.instructionsSection}>
      <div className={styles.instructionsHeader}>
        <h2 className={styles.sectionTitle}>Custom Instructions</h2>
      </div>
      <div className={styles.instructionsCard}>
        <textarea
          className={styles.instructionsTextarea}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Emphasise ROAS performance, suggest budget increases for top campaigns, keep language simple for non-technical clients..."
          rows={3}
        />
        <div className={styles.instructionsActions}>
          <Button size="sm" variant="secondary" onClick={handleSave} loading={saving} disabled={!hasChanged}>
            Save
          </Button>
          <Button size="sm" onClick={handleSaveAndReprocess} loading={reprocessing}>
            Save & Re-process
          </Button>
        </div>
      </div>
    </div>
  );
}
