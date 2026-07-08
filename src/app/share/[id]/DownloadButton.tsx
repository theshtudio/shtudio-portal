'use client';

import { useState } from 'react';
import styles from './page.module.css';

export function DownloadButton({ reportId }: { reportId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleDownload() {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/reports/${reportId}/pdf`);

      // Published reports download without a login (this page is public).
      // Defensive fallback: if the request is ever redirected to /login (e.g.
      // an auth-gated report), follow it in the browser rather than saving the
      // login HTML as a .pdf.
      if (res.redirected && new URL(res.url).pathname.startsWith('/login')) {
        window.location.href = res.url;
        return;
      }

      const contentType = res.headers.get('Content-Type') ?? '';
      if (!res.ok || !contentType.includes('application/pdf')) {
        throw new Error(`PDF request failed: ${res.status}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? 'report.pdf';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.downloadWrapper}>
      <button
        className={styles.downloadButton}
        onClick={handleDownload}
        disabled={loading}
        title="Download as PDF"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 1v9m0 0L5 7m3 3l3-3M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {loading ? 'Preparing PDF…' : 'Download PDF'}
      </button>
      <span className={styles.downloadHint}>
        {error
          ? 'Download failed — please try again.'
          : 'High-quality PDF, generated on our server'}
      </span>
    </div>
  );
}
