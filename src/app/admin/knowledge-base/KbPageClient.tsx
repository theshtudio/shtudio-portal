'use client';

import { KbDocumentList } from './KbDocumentList';
import { KbUploadPanel } from './KbUploadPanel';
import type { KbDocument } from './KbDocumentList';
import styles from './page.module.css';

interface KbPageClientProps {
  initialDocuments: KbDocument[];
}

export function KbPageClient({ initialDocuments }: KbPageClientProps) {
  function handleUploaded() {
    // Dispatch a custom DOM event — KbDocumentList listens for this
    // to trigger an immediate re-fetch without waiting for the 5s poll tick
    window.dispatchEvent(new Event('kb:refresh'));
  }

  return (
    <div className={styles.layout}>
      <div className={styles.listCol}>
        <KbDocumentList initialDocuments={initialDocuments} />
      </div>
      <div className={styles.uploadCol}>
        <KbUploadPanel onUploaded={handleUploaded} />
      </div>
    </div>
  );
}
