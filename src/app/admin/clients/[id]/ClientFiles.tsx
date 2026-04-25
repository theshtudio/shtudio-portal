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
  const [canDelete, setCanDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadFiles() {
    try {
      const res = await fetch(`/api/clients/${clientId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        setCanDelete(data.canDelete === true);
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
      if (label.trim()) formData.append('label', label.trim());

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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmDelete() {
    setDeleting(true);
    setError('');
    const ids = Array.from(selectedIds);

    for (const fileId of ids) {
      try {
        const res = await fetch(`/api/clients/${clientId}/files/${fileId}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Delete failed');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to delete one or more files');
      }
    }

    setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
    setSelectedIds(new Set());
    setShowModal(false);
    setDeleting(false);
  }

  const selectedFiles = files.filter((f) => selectedIds.has(f.id));

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Client Files</h2>
        {canDelete && selectedIds.size > 0 && (
          <button
            className={styles.deleteSelectedBtn}
            onClick={() => setShowModal(true)}
          >
            Delete Selected ({selectedIds.size})
          </button>
        )}
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
        <Button size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
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
            <div
              key={file.id}
              className={`${styles.fileRow} ${selectedIds.has(file.id) ? styles.fileRowSelected : ''}`}
            >
              {canDelete && (
                <input
                  type="checkbox"
                  className={styles.fileCheckbox}
                  checked={selectedIds.has(file.id)}
                  onChange={() => toggleSelect(file.id)}
                />
              )}
              <span className={styles.fileIcon}>{fileIcon(file.file_type)}</span>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{file.file_label || file.file_name}</span>
                {file.file_label && file.file_label !== file.file_name && (
                  <span className={styles.fileOriginal}>{file.file_name}</span>
                )}
              </div>
              <span className={styles.fileSize}>
                {file.file_size ? formatFileSize(file.file_size) : '—'}
              </span>
              <span className={styles.fileDate}>
                {new Date(file.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Delete Files</h3>
            <p className={styles.modalBody}>
              Are you sure you want to permanently delete these files? This cannot be undone.
            </p>
            <ul className={styles.modalFileList}>
              {selectedFiles.map((f) => (
                <li key={f.id}>{f.file_label || f.file_name}</li>
              ))}
            </ul>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancelBtn}
                onClick={() => setShowModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={styles.modalDeleteBtn}
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
