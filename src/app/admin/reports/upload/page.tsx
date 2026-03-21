'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import { Input } from '@/components/Input/Input';
import { HelpTooltip } from '@/components/Tooltip/Tooltip';
import {
  REPORT_TYPES,
  GLOBAL_OPTIONS,
  getCombinedOptions,
  type ReportType,
  type ReportOption,
} from '@/lib/reportTypeConfig';
import type { Client, ClientFile } from '@/lib/types';
import styles from './page.module.css';

// --- Filename parser ---

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx';
const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function parseFilename(filename: string) {
  const name = filename.replace(/\.(pdf|docx?|xlsx?)$/i, '').trim();

  const monthPattern = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\b`, 'i');
  const monthMatch = name.match(monthPattern);

  const year4Match = name.match(/\b(20\d{2})\b/);
  let year: number | null = null;
  let yearRaw: string | null = null;

  if (year4Match) {
    year = parseInt(year4Match[1], 10);
    yearRaw = year4Match[1];
  } else {
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

  let title = name;
  if (year && yearRaw && yearRaw.length === 2) {
    title = name.replace(new RegExp(`\\b${yearRaw}\\b`), String(year));
  }
  title = title.replace(/[\s\-–—]+$/, '').replace(/^[\s\-–—]+/, '').trim();

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// All report type buttons including combined
const ALL_REPORT_TYPE_BUTTONS: { key: ReportType; displayName: string }[] = [
  ...REPORT_TYPES.map((rt) => ({ key: rt.key, displayName: rt.displayName })),
  { key: 'combined' as ReportType, displayName: 'Combined Report' },
];

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
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoFilled, setAutoFilled] = useState<AutoFilled>({
    title: false, periodStart: false, periodEnd: false,
  });

  // Report type & options
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [sectionOptions, setSectionOptions] = useState<ReportOption[]>([]);
  const [globalOptions, setGlobalOptions] = useState<ReportOption[]>(
    GLOBAL_OPTIONS.map((o) => ({ ...o })),
  );
  // For combined report, track platform selection and grouped options
  const [selectedPlatforms, setSelectedPlatforms] = useState<ReportType[]>([]);
  const [combinedGroups, setCombinedGroups] = useState<
    { platform: string; key: ReportType; options: ReportOption[] }[]
  >([]);

  // Client files
  const [clientFiles, setClientFiles] = useState<ClientFile[]>([]);
  const [selectedClientFileIds, setSelectedClientFileIds] = useState<string[]>([]);
  const [loadingClientFiles, setLoadingClientFiles] = useState(false);

  // --- Progress simulation ---
  const PROGRESS_STAGES = [
    { label: 'Uploading files...', target: 15 },
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

    let current = 0;
    let stage = 0;
    const tick = () => {
      const ceiling = PROGRESS_STAGES[stage]?.target ?? 100;
      const remaining = ceiling - current;
      const increment = Math.max(0.15, remaining * 0.04);
      current = Math.min(current + increment, ceiling - 0.5);

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

  // Fetch client files when client changes
  useEffect(() => {
    if (!selectedClient) {
      setClientFiles([]);
      setSelectedClientFileIds([]);
      return;
    }

    async function loadClientFiles() {
      setLoadingClientFiles(true);
      try {
        const res = await fetch(`/api/clients/${selectedClient}/files`);
        if (res.ok) {
          const data = await res.json();
          setClientFiles(data.files || []);
        }
      } catch {
        // Ignore - client files are optional context
      } finally {
        setLoadingClientFiles(false);
      }
    }
    loadClientFiles();
    setSelectedClientFileIds([]);
  }, [selectedClient]);

  // When report type changes, initialise the options
  function handleReportTypeChange(type: ReportType) {
    setReportType(type);

    if (type === 'combined') {
      setSectionOptions([]);
      setCombinedGroups([]);
      setSelectedPlatforms([]);
    } else {
      const typeInfo = REPORT_TYPES.find((rt) => rt.key === type);
      setSectionOptions(typeInfo ? typeInfo.options.map((o) => ({ ...o })) : []);
      setCombinedGroups([]);
      setSelectedPlatforms([]);
    }

    // Reset global options to defaults
    setGlobalOptions(GLOBAL_OPTIONS.map((o) => ({ ...o })));
  }

  // Toggle a platform in combined mode
  function togglePlatform(platformKey: ReportType) {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(platformKey)
        ? prev.filter((k) => k !== platformKey)
        : [...prev, platformKey];

      // Rebuild combined groups for selected platforms only
      const groups = getCombinedOptions()
        .filter((_, i) => next.includes(REPORT_TYPES[i].key))
        .map((g, _i) => {
          const rt = REPORT_TYPES.find((r) => r.displayName === g.platform);
          return { ...g, key: rt!.key };
        });

      // Preserve existing checked state for groups that were already showing
      const existingByPlatform = new Map(
        combinedGroups.map((cg) => [cg.platform, cg]),
      );
      const merged = groups.map((g) => {
        const existing = existingByPlatform.get(g.platform);
        if (existing) return existing;
        return g;
      });

      setCombinedGroups(merged);
      return next;
    });
  }

  function toggleSectionOption(index: number) {
    setSectionOptions((prev) =>
      prev.map((o, i) => (i === index ? { ...o, checked: !o.checked } : o)),
    );
  }

  function toggleCombinedOption(groupIndex: number, optionIndex: number) {
    setCombinedGroups((prev) =>
      prev.map((g, gi) =>
        gi === groupIndex
          ? {
              ...g,
              options: g.options.map((o, oi) =>
                oi === optionIndex ? { ...o, checked: !o.checked } : o,
              ),
            }
          : g,
      ),
    );
  }

  function toggleGlobalOption(index: number) {
    setGlobalOptions((prev) =>
      prev.map((o, i) => (i === index ? { ...o, checked: !o.checked } : o)),
    );
  }

  function isAcceptedFile(file: File): boolean {
    return ACCEPTED_TYPES.includes(file.type);
  }

  // Auto-fill from first filename when files are selected
  const handleFilesSelected = useCallback((selected: File[]) => {
    const valid = selected.filter(isAcceptedFile);
    if (valid.length === 0) {
      setError('Only PDF, Word, and Excel files are accepted.');
      return;
    }
    if (valid.length < selected.length) {
      setError('Some files were skipped (unsupported type). Accepted: PDF, Word, Excel.');
    }

    setFiles((prev) => [...prev, ...valid]);

    // Auto-fill from first file if no title yet
    if (!title && valid[0]) {
      const parsed = parseFilename(valid[0].name);
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
    }
  }, [title]);

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

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

    if (e.dataTransfer.files?.length) {
      handleFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, [handleFilesSelected]);

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

  function toggleClientFile(fileId: string) {
    setSelectedClientFileIds((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId],
    );
  }

  // Collect all selected options for submission
  function getSelectedOptions(): { sections: string[]; adminOnlySections: string[]; globals: string[] } {
    const sections: string[] = [];
    const adminOnlySections: string[] = [];
    const globals: string[] = [];

    if (reportType === 'combined') {
      for (const group of combinedGroups) {
        for (const opt of group.options) {
          if (opt.checked) {
            const prefixed = `[${group.platform}] ${opt.label}`;
            if (opt.adminOnly) {
              adminOnlySections.push(prefixed);
            } else {
              sections.push(prefixed);
            }
          }
        }
      }
    } else {
      for (const opt of sectionOptions) {
        if (opt.checked) {
          if (opt.adminOnly) {
            adminOnlySections.push(opt.label);
          } else {
            sections.push(opt.label);
          }
        }
      }
    }

    for (const opt of globalOptions) {
      if (opt.checked) globals.push(opt.label);
    }

    return { sections, adminOnlySections, globals };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reportType) {
      setError('Please select a report type.');
      return;
    }
    if (files.length === 0 || !selectedClient || !title) {
      setError('Please fill all required fields and upload at least one file.');
      return;
    }

    setError('');
    setLoading(true);
    startProgress();

    try {
      // Upload files via server-side route
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      formData.append('clientId', selectedClient);

      const uploadRes = await fetch('/api/reports/upload', {
        method: 'POST',
        body: formData,
      });

      const { filePath, filePaths, error: uploadError } = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadError || 'Failed to upload files');

      const { sections, adminOnlySections, globals } = getSelectedOptions();

      // Create report record server-side
      const res = await fetch('/api/reports/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClient,
          title,
          period_start: periodStart || null,
          period_end: periodEnd || null,
          pdf_storage_path: filePath,
          pdf_storage_paths: filePaths || null,
          custom_instructions: customInstructions || null,
          client_file_ids: selectedClientFileIds.length > 0 ? selectedClientFileIds : null,
          report_type: reportType,
          report_options: { sections, adminOnlySections, globals },
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
          {files.length > 0 && (
            <div className={styles.progressFile}>
              {files.map((f) => f.name).join(', ')}
            </div>
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

        {/* Step 1 — Report Type Selector */}
        <div className={styles.field}>
          <label className={styles.label}>Report Type *</label>
          <div className={styles.typeGrid}>
            {ALL_REPORT_TYPE_BUTTONS.map((rt) => (
              <button
                key={rt.key}
                type="button"
                className={`${styles.typeBtn} ${reportType === rt.key ? styles.typeBtnActive : ''}`}
                onClick={() => handleReportTypeChange(rt.key)}
              >
                {rt.displayName}
              </button>
            ))}
          </div>
        </div>

        {/* Rest of the form only shows after type is selected */}
        {reportType && (
          <>
            {/* Combined: platform selector sub-step */}
            {reportType === 'combined' && (
              <div className={styles.field}>
                <label className={styles.label}>Select platforms to include:</label>
                <div className={styles.platformPills}>
                  {REPORT_TYPES.map((rt) => (
                    <button
                      key={rt.key}
                      type="button"
                      className={`${styles.platformPill} ${selectedPlatforms.includes(rt.key) ? styles.platformPillActive : ''}`}
                      onClick={() => togglePlatform(rt.key)}
                    >
                      {rt.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2 — Dynamic Section Checkboxes */}
            {(reportType !== 'combined' || selectedPlatforms.length > 0) && (
            <div className={styles.field}>
              <label className={styles.label}>Report Sections</label>
              <p className={styles.fieldHint}>
                Pre-selected options are recommended defaults — adjust as needed.
              </p>

              {reportType === 'combined' ? (
                <div className={styles.optionsGrouped}>
                  {combinedGroups.map((group, gi) => (
                    <div key={group.platform} className={styles.optionsGroup}>
                      <div className={styles.optionsGroupTitle}>{group.platform}</div>
                      {group.options.map((opt, oi) => (
                        <label key={opt.label} className={styles.optionCheck}>
                          <input
                            type="checkbox"
                            checked={opt.checked}
                            onChange={() => toggleCombinedOption(gi, oi)}
                          />
                          <span className={styles.optionLabel}>
                            {opt.label}
                            {opt.adminOnly && (
                              <span className={styles.adminBadge}>Admin only</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.optionsList}>
                  {sectionOptions.map((opt, i) => (
                    <label key={opt.label} className={styles.optionCheck}>
                      <input
                        type="checkbox"
                        checked={opt.checked}
                        onChange={() => toggleSectionOption(i)}
                      />
                      <span className={styles.optionLabel}>
                        {opt.label}
                        {opt.adminOnly && (
                          <span className={styles.adminBadge}>Admin only</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Global Options */}
            <div className={styles.field}>
              <label className={styles.label}>Global Options</label>
              <div className={styles.optionsList}>
                {globalOptions.map((opt, i) => (
                  <label key={opt.label} className={styles.optionCheck}>
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={() => toggleGlobalOption(i)}
                    />
                    <span className={styles.optionLabel}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* File Upload */}
            <div className={styles.field}>
              <label className={styles.label}>
                Report Files *
                <HelpTooltip text="Upload the raw PDF or export from Google Ads, GA, or other platforms. Multiple files can be combined into one report." />
              </label>
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
                  Drag and drop your files here, or{' '}
                  <span className={styles.dropzoneHighlight}>click to browse</span>
                </div>
                <div className={styles.dropzoneHint}>PDF, Word, or Excel files</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleFilesSelected(Array.from(e.target.files));
                      e.target.value = '';
                    }
                  }}
                />
              </div>

              {files.length > 0 && (
                <div className={styles.fileList}>
                  {files.map((file, i) => (
                    <div key={`${file.name}-${i}`} className={styles.fileItem}>
                      <span className={styles.fileItemIcon}>
                        {file.type === 'application/pdf' ? '📕' :
                         file.type.includes('word') ? '📘' : '📗'}
                      </span>
                      <span className={styles.fileItemName}>{file.name}</span>
                      <span className={styles.fileItemSize}>{formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        className={styles.fileItemRemove}
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        title="Remove file"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Client Selector */}
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

            {/* Client Files Checklist */}
            {selectedClient && clientFiles.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>
                  Include Client Files as Context
                  <HelpTooltip text="Upload historical reports, ad exports, or analytics data. These are summarised once and used automatically in future reports for better comparisons." />
                </label>
                <p className={styles.fieldHint}>
                  Select files from the client library to include as additional context for Claude.
                </p>
                <div className={styles.clientFilesList}>
                  {clientFiles.map((cf) => (
                    <label key={cf.id} className={styles.clientFileCheck}>
                      <input
                        type="checkbox"
                        checked={selectedClientFileIds.includes(cf.id)}
                        onChange={() => toggleClientFile(cf.id)}
                      />
                      <span className={styles.clientFileInfo}>
                        <span className={styles.clientFileName}>
                          {cf.file_label || cf.file_name}
                        </span>
                        {cf.file_label && cf.file_label !== cf.file_name && (
                          <span className={styles.clientFileOriginal}>{cf.file_name}</span>
                        )}
                        {cf.file_size && (
                          <span className={styles.clientFileSize}>{formatFileSize(cf.file_size)}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {selectedClient && loadingClientFiles && (
              <div className={styles.fieldHint}>Loading client files...</div>
            )}

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
              <label className={styles.label}>
                Custom Instructions for AI (optional)
                <HelpTooltip text="Add specific goals, tone preferences, or metrics to highlight. E.g. 'Client is focused on ROAS, emphasise cost efficiency. Keep language simple — client is not technical.'" />
              </label>
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
          </>
        )}
      </form>
    </>
  );
}
