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

type Tab = 'upload' | 'quickadd';

export function KbUploadPanel({ onUploaded }: KbUploadPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('upload');

  // ── Upload File state ──────────────────────────────────────────────────────
  const [file,            setFile]            = useState<File | null>(null);
  const [title,           setTitle]           = useState('');
  const [accessTier,      setAccessTier]      = useState('general');
  const [skipSummarise,   setSkipSummarise]   = useState(false);
  const [dragging,        setDragging]        = useState(false);
  const [uploading,       setUploading]       = useState(false);
  const [uploadErr,       setUploadErr]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Quick Add state ────────────────────────────────────────────────────────
  const [qaTitle,          setQaTitle]          = useState('');
  const [qaContent,        setQaContent]        = useState('');
  const [qaAccessTier,     setQaAccessTier]     = useState('general');
  const [qaSkipSummarise,  setQaSkipSummarise]  = useState(false);
  const [qaSubmitting,     setQaSubmitting]     = useState(false);
  const [qaErr,            setQaErr]            = useState('');

  // ── Upload File logic ──────────────────────────────────────────────────────

  function fileDisplayName(f: File) {
    return f.name.length > 40 ? `${f.name.slice(0, 37)}…` : f.name;
  }

  function applyFile(f: File) {
    setFile(f);
    setUploadErr('');
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

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file)         { setUploadErr('Please select a file.'); return; }
    if (!title.trim()) { setUploadErr('Please enter a title.'); return; }

    setUploadErr('');
    setUploading(true);

    const formData = new FormData();
    formData.append('file',             file);
    formData.append('title',            title.trim());
    formData.append('access_tier',      accessTier);
    formData.append('skip_summarise',   skipSummarise ? 'true' : 'false');

    try {
      const res  = await fetch('/api/kb/ingest', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');

      setFile(null);
      setTitle('');
      setAccessTier('general');
      setSkipSummarise(false);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded(json.documentId);
    } catch (err: any) {
      setUploadErr(err.message);
    } finally {
      setUploading(false);
    }
  }

  // ── Quick Add logic ────────────────────────────────────────────────────────

  async function handleQuickAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!qaTitle.trim())   { setQaErr('Title is required.');   return; }
    if (!qaContent.trim()) { setQaErr('Content is required.'); return; }

    setQaErr('');
    setQaSubmitting(true);

    // Wrap the text in a synthetic .txt File so the ingest route handles it
    // identically to a file upload — no route changes needed.
    const slug     = qaTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const fakeFile = new File([qaContent.trim()], `${slug}.txt`, { type: 'text/plain' });

    const formData = new FormData();
    formData.append('file',            fakeFile);
    formData.append('title',           qaTitle.trim());
    formData.append('access_tier',     qaAccessTier);
    formData.append('skip_summarise',  qaSkipSummarise ? 'true' : 'false');

    try {
      const res  = await fetch('/api/kb/ingest', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ingest failed');

      setQaTitle('');
      setQaContent('');
      setQaAccessTier('general');
      setQaSkipSummarise(false);
      onUploaded(json.documentId);
    } catch (err: any) {
      setQaErr(err.message);
    } finally {
      setQaSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.uploadPanel}>

      {/* Tab bar */}
      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'upload' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          Upload File
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'quickadd' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('quickadd')}
        >
          Quick Add
        </button>
      </div>

      {/* ── Upload File tab ── */}
      {activeTab === 'upload' && (
        <form className={styles.tabForm} onSubmit={handleUploadSubmit}>

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

          {/* Skip summarisation */}
          <div className={styles.uploadField}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={skipSummarise}
                onChange={(e) => setSkipSummarise(e.target.checked)}
                className={styles.checkboxInput}
              />
              Skip AI summarisation — this document is already clean/summarised
            </label>
          </div>

          {uploadErr && <div className={styles.uploadError}>{uploadErr}</div>}

          <button type="submit" className={styles.uploadBtn} disabled={uploading || !file}>
            {uploading ? (
              <><span className={styles.uploadSpinner} /> Uploading…</>
            ) : (
              'Ingest Document'
            )}
          </button>
        </form>
      )}

      {/* ── Quick Add tab ── */}
      {activeTab === 'quickadd' && (
        <form className={styles.tabForm} onSubmit={handleQuickAddSubmit}>

          {/* Title */}
          <div className={styles.uploadField}>
            <label className={styles.uploadLabel}>Title</label>
            <input
              className={styles.uploadInput}
              type="text"
              value={qaTitle}
              onChange={(e) => setQaTitle(e.target.value)}
              placeholder="e.g. Cloudways SOP — Server Setup"
              required
            />
          </div>

          {/* Content */}
          <div className={styles.uploadField}>
            <label className={styles.uploadLabel}>Content</label>
            <textarea
              className={styles.qaTextarea}
              value={qaContent}
              onChange={(e) => setQaContent(e.target.value)}
              placeholder="Paste or type your document content here..."
              rows={8}
              required
            />
          </div>

          {/* Access Tier */}
          <div className={styles.uploadField}>
            <label className={styles.uploadLabel}>Access Tier</label>
            <select
              className={styles.uploadSelect}
              value={qaAccessTier}
              onChange={(e) => setQaAccessTier(e.target.value)}
            >
              {ACCESS_TIERS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Skip summarisation */}
          <div className={styles.uploadField}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={qaSkipSummarise}
                onChange={(e) => setQaSkipSummarise(e.target.checked)}
                className={styles.checkboxInput}
              />
              Skip AI summarisation — this document is already clean/summarised
            </label>
          </div>

          {qaErr && <div className={styles.uploadError}>{qaErr}</div>}

          <button type="submit" className={styles.uploadBtn} disabled={qaSubmitting || !qaTitle.trim() || !qaContent.trim()}>
            {qaSubmitting ? (
              <><span className={styles.uploadSpinner} /> Ingesting…</>
            ) : (
              'Ingest Document'
            )}
          </button>
        </form>
      )}
    </div>
  );
}
