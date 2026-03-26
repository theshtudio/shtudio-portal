'use client';

import { useRouter } from 'next/navigation';
import { KbDocumentList } from './KbDocumentList';
import { KbUploadPanel } from './KbUploadPanel';
import type { KbDocument } from './KbDocumentList';
import styles from './page.module.css';

interface KbPageClientProps {
  initialDocuments: KbDocument[];
}

export function KbPageClient({ initialDocuments }: KbPageClientProps) {
  const router = useRouter();

  function handleUploaded() {
    router.refresh();
  }

  return (
    <div className={styles.layout}>
      <div className={styles.listCol}>
        <KbDocumentList documents={initialDocuments} />
      </div>
      <div className={styles.uploadCol}>
        <KbUploadPanel onUploaded={handleUploaded} />
      </div>
    </div>
  );
}
