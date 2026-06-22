'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ParsedBlock } from '@/lib/reportBlocks';
import styles from './page.module.css';

const TEXT_EDITABLE_TYPES = new Set(['narrative', 'insight-callout', 'recommendations']);

interface SortableBlockProps {
  block: ParsedBlock;
  isHidden: boolean;
  overrideHtml?: string | null;
  hasWarning?: boolean;
  onToggleHide: (blockId: string) => void;
  onRequestEdit: (blockId: string) => void;
}

// Wraps a single top-level block as a sortable item, renders the block's
// HTML inside (either the original innerHTML or the admin override),
// and overlays the drag handle / hide / edit controls.
//
// We render the original <section> tag with its data-block-* attributes
// preserved so applyBlocksToHtml can still find/match the block identity
// elsewhere (and so styles that target [data-block-type] keep working).
export function SortableBlock({
  block,
  isHidden,
  overrideHtml,
  hasWarning = false,
  onToggleHide,
  onRequestEdit,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const editable = TEXT_EDITABLE_TYPES.has(block.type);
  const innerHtml = overrideHtml ?? block.innerHtml;

  // Build the opening <section> tag from the original outerHtml so we keep
  // the model's original data-block-* attributes intact.
  const openTagMatch = block.outerHtml.match(/^<section\b[^>]*>/i);
  const openTag = openTagMatch ? openTagMatch[0] : `<section data-block-id="${block.id}" data-block-type="${block.type}">`;

  // We need a wrapper div for sortable + overlay positioning, then the
  // original <section> nested inside it via dangerouslySetInnerHTML so
  // styles that target the section directly still work.
  const sectionHtml = `${openTag}${innerHtml}</section>`;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const wrapClasses = [
    styles.blockWrap,
    isHidden ? styles.hidden : '',
    isDragging ? styles.dragging : '',
  ]
    .filter(Boolean)
    .join(' ');

  const warningBorder: React.CSSProperties = hasWarning
    ? { outline: '2px solid #F59E0B', outlineOffset: '2px', borderRadius: '4px' }
    : {};

  return (
    <div ref={setNodeRef} style={{ ...style, ...warningBorder }} className={wrapClasses} data-block-wrap-id={block.id}>
      <div className={styles.blockOverlay}>
        <div className={styles.overlayLeft}>
          <button
            type="button"
            className={`${styles.overlayBtn} ${styles.dragHandle}`}
            aria-label={`Drag ${block.title ?? block.id}`}
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
          <span className={styles.blockTypeLabel}>{block.title ?? block.type}</span>
          {hasWarning && (
            <span
              title="This block contains numbers that could not be verified against the source PDF"
              style={{ fontSize: '14px', cursor: 'help' }}
            >
              ⚠️
            </span>
          )}
        </div>
        <div className={styles.overlayRight}>
          <button
            type="button"
            className={`${styles.overlayBtn} ${styles.tooltip}`}
            data-tooltip={editable ? 'Edit text' : 'This block type can\'t be text-edited (cards, charts, and tables are structured)'}
            disabled={!editable}
            onClick={() => editable && onRequestEdit(block.id)}
            aria-label="Edit text"
          >
            ✎
          </button>
          <button
            type="button"
            className={`${styles.overlayBtn} ${styles.tooltip}`}
            data-tooltip={isHidden ? 'Show in client view' : 'Hide from client view'}
            onClick={() => onToggleHide(block.id)}
            aria-label={isHidden ? 'Show block' : 'Hide block'}
          >
            {isHidden ? '🚫' : '👁'}
          </button>
        </div>
      </div>

      {isHidden && (
        <div className={styles.hiddenLabel}>
          <span>Hidden from client</span>
        </div>
      )}

      <div dangerouslySetInnerHTML={{ __html: sectionHtml }} />
    </div>
  );
}
