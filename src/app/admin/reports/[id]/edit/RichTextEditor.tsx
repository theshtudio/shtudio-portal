'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button/Button';
import { sanitiseOverrideHtml } from '@/lib/sanitiseHtmlClient';
import styles from './page.module.css';

interface RichTextEditorProps {
  blockId: string;
  blockTitle: string | null;
  initialHtml: string;
  onSave: (cleanHtml: string) => void;
  onCancel: () => void;
}

// Lightweight contenteditable + toolbar. Intentionally minimal — narrative
// blocks are short and the team prefers a small editing surface to a
// full Slate/TipTap dependency. document.execCommand is deprecated in
// spec but still universally implemented in browsers and is the cleanest
// path to bold/italic/link/list without writing a custom selection API.
export function RichTextEditor({
  blockId,
  blockTitle,
  initialHtml,
  onSave,
  onCancel,
}: RichTextEditorProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [dirty, setDirty] = useState(false);

  // Seed the editable surface once on mount. Don't bind the value to
  // React state — that would re-render the contenteditable on every
  // keystroke and reset the caret position.
  useEffect(() => {
    if (surfaceRef.current) {
      surfaceRef.current.innerHTML = initialHtml;
      surfaceRef.current.focus();
    }
  }, [initialHtml]);

  function exec(command: string, value?: string) {
    document.execCommand(command, false, value);
    setDirty(true);
    surfaceRef.current?.focus();
  }

  function handleBold() {
    exec('bold');
  }
  function handleItalic() {
    exec('italic');
  }
  function handleBulletList() {
    exec('insertUnorderedList');
  }
  function handleOrderedList() {
    exec('insertOrderedList');
  }
  function handleLink() {
    const existing = window.getSelection()?.toString() ?? '';
    const url = window.prompt('Link URL', existing.startsWith('http') ? existing : 'https://');
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      alert('Only http(s) links are allowed.');
      return;
    }
    exec('createLink', url);
    // Force target="_blank" + rel safety on the just-created link
    const sel = window.getSelection();
    if (sel?.anchorNode) {
      let node: Node | null = sel.anchorNode;
      while (node && node.nodeName !== 'A') node = node.parentNode;
      if (node && node instanceof HTMLAnchorElement) {
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
      }
    }
  }
  function handleUnlink() {
    exec('unlink');
  }

  function handleSave() {
    if (!surfaceRef.current) return;
    const raw = surfaceRef.current.innerHTML;
    const clean = sanitiseOverrideHtml(raw);
    onSave(clean);
  }

  function handleCancel() {
    if (
      dirty &&
      !window.confirm('Discard your changes to this block?')
    ) {
      return;
    }
    onCancel();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div className={styles.editorOverlay} onClick={handleCancel}>
      <div
        className={styles.editorPanel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.editorHeader}>
          <div>
            <div className={styles.editorTitle}>Edit block content</div>
            <div className={styles.editorSubtitle}>
              {blockTitle ?? blockId} · saving overwrites the AI-generated text for this block
            </div>
          </div>
          <button
            type="button"
            className={styles.overlayBtn}
            onClick={handleCancel}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>

        <div className={styles.editorBody}>
          <div className={styles.rteToolbar}>
            <button type="button" className={styles.rteBtn} onMouseDown={(e) => { e.preventDefault(); handleBold(); }} title="Bold (Ctrl+B)">
              <strong>B</strong>
            </button>
            <button type="button" className={styles.rteBtn} onMouseDown={(e) => { e.preventDefault(); handleItalic(); }} title="Italic (Ctrl+I)">
              <em>I</em>
            </button>
            <button type="button" className={styles.rteBtn} onMouseDown={(e) => { e.preventDefault(); handleBulletList(); }} title="Bulleted list">
              • List
            </button>
            <button type="button" className={styles.rteBtn} onMouseDown={(e) => { e.preventDefault(); handleOrderedList(); }} title="Numbered list">
              1. List
            </button>
            <button type="button" className={styles.rteBtn} onMouseDown={(e) => { e.preventDefault(); handleLink(); }} title="Insert link">
              Link
            </button>
            <button type="button" className={styles.rteBtn} onMouseDown={(e) => { e.preventDefault(); handleUnlink(); }} title="Remove link">
              Unlink
            </button>
          </div>

          <div
            ref={surfaceRef}
            className={styles.rteSurface}
            contentEditable
            suppressContentEditableWarning
            onInput={() => setDirty(true)}
            spellCheck
          />
        </div>

        <div className={styles.editorFooter}>
          <span className={styles.editorFooterNote}>
            Saved overrides replace the AI-generated content for this block until you reset the report.
          </span>
          <div className={styles.editorActions}>
            <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
            <Button onClick={handleSave}>Save block</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
