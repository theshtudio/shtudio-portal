'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/Button/Button';
import type { ClientFile } from '@/lib/types';
import styles from './ClientFiles.module.css';

interface ClientFilesProps {
  clientId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string | null): string {
  if (!type) return '📄';
  if (type === 'application/pdf') return '📕';
  if (type.includes('word') || type.includes('document')) return '📘';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return '📗';
  return '📄';
}

export function ClientFiles({ clientId }: ClientFilesProps) {
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadFiles() {
    try {
      const res = await fetch(`/api/clients/${clientId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, [clientId]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (label.trim()) {
        formData.append('label', label.trim());
      }

      const res = await fetch(`/api/clients/${clientId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      setFiles((prev) => [data.file, ...prev]);
      setLabel('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return;

    setDeletingId(fileId);
    try {
      const res = await fetch(`/api/clients/${clientId}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete file');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Client Files</h2>
      </div>

      <p className={styles.description}>
        Upload files (brand guidelines, strategy docs, data exports) that can be included as context when generating reports.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.uploadRow}>
        <input
          type="text"
          className={styles.labelInput}
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,.docx,.doc"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleUpload(e.target.files[0]);
          }}
        />
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          loading={uploading}
        >
          Upload File
        </Button>
      </div>

      {loading ? (
        <div className={styles.empty}>Loading files...</div>
      ) : files.length === 0 ? (
        <div className={styles.empty}>No files uploaded yet.</div>
      ) : (
        <div className={styles.fileList}>
          {files.map((file) => (
            <div key={file.id} className={styles.fileRow}>
              <span className={styles.fileIcon}>{fileIcon(file.file_type)}</span>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>
                  {file.file_label || file.file_name}
                </span>
                {file.file_label && file.file_label !== file.file_name && (
                  <span className={styles.fileOriginal}>{file.file_name}</span>
                )}
              </div>
              <span className={styles.fileSize}>
                {file.file_size ? formatFileSize(file.file_size) : '—'}
              </span>
              <span className={styles.fileDate}>
                {new Date(file.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <button
                className={styles.deleteBtn}
                onClick={() => handleDelete(file.id)}
                disabled={deletingId === file.id}
                title="Delete file"
              >
                {deletingId === file.id ? '...' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
