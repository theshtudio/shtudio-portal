import { createServiceSupabase } from '@/lib/supabase/server';
import { KbPageClient } from './KbPageClient';
import type { KbDocument } from './KbDocumentList';
import styles from './page.module.css';

export default async function KnowledgeBasePage() {
  const supabase = createServiceSupabase();

  const { data: documents } = await supabase
    .from('kb_documents')
    .select('id, title, file_name, access_tier, category, status, chunk_count, error, created_at')
    .order('created_at', { ascending: false });

  return (
    <>
      <h1 className={styles.heading}>Knowledge Base</h1>
      <p className={styles.subheading}>
        Documents are chunked and embedded for semantic retrieval by the AI.
        Phase 1 supports <strong>.txt</strong> and <strong>.md</strong> files.
      </p>

      <KbPageClient initialDocuments={(documents ?? []) as KbDocument[]} />
    </>
  );
}
