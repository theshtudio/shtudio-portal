'use client';

import styles from './page.module.css';

export function DownloadButton() {
  return (
    <div className={styles.downloadWrapper}>
      <button
        className={styles.downloadButton}
        onClick={() => window.print()}
        title="Download as PDF"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 1v9m0 0L5 7m3 3l3-3M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Download PDF
      </button>
      <span className={styles.downloadHint}>
        Use &ldquo;Save as PDF&rdquo; in the print dialog
      </span>
    </div>
  );
}
