'use client';

import { useState } from 'react';
import { Button } from '@/components/Button/Button';
import styles from './page.module.css';

interface ShareLinkProps {
  reportId: string;
}

export function ShareLink({ reportId }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${reportId}`;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className={styles.shareLinkRow}>
      <input
        className={styles.shareLinkInput}
        value={shareUrl}
        readOnly
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      <Button size="sm" onClick={copyToClipboard}>
        {copied ? 'Copied!' : 'Copy Link'}
      </Button>
    </div>
  );
}
