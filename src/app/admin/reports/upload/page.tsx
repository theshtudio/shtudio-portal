'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import { Input } from '@/components/Input/Input';
import type { Client } from '@/lib/types';
import styles from './page.module.css';

// --- Filename parser ---

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseFilename(filename: string) {
  const name = filename.replace(/\.pdf$/i, '').trim();

  // Find month
  const monthPattern = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\b`, 'i');
  const monthMatch = name.match(monthPattern);

  // Find year — prefer 4-digit, fall back to 2-digit near a month
  const year4Match = name.match(/\b(20\d{2})\b/);
  let year: number | null = null;
  let yearRaw: string | null = null;

  if (year4Match) {
    year = parseInt(year4Match[1], 10);
    yearRaw = year4Match[1];
  } else {
    // Look for 2-digit number (20-39) near the month
    const year2Match = name.match(/\b(\d{2})\b/g);
    if (year2Match) {
      for (const candidate of year2Match) {
        const n = parseInt(candidate, 10);
        if (n >= 20 && n <= 39) {
          year = 2000 + n;
          yearRaw = candidate;
          break;
        }
      }
    }
  }

  const month: number | null = monthMatch ? MONTHS[monthMatch[1].toLowerCase()] : null;

  // Build cleaned title — expand 2-digit year to 4-digit
  let title = name;
  if (year && yearRaw && yearRaw.length === 2) {
    title = name.replace(new RegExp(`\\b${yearRaw}\\b`), String(year));
  }
  title = title.replace(/[\s\-–—]+$/, '').replace(/^[\s\-–—]+/, '').trim();

  // Build period dates
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  if (month !== null && year !== null) {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    periodStart = start.toISOString().split('T')[0];
    periodEnd = end.toISOString().split('T')[0];
  }

  return { title, periodStart, periodEnd };
}

// --- Auto-fill tracking ---

interface AutoFilled {
  title: boolean;
  periodStart: boolean;
  periodEnd: boolean;
}

export default function UploadReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState(searchParams.get('client') || '');
  const [title, setTitle] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoFilled, setAutoFilled] = useState<AutoFilled>({
    title: false, periodStart: false, periodEnd: false,
  });

  // --- Progress simulation ---
  const PROGRESS_STAGES = [
    { label: 'Uploading PDF...', target: 15 },
    { label: 'Extracting report data...', target: 40 },
    { label: 'Claude is analysing your report...', target: 70 },
    { label: 'Generating enhanced HTML report...', target: 90 },
    { label: 'Saving report...', target: 100 },
  ];
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgress = useCallback(() => {
    setProgress(0);
    setProgressStage(0);

    // Total simulated time ~45s, tick every 400ms = ~112 ticks
    // We advance through stages automatically
    let current = 0;
    let stage = 0;
    const tick = () => {
      // Determine the ceiling for this stage
      const ceiling = PROGRESS_STAGES[stage]?.target ?? 100;
      // Slow down as we approach each ceiling
      const remaining = ceiling - current;
      const increment = Math.max(0.15, remaining * 0.04);
      current = Math.min(current + increment, ceiling - 0.5);

      // Move to next stage when close enough (within 1%)
      if (current >= ceiling - 1 && stage < PROGRESS_STAGES.length - 1) {
        stage += 1;
        setProgressStage(stage);
      }

      setProgress(Math.round(current * 10) / 10);
    };

    progressRef.current = setInterval(tick, 400);
  }, []);

  const stopProgress = useCallback((success: boolean) => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
    if (success) {
      setProgress(100);
      setProgressStage(PROGRESS_STAGES.length - 1);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  useEffect(() => {
    async function loadClients() {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (data) setClients(data);
    }
    loadClients();
  }, [supabase]);

  // Auto-fill from filename when a file is selected
  const handleFileSelected = useCallback((selected: File) => {
    setFile(selected);

    const parsed = parseFilename(selected.name);
    const filled: AutoFilled = { title: false, periodStart: false, periodEnd: false };

    if (parsed.title) {
      setTitle(parsed.title);
      filled.title = true;
    }
    if (parsed.periodStart) {
      setPeriodStart(parsed.periodStart);
      filled.periodStart = true;
    }
    if (parsed.periodEnd) {
      setPeriodEnd(parsed.periodEnd);
      filled.periodEnd = true;
    }

    setAutoFilled(filled);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.type === 'application/pdf') {
        handleFileSelected(dropped);
      } else {
        setError('Only PDF files are accepted.');
      }
    }
  }, [handleFileSelected]);

  // Clear auto-filled flag when user manually edits a field
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    if (autoFilled.title) setAutoFilled(prev => ({ ...prev, title: false }));
  }
  function handlePeriodStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPeriodStart(e.target.value);
    if (autoFilled.periodStart) setAutoFilled(prev => ({ ...prev, periodStart: false }));
  }
  function handlePeriodEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPeriodEnd(e.target.value);
    if (autoFilled.periodEnd) setAutoFilled(prev => ({ ...prev, periodEnd: false }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !selectedClient || !title) {
      setError('Please fill all required fields and upload a PDF.');
      return;
    }

    setError('');
    setLoading(true);
    startProgress();

    try {
      // Upload PDF via server-side route (service role bypasses storage RLS)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientId', selectedClient);

      const uploadRes = await fetch('/api/reports/upload', {
        method: 'POST',
        body: formData,
      });

      const { filePath, error: uploadError } = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadError || 'Failed to upload PDF');

      // Create report record server-side (service role bypasses RLS)
      const res = await fetch('/api/reports/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClient,
          title,
          period_start: periodStart || null,
          period_end: periodEnd || null,
          pdf_storage_path: filePath,
          custom_instructions: customInstructions || null,
        }),
      });

      const { report, error: apiError } = await res.json();
      if (!res.ok) throw new Error(apiError || 'Failed to create report');

      // Trigger AI enhancement
      await fetch('/api/reports/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id }),
      });

      stopProgress(true);
      router.push(`/admin/reports/${report.id}`);
      router.refresh();
    } catch (err: any) {
      stopProgress(false);
      setError(err.message || 'Failed to upload report.');
      setLoading(false);
    }
  }

  const handleCancel = () => {
    stopProgress(false);
    setLoading(false);
  };

  if (loading) {
    const currentStage = PROGRESS_STAGES[progressStage];
    return (
      <>
        <h1 className={styles.heading}>Upload Report</h1>
        <div className={styles.progressCard}>
          <div className={styles.progressIcon}>
            <svg className={styles.progressSpinner} viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
              <circle cx="25" cy="25" r="20" fill="none" stroke="#F26522" strokeWidth="4"
                strokeDasharray="80 126" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.progressStatus}>{currentStage?.label}</div>
          <div className={styles.progressBarTrack}>
            <div className={styles.progressBarFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.progressPercent}>{Math.round(progress)}%</div>
          <div className={styles.progressStages}>
            {PROGRESS_STAGES.map((stage, i) => (
              <div
                key={stage.label}
                className={`${styles.progressStageItem} ${
                  i < progressStage ? styles.progressStageDone :
                  i === progressStage ? styles.progressStageActive : ''
                }`}
              >
                <span className={styles.progressStageDot}>
                  {i < progressStage ? '\u2713' : (i + 1)}
                </span>
                <span>{stage.label.replace('...', '')}</span>
              </div>
            ))}
          </div>
          {file && (
            <div className={styles.progressFile}>{file.name}</div>
          )}
          <div className={styles.progressActions}>
            <Button type="button" variant="secondary" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.heading}>Upload Report</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label}>PDF File *</label>
          <div
            className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={styles.dropzoneIcon}>📄</div>
            <div className={styles.dropzoneText}>
              Drag and drop your PDF here, or{' '}
              <span className={styles.dropzoneHighlight}>click to browse</span>
            </div>
            {file && <div className={styles.fileName}>{file.name}</div>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
              }}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Client *</label>
          <select
            className={styles.select}
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            required
          >
            <option value="">Select a client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <Input
          label="Report Title *"
          value={title}
          onChange={handleTitleChange}
          placeholder="e.g. Monthly Performance Report - March 2024"
          hint={autoFilled.title ? 'auto-filled' : undefined}
          required
        />

        <div className={styles.row}>
          <Input
            label="Period Start"
            type="date"
            value={periodStart}
            onChange={handlePeriodStartChange}
            hint={autoFilled.periodStart ? 'auto-filled' : undefined}
          />
          <Input
            label="Period End"
            type="date"
            value={periodEnd}
            onChange={handlePeriodEndChange}
            hint={autoFilled.periodEnd ? 'auto-filled' : undefined}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Custom Instructions for AI (optional)</label>
          <textarea
            className={styles.textarea}
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="e.g. Emphasise ROAS performance, suggest budget increases for top campaigns, keep language simple for non-technical clients..."
            rows={3}
          />
        </div>

        <div className={styles.actions}>
          <Button type="submit">
            Upload & Process
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
