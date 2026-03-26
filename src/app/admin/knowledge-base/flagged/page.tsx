import Link from 'next/link';
import { createServiceSupabase } from '@/lib/supabase/server';
import styles from './page.module.css';

interface FlaggedQuery {
  id:           string;
  question:     string;
  answer:       string;
  flag_comment: string | null;
  created_at:   string;
}

export default async function FlaggedQueriesPage() {
  const supabase = createServiceSupabase();

  const { data: queries } = await supabase
    .from('kb_queries')
    .select('id, question, answer, flag_comment, created_at')
    .eq('flagged', true)
    .order('created_at', { ascending: false });

  const rows = (queries ?? []) as FlaggedQuery[];

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-AU', {
      day:   '2-digit',
      month: 'short',
      year:  'numeric',
    });
  }

  return (
    <>
      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div>
          <Link href="/admin/knowledge-base" className={styles.backLink}>
            ← Knowledge Base
          </Link>
          <h1 className={styles.heading}>Flagged Responses</h1>
          <p className={styles.subheading}>
            Questions where the AI answer was marked as wrong or missing.
          </p>
        </div>
      </div>

      {/* ── Table ── */}
      {rows.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🚩</div>
          <p className={styles.emptyTitle}>No flagged responses yet</p>
          <p className={styles.emptyText}>
            When users flag an AI answer in the chat, it will appear here for review.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Question</th>
                <th className={styles.th}>Answer</th>
                <th className={styles.th}>Flag Comment</th>
                <th className={styles.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={styles.tr}>

                  {/* Question */}
                  <td className={`${styles.td} ${styles.tdQuestion}`}>
                    <p
                      className={styles.questionText}
                      title={row.question}
                    >
                      {row.question}
                    </p>
                  </td>

                  {/* Answer — 2 lines with ellipsis, full text in title */}
                  <td className={`${styles.td} ${styles.tdAnswer}`}>
                    <p
                      className={styles.answerText}
                      title={row.answer}
                    >
                      {row.answer}
                    </p>
                  </td>

                  {/* Flag comment */}
                  <td className={`${styles.td} ${styles.tdComment}`}>
                    {row.flag_comment ? (
                      <p className={styles.commentText} title={row.flag_comment}>
                        {row.flag_comment}
                      </p>
                    ) : (
                      <span className={styles.none}>—</span>
                    )}
                  </td>

                  {/* Date */}
                  <td className={`${styles.td} ${styles.tdDate}`}>
                    {formatDate(row.created_at)}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
