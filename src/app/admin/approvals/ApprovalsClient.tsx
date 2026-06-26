'use client';

import { useEffect, useRef, useState } from 'react';
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

  // ── Bulk selection (proposed rows only) ──────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Drop any selected ids that are no longer proposed (e.g. after a refresh
  // turns them approved/discarded), so the selection can't outlive its rows.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const proposed = new Set(
        initialItems.filter((i) => i.status === 'proposed').map((i) => i.id),
      );
      const next = new Set([...prev].filter((id) => proposed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [initialItems]);

  // Reflect a partial selection as the "select all" checkbox's indeterminate
  // state (a DOM-only property React can't set declaratively).
  useEffect(() => {
    if (!selectAllRef.current) return;
    const proposed = initialItems.filter((i) => i.status === 'proposed').map((i) => i.id);
    const all = proposed.length > 0 && proposed.every((id) => selectedIds.has(id));
    selectAllRef.current.indeterminate = selectedIds.size > 0 && !all;
  }, [selectedIds, initialItems]);

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

  // Approve then push, in sequence, on one click. Approve is its own request so
  // it commits status='approved' (with the edited fields) BEFORE any ClickUp
  // write is attempted — a push failure therefore leaves the row approved/failed
  // and retryable rather than stuck at proposed. Reuses the existing
  // approve (PATCH) and push (POST) endpoints unchanged.
  async function approveAndPush(id: string, fields: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const approveRes = await fetch(`/api/admin/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', ...fields }),
      });
      if (!approveRes.ok) {
        const data = await approveRes.json().catch(() => ({}));
        setError({ id, message: data.error || `Approve failed (${approveRes.status})` });
        return; // row stays proposed; nothing pushed
      }

      // Approval is committed. Now push; a failure here is non-fatal — the push
      // route records status='failed' + push_error, and the row resurfaces with
      // the existing "Retry push" button.
      const pushRes = await fetch(`/api/admin/approvals/${id}/push`, { method: 'POST' });
      if (!pushRes.ok) {
        const data = await pushRes.json().catch(() => ({}));
        setError({
          id,
          message: data.error
            ? `Approved, but push failed: ${data.error} — use Retry push.`
            : `Approved, but push failed (${pushRes.status}) — use Retry push.`,
        });
      }
      router.refresh();
    } catch {
      // Approve may have committed before a network drop; refresh so the row
      // reappears in its real (approved/failed) state with Retry push.
      setError({ id, message: 'Network error during approve & push — check the row and use Retry push.' });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const proposedIds = initialItems.filter((i) => i.status === 'proposed').map((i) => i.id);
  const proposedCount = proposedIds.length;
  const selectedCount = selectedIds.size;
  const allSelected = proposedCount > 0 && proposedIds.every((id) => selectedIds.has(id));

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      proposedCount > 0 && proposedIds.every((id) => prev.has(id))
        ? new Set()
        : new Set(proposedIds),
    );
  }

  // Run a bulk action by looping the existing per-row PATCH endpoint — no new
  // route. Approve here is approve-ONLY (status='approved', no ClickUp push).
  // A failing row doesn't abort the batch; failed rows are reported and stay
  // selected so they can be retried.
  async function runBulk(action: 'approve' | 'discard') {
    const ids = initialItems
      .filter((i) => i.status === 'proposed' && selectedIds.has(i.id))
      .map((i) => i.id);
    if (ids.length === 0) return;

    setBulkBusy(true);
    setBulkError(null);
    const failed: string[] = [];

    for (const id of ids) {
      const d = drafts[id];
      const body =
        action === 'approve'
          ? { action: 'approve', ...(d ? draftFields(d) : {}) }
          : { action: 'discard' };
      try {
        const res = await fetch(`/api/admin/approvals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) failed.push(id);
      } catch {
        failed.push(id);
      }
    }

    // Keep only the failures selected, so the user can see and retry them.
    setSelectedIds(new Set(failed));
    if (failed.length > 0) {
      const titles = failed.map((id) => {
        const it = initialItems.find((i) => i.id === id);
        return it ? `“${it.title}”` : id;
      });
      const verb = action === 'approve' ? 'approve' : 'discard';
      setBulkError(
        `Failed to ${verb} ${failed.length} of ${ids.length}: ${titles.join(', ')}. ` +
          `They remain selected — the rest were processed.`,
      );
    }
    setBulkBusy(false);
    router.refresh();
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
    <>
      {proposedCount > 0 && (
        <div className={styles.bulkBar}>
          <label className={styles.selectAll}>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              disabled={bulkBusy}
              onChange={toggleAll}
            />
            <span>Select all proposed ({proposedCount})</span>
          </label>

          {selectedCount > 0 && (
            <div className={styles.bulkActions}>
              <span className={styles.bulkCount}>{selectedCount} selected</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={bulkBusy}
                onClick={() => runBulk('discard')}
              >
                Discard selected
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={bulkBusy}
                onClick={() => runBulk('approve')}
              >
                Approve selected
              </Button>
            </div>
          )}
        </div>
      )}

      {bulkError && <p className={styles.bulkError}>{bulkError}</p>}

      <div className={styles.list}>
      {initialItems.map((item) => {
        const d = drafts[item.id];
        if (!d) return null;
        const busy = busyId === item.id;
        const badge = BADGE[item.status] ?? BADGE.proposed;
        const canPush = item.status === 'approved' || item.status === 'failed';
        const isProposed = item.status === 'proposed';
        const selected = selectedIds.has(item.id);

        return (
          <div key={item.id} className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <input
                  type="checkbox"
                  className={styles.cardCheckbox}
                  checked={selected}
                  disabled={!isProposed || bulkBusy}
                  title={
                    isProposed
                      ? 'Select for bulk approve / discard'
                      : 'Only proposed tasks can be bulk-actioned'
                  }
                  onChange={() => toggleOne(item.id)}
                />
                <StatusBadge status={badge.status} label={badge.label} />
              </div>
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
                    variant="primary"
                    size="sm"
                    loading={busy}
                    disabled={busy || !d.title.trim()}
                    onClick={() => approveAndPush(item.id, draftFields(d))}
                  >
                    Approve &amp; push to ClickUp
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
    </>
  );
}
