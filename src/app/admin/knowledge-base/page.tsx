import Link from 'next/link';
import { createServiceSupabase } from '@/lib/supabase/server';
import { KbPageClient } from './KbPageClient';
import type { KbDocument } from './KbDocumentList';
import styles from './page.module.css';

export default async function KnowledgeBasePage() {
  const supabase = createServiceSupabase();

  const [{ data: documents }, { count: flaggedCount }] = await Promise.all([
    supabase
      .from('kb_documents')
      .select('id, title, file_name, file_path, access_tier, category, status, chunk_count, error, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('kb_queries')
      .select('*', { count: 'exact', head: true })
      .eq('flagged', true),
  ]);

  const hasFlagged = (flaggedCount ?? 0) > 0;

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Knowledge Base</h1>
          <p className={styles.subheading}>
            Documents are chunked and embedded for semantic retrieval by the AI.
            Phase 1 supports <strong>.txt</strong> and <strong>.md</strong> files.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link
            href="/admin/knowledge-base/flagged"
            className={`${styles.flaggedLink} ${hasFlagged ? styles.flaggedLinkActive : ''}`}
          >
            🚩 Flagged{hasFlagged ? ` (${flaggedCount})` : ''}
          </Link>
          <Link href="/admin/knowledge-base/chat" className={styles.askBtn}>
            💬 Ask a Question
          </Link>
        </div>
      </div>

      <KbPageClient initialDocuments={(documents ?? []) as KbDocument[]} />
    </>
  );
}
