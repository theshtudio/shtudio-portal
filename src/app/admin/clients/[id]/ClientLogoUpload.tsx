'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import styles from './page.module.css';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

interface ClientLogoUploadProps {
  clientId: string;
  currentLogoUrl: string | null;
}

export function ClientLogoUpload({ clientId, currentLogoUrl }: ClientLogoUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Invalid file type. Allowed: PNG, JPG, WebP, SVG.');
      return;
    }

    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum size is 2 MB.');
      return;
    }

    setError('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/clients/${clientId}/logo`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to upload logo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className={styles.logoSection}>
      <div className={styles.logoPreview}>
        {currentLogoUrl ? (
          <img src={currentLogoUrl} alt="Client logo" className={styles.logoImage} />
        ) : (
          <div className={styles.logoPlaceholder}>No logo</div>
        )}
      </div>
      <div className={styles.logoActions}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          loading={uploading}
        >
          {currentLogoUrl ? 'Replace' : 'Upload'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
      {error && <div className={styles.logoError}>{error}</div>}
    </div>
  );
}
