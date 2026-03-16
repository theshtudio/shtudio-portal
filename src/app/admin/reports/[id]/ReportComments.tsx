'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import { format } from 'date-fns';
import type { ReportCommentWithAuthor } from '@/lib/types';
import styles from './page.module.css';

interface ReportCommentsProps {
  reportId: string;
  initialComments: ReportCommentWithAuthor[];
}

export function ReportComments({ reportId, initialComments }: ReportCommentsProps) {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;

    setError('');
    setPosting(true);

    try {
      const res = await fetch(`/api/reports/${reportId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: comment.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to post comment');
      }

      setComment('');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to post comment.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className={styles.commentsSection}>
      <h2 className={styles.sectionTitle}>Comments</h2>

      {initialComments.length > 0 ? (
        <div className={styles.commentsList}>
          {initialComments.map((c) => {
            const author = (c.profiles as any);
            const authorName = author?.full_name || author?.email || 'Unknown';
            return (
              <div key={c.id} className={styles.commentItem}>
                <div className={styles.commentMeta}>
                  <span className={styles.commentAuthor}>{authorName}</span>
                  <span className={styles.commentDate}>
                    {format(new Date(c.created_at), 'dd MMM yyyy, HH:mm')}
                  </span>
                </div>
                <div className={styles.commentText}>{c.comment}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.commentsEmpty}>No comments yet.</div>
      )}

      <form className={styles.commentForm} onSubmit={handleSubmit}>
        <textarea
          className={styles.commentTextarea}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add an internal comment..."
          rows={3}
        />
        {error && <div className={styles.commentError}>{error}</div>}
        <div className={styles.commentActions}>
          <Button type="submit" size="sm" loading={posting} disabled={!comment.trim()}>
            Add Comment
          </Button>
        </div>
      </form>
    </div>
  );
}
