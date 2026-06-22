'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/Button/Button';
import { splitHtmlForEditor } from '@/lib/reportBlocks';
import type { BlocksConfig } from '@/lib/types';
import { RichTextEditor } from './RichTextEditor';
import { SortableBlock } from './SortableBlock';
import styles from './page.module.css';

interface BlockEditorProps {
  reportId: string;
  reportTitle: string;
  html: string;
  initialDraft: BlocksConfig | null;
  initialPublished: BlocksConfig | null;
  hasUnpublishedChanges: boolean;
  unmatchedNumbers?: string[];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Build the working order from a draft. Listed ids first (only those that
// exist), then anything new in original document order. Matches the
// applyBlocksToHtml fallback so client + editor stay aligned.
function buildOrder(allIds: string[], draftOrder: string[] | undefined): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const valid = new Set(allIds);
  if (draftOrder) {
    for (const id of draftOrder) {
      if (valid.has(id) && !seen.has(id)) {
        order.push(id);
        seen.add(id);
      }
    }
  }
  for (const id of allIds) {
    if (!seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  return order;
}

export function BlockEditor({
  reportId,
  reportTitle,
  html,
  initialDraft,
  initialPublished,
  hasUnpublishedChanges,
  unmatchedNumbers = [],
}: BlockEditorProps) {
  const router = useRouter();
  const { head, blocks: parsedBlocks, tail } = useMemo(
    () => splitHtmlForEditor(html),
    [html],
  );

  const allIds = useMemo(() => parsedBlocks.map((b) => b.id), [parsedBlocks]);
  const byId = useMemo(() => {
    const m = new Map<string, (typeof parsedBlocks)[number]>();
    for (const b of parsedBlocks) m.set(b.id, b);
    return m;
  }, [parsedBlocks]);

  // Compute which block IDs contain unmatched numbers for warning highlighting.
  const blocksWithWarnings = useMemo(() => {
    if (unmatchedNumbers.length === 0) return new Set<string>();
    const warned = new Set<string>();
    for (const block of parsedBlocks) {
      const blockText = block.innerHtml.replace(/<[^>]+>/g, ' ');
      for (const n of unmatchedNumbers) {
        if (blockText.includes(n)) {
          warned.add(block.id);
          break;
        }
      }
    }
    return warned;
  }, [parsedBlocks, unmatchedNumbers]);

  const [order, setOrder] = useState<string[]>(() => buildOrder(allIds, initialDraft?.order));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialDraft?.hidden ?? []));
  const [shown, setShown] = useState<Set<string>>(() => new Set(initialDraft?.shown ?? []));
  const [overrides, setOverrides] = useState<Record<string, { html: string }>>(
    () => initialDraft?.overrides ?? {},
  );
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [hasDraftChanges, setHasDraftChanges] = useState(hasUnpublishedChanges);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMountRef = useRef(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const currentConfig: BlocksConfig = useMemo(
    () => ({
      order,
      hidden: Array.from(hidden),
      shown: Array.from(shown),
      overrides,
    }),
    [order, hidden, shown, overrides],
  );

  // Debounced save. Skip the first effect run so we don't immediately
  // POST the editor's loaded-from-DB state back to the server.
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus('saving');
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/reports/${reportId}/blocks`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentConfig),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setSaveStatus('saved');
        setSaveError(null);
        setHasDraftChanges(true);
      } catch (err) {
        setSaveStatus('error');
        setSaveError(err instanceof Error ? err.message : 'Failed to save');
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [reportId, currentConfig]);

  // Re-execute scripts after the editor's React tree is mounted (and after
  // each mutation that swaps DOM contents). Mirrors what ReportHtml does
  // for the read-only view. Charts persist across reorder because dnd-kit
  // moves the existing canvas DOM nodes around — Chart.js holds a ref to
  // the canvas, not its DOM position.
  const lastScriptRunRef = useRef(false);
  useEffect(() => {
    if (lastScriptRunRef.current) return;
    lastScriptRunRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    async function run() {
      if (!container) return;
      const scripts = Array.from(container.querySelectorAll('script'));
      for (const oldScript of scripts) {
        if (cancelled) return;
        try {
          const newScript = document.createElement('script');
          for (const { name, value } of Array.from(oldScript.attributes)) {
            if (name === 'async' || name === 'defer') continue;
            newScript.setAttribute(name, value);
          }
          if (oldScript.src) {
            await new Promise<void>((resolve) => {
              newScript.onload = () => resolve();
              newScript.onerror = () => {
                console.error('[BlockEditor] external script failed:', oldScript.src);
                resolve();
              };
              oldScript.replaceWith(newScript);
            });
          } else {
            let body = oldScript.textContent ?? '';
            if (document.readyState !== 'loading') {
              body = body.replace(
                /document\.addEventListener\(\s*['"]DOMContentLoaded['"]\s*,\s*function\s*\(\s*\)\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/,
                '(function(){$1})();',
              );
            }
            newScript.textContent = body;
            oldScript.replaceWith(newScript);
          }
        } catch (err) {
          console.error('[BlockEditor] script run failed:', err);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // Compute whether a block is "effectively hidden" from the client's
  // perspective: it's hidden if explicitly in `hidden`, OR if it carries
  // data-default-hidden="true" and hasn't been opted-in via `shown`.
  const isEffectivelyHidden = useCallback(
    (blockId: string) => {
      if (hidden.has(blockId)) return true;
      const block = byId.get(blockId);
      if (block?.dataDefaultHidden && !shown.has(blockId)) return true;
      return false;
    },
    [hidden, shown, byId],
  );

  const toggleHide = useCallback(
    (blockId: string) => {
      const block = byId.get(blockId);
      const isDefaultHidden = block?.dataDefaultHidden ?? false;
      const wasEffectivelyHidden = isEffectivelyHidden(blockId);

      if (wasEffectivelyHidden) {
        // Admin clicked "show": un-hide explicitly + opt in if default-hidden.
        setHidden((prev) => {
          if (!prev.has(blockId)) return prev;
          const next = new Set(prev);
          next.delete(blockId);
          return next;
        });
        if (isDefaultHidden) {
          setShown((prev) => {
            if (prev.has(blockId)) return prev;
            const next = new Set(prev);
            next.add(blockId);
            return next;
          });
        }
      } else {
        // Admin clicked "hide": add to explicit hidden. `hidden` always wins
        // over `shown`, so default-hidden blocks toggled this way stay
        // hidden until the admin clicks the eye again.
        setHidden((prev) => {
          if (prev.has(blockId)) return prev;
          const next = new Set(prev);
          next.add(blockId);
          return next;
        });
      }
    },
    [byId, isEffectivelyHidden],
  );

  const handleSaveOverride = useCallback((blockId: string, cleanHtml: string) => {
    setOverrides((prev) => ({ ...prev, [blockId]: { html: cleanHtml } }));
    setEditingBlockId(null);
  }, []);

  async function handlePublish() {
    setPublishing(true);
    setSaveError(null);
    try {
      // Flush pending debounce so the draft hits the server before publish.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        await fetch(`/api/admin/reports/${reportId}/blocks`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentConfig),
        });
      }
      const res = await fetch(`/api/admin/reports/${reportId}/blocks`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setHasDraftChanges(false);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  async function handleReset() {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/blocks`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      // Reset local state to "no customisation" and reload the editor.
      setOrder(allIds);
      setHidden(new Set());
      setShown(new Set());
      setOverrides({});
      setHasDraftChanges(false);
      setSaveStatus('idle');
      setConfirmReset(false);
      initialMountRef.current = true; // suppress auto-save of the cleared state
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Reset failed');
      setConfirmReset(false);
    }
  }

  const editingBlock = editingBlockId ? byId.get(editingBlockId) ?? null : null;
  const editingInitialHtml = editingBlock
    ? overrides[editingBlock.id]?.html ?? editingBlock.innerHtml
    : '';

  const statusLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? saveError ?? 'Save failed'
          : '';

  const statusClass =
    saveStatus === 'saving'
      ? styles.saving
      : saveStatus === 'saved'
        ? styles.saved
        : saveStatus === 'error'
          ? styles.error
          : '';

  if (parsedBlocks.length === 0) {
    // Older report generated before the Phase A wrappers landed.
    return (
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <Link href={`/admin/reports/${reportId}`} style={{ textDecoration: 'none', color: 'inherit' }}>← Back</Link>
            <div>
              <div className={styles.toolbarTitle}>{reportTitle}</div>
              <div className={styles.toolbarSubtitle}>Layout editor</div>
            </div>
          </div>
        </div>
        <div className={styles.notice}>
          This report was generated before block-segmentation was rolled out, so the editor
          can&apos;t identify its sections. Re-run AI generation on this report to enable layout
          editing.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href={`/admin/reports/${reportId}`} style={{ textDecoration: 'none', color: 'inherit' }}>← Back</Link>
          <div>
            <div className={styles.toolbarTitle}>{reportTitle}</div>
            <div className={styles.toolbarSubtitle}>Layout editor · changes auto-save as draft</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <span className={`${styles.statusPill} ${hasDraftChanges ? styles.draft : styles.saved}`}>
            <span className={styles.dot} /> {hasDraftChanges ? 'Unpublished changes' : 'Up to date'}
          </span>
          {statusLabel && (
            <span className={`${styles.statusPill} ${statusClass}`}>
              <span className={styles.dot} /> {statusLabel}
            </span>
          )}
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            Reset to AI output
          </Button>
          <Button onClick={handlePublish} loading={publishing} disabled={!hasDraftChanges && saveStatus !== 'saved'}>
            Publish changes
          </Button>
        </div>
      </div>

      {saveError && <div className={styles.notice}>{saveError}</div>}

      {blocksWithWarnings.size > 0 && (
        <div style={{
          background: '#FFFBEB',
          border: '1px solid #F59E0B',
          borderLeft: '4px solid #F59E0B',
          borderRadius: '6px',
          padding: '10px 16px',
          margin: '0 0 12px 0',
          fontSize: '13px',
          color: '#92400E',
        }}>
          ⚠️ <strong>{blocksWithWarnings.size} block{blocksWithWarnings.size > 1 ? 's' : ''}</strong> contain numbers that could not be verified against the source PDF. Highlighted below.
        </div>
      )}

      <div ref={containerRef} className={styles.frame}>
        <div dangerouslySetInnerHTML={{ __html: head }} />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id) => {
              const block = byId.get(id);
              if (!block) return null;
              return (
                <SortableBlock
                  key={block.id}
                  block={block}
                  isHidden={isEffectivelyHidden(block.id)}
                  overrideHtml={overrides[block.id]?.html ?? null}
                  hasWarning={blocksWithWarnings.has(block.id)}
                  onToggleHide={toggleHide}
                  onRequestEdit={(blockId) => setEditingBlockId(blockId)}
                />
              );
            })}
          </SortableContext>
        </DndContext>

        <div dangerouslySetInnerHTML={{ __html: tail }} />
      </div>

      {editingBlock && (
        <RichTextEditor
          blockId={editingBlock.id}
          blockTitle={editingBlock.title}
          initialHtml={editingInitialHtml}
          onSave={(clean) => handleSaveOverride(editingBlock.id, clean)}
          onCancel={() => setEditingBlockId(null)}
        />
      )}

      {confirmReset && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmReset(false)}>
          <div className={styles.confirmPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmTitle}>Reset to original AI output?</div>
            <div className={styles.confirmBody}>
              This clears the published layout and the working draft for this report.
              The report will render exactly as the AI generated it everywhere — admin,
              client dashboard, and share link. This cannot be undone, but you can
              re-customise the layout from scratch.
            </div>
            <div className={styles.confirmActions}>
              <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <button type="button" className={styles.dangerBtn} onClick={handleReset}>
                Yes, reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Initial published state is referenced so the prop isn't unused —
          Phase C will use it for a side-by-side compare view. */}
      {initialPublished == null && null}
    </div>
  );
}
