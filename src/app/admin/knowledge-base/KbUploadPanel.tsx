'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './page.module.css';

interface KbUploadPanelProps {
  onUploaded: (documentId: string) => void;
}

const ACCESS_TIERS = [
  { value: 'general',   label: 'General — visible to all retrieval queries' },
  { value: 'sensitive', label: 'Sensitive — staff queries only' },
  { value: 'admin',     label: 'Admin — admin queries only' },
];

export function KbUploadPanel({ onUploaded }: KbUploadPanelProps) {
  const [file, setFile]             = useState<File | null>(null);
  const [title, setTitle]           = useState('');
  const [accessTier, setAccessTier] = useState('general');
  const [category, setCategory]     = useState('');
  const [dragging, setDragging]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function fileDisplayName(f: File) {
    return f.name.length > 40 ? `${f.name.slice(0, 37)}…` : f.name;
  }

  function applyFile(f: File) {
    setFile(f);
    setError('');
    // Auto-fill title from filename if blank
    if (!title) {
      const base = f.name.replace(/\.(txt|md)$/i, '').replace(/[-_]/g, ' ');
      setTitle(base.charAt(0).toUpperCase() + base.slice(1));
    }
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) applyFile(dropped);
    },
    [title], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }
    if (!title.trim()) { setError('Please enter a title.'); return; }

    setError('');
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title.trim());
    formData.append('access_tier', accessTier);
    formData.append('category', category.trim());

    try {
      const res = await fetch('/api/kb/ingest', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');

      // Reset form
      setFile(null);
      setTitle('');
      setAccessTier('general');
      setCategory('');
      if (inputRef.current) inputRef.current.value = '';

      onUploaded(json.documentId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className={styles.uploadPanel} onSubmit={handleSubmit}>
      <h2 className={styles.uploadTitle}>Add Document</h2>

      {/* Drop zone */}
      <div
        className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ''} ${file ? styles.dropZoneHasFile : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) applyFile(f); }}
        />
        {file ? (
          <div className={styles.dropZoneFile}>
            <span className={styles.dropZoneFileIcon}>📄</span>
            <span className={styles.dropZoneFileName}>{fileDisplayName(file)}</span>
            <button
              type="button"
              className={styles.dropZoneClear}
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className={styles.dropZonePrompt}>
            <span className={styles.dropZoneIcon}>⬆</span>
            <span className={styles.dropZoneText}>
              Drag &amp; drop a <strong>.txt</strong> or <strong>.md</strong> file here
            </span>
            <span className={styles.dropZoneOr}>or click to browse</span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className={styles.uploadField}>
        <label className={styles.uploadLabel}>Title</label>
        <input
          className={styles.uploadInput}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Google Ads — Agency FAQs"
          required
        />
      </div>

      {/* Access Tier */}
      <div className={styles.uploadField}>
        <label className={styles.uploadLabel}>Access Tier</label>
        <select
          className={styles.uploadSelect}
          value={accessTier}
          onChange={(e) => setAccessTier(e.target.value)}
        >
          {ACCESS_TIERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Category */}
      <div className={styles.uploadField}>
        <label className={styles.uploadLabel}>
          Category <span className={styles.uploadOptional}>(optional)</span>
        </label>
        <input
          className={styles.uploadInput}
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. google-ads, onboarding, pricing"
        />
      </div>

      {error && <div className={styles.uploadError}>{error}</div>}

      <button
        type="submit"
        className={styles.uploadBtn}
        disabled={uploading || !file}
      >
        {uploading ? (
          <>
            <span className={styles.uploadSpinner} />
            Uploading…
          </>
        ) : (
          'Ingest Document'
        )}
      </button>
    </form>
  );
}
