'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import type { ActionItem, ActionItemPriority, AssigneeOption } from '@/lib/types';
import styles from './page.module.css';

interface ApprovalsClientProps {
  initialItems: ActionItem[];
  assignees: AssigneeOption[];
}

const PRIORITIES: ActionItemPriority[] = ['urgent', 'high', 'normal', 'low'];

// Map action_items.status onto the StatusBadge visual vocabulary.
const BADGE: Record<string, { status: 'pending' | 'active' | 'failed'; label: string }> = {
  proposed: { status: 'pending', label: 'Proposed' },
  approved: { status: 'active', label: 'Approved' },
  failed: { status: 'failed', label: 'Push failed' },
};

interface Draft {
  title: string;
  description: string;
  resolved_user_id: string; // '' = unassigned
  proposed_due_date: string; // '' = none
  priority: string; // '' = none
}

function toDraft(item: ActionItem): Draft {
  return {
    title: item.title,
    description: item.description ?? '',
    resolved_user_id: item.resolved_user_id != null ? String(item.resolved_user_id) : '',
    proposed_due_date: item.proposed_due_date ?? '',
    priority: item.priority ?? '',
  };
}

export function ApprovalsClient({ initialItems, assignees }: ApprovalsClientProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialItems.map((i) => [i.id, toDraft(i)])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  function draftFields(d: Draft) {
    return {
      title: d.title.trim(),
      description: d.description.trim() || null,
      resolved_user_id: d.resolved_user_id ? Number(d.resolved_user_id) : null,
      proposed_due_date: d.proposed_due_date || null,
      priority: d.priority || null,
    };
  }

  async function send(id: string, body: Record<string, unknown>, method: 'PATCH' | 'POST', path = '') {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/approvals/${id}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError({ id, message: data.error || `Request failed (${res.status})` });
        return;
      }
      router.refresh();
    } catch {
      setError({ id, message: 'Network error — please retry.' });
    } finally {
      setBusyId(null);
    }
  }

  if (initialItems.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>✅</div>
        <p className={styles.emptyTitle}>Nothing waiting for approval</p>
        <p className={styles.emptyText}>
          When a team member flags a message with <code>/task</code> in Telegram, it lands here for review.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {initialItems.map((item) => {
        const d = drafts[item.id];
        if (!d) return null;
        const busy = busyId === item.id;
        const badge = BADGE[item.status] ?? BADGE.proposed;
        const canPush = item.status === 'approved' || item.status === 'failed';

        return (
          <div key={item.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <StatusBadge status={badge.status} label={badge.label} />
              <div className={styles.meta}>
                <span>{item.tg_sender ?? 'unknown'}</span>
                {item.tg_permalink && (
                  <>
                    <span className={styles.dot}>·</span>
                    <a href={item.tg_permalink} target="_blank" rel="noreferrer" className={styles.link}>
                      view in Telegram ↗
                    </a>
                  </>
                )}
              </div>
            </div>

            {item.source_quote && (
              <blockquote className={styles.quote} title={item.source_quote}>
                {item.source_quote}
              </blockquote>
            )}

            <label className={styles.fieldLabel}>Title</label>
            <input
              className={styles.input}
              value={d.title}
              disabled={busy}
              onChange={(e) => patchDraft(item.id, { title: e.target.value })}
            />

            <label className={styles.fieldLabel}>Description</label>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              value={d.description}
              disabled={busy}
              placeholder="Optional detail for ClickUp…"
              onChange={(e) => patchDraft(item.id, { description: e.target.value })}
            />

            <div className={styles.row}>
              <div className={styles.col}>
                <label className={styles.fieldLabel}>Assignee</label>
                <select
                  className={styles.input}
                  value={d.resolved_user_id}
                  disabled={busy}
                  onChange={(e) => patchDraft(item.id, { resolved_user_id: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.clickup_user_id} value={a.clickup_user_id}>
                      {a.canonical_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.col}>
                <label className={styles.fieldLabel}>Due date</label>
                <input
                  type="date"
                  className={styles.input}
                  value={d.proposed_due_date}
                  disabled={busy}
                  onChange={(e) => patchDraft(item.id, { proposed_due_date: e.target.value })}
                />
                {item.due_hint && <span className={styles.hint}>hint: “{item.due_hint}”</span>}
              </div>

              <div className={styles.col}>
                <label className={styles.fieldLabel}>Priority</label>
                <select
                  className={styles.input}
                  value={d.priority}
                  disabled={busy}
                  onChange={(e) => patchDraft(item.id, { priority: e.target.value })}
                >
                  <option value="">None</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {item.status === 'failed' && item.push_error && (
              <p className={styles.pushError}>ClickUp push failed: {item.push_error}</p>
            )}
            {error?.id === item.id && <p className={styles.pushError}>{error.message}</p>}

            <div className={styles.actions}>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => send(item.id, { action: 'save', ...draftFields(d) }, 'PATCH')}
              >
                Save
              </Button>

              <div className={styles.actionsRight}>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => send(item.id, { action: 'discard' }, 'PATCH')}
                >
                  Discard
                </Button>

                {item.status === 'proposed' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || !d.title.trim()}
                    onClick={() => send(item.id, { action: 'approve', ...draftFields(d) }, 'PATCH')}
                  >
                    Approve
                  </Button>
                )}

                {canPush && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy}
                    onClick={() => send(item.id, {}, 'POST', '/push')}
                  >
                    {item.status === 'failed' ? 'Retry push' : 'Push to ClickUp'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
