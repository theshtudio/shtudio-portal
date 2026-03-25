'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface EditableTitleProps {
  reportId: string;
  initialTitle: string;
}

export function EditableTitle({ reportId, initialTitle }: EditableTitleProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    await fetch(`/api/reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    });
    setSaving(false);
    setEditing(false);
    setToast(true);
    setTimeout(() => setToast(false), 2500);
    router.refresh();
  }

  function handleCancel() {
    setValue(initialTitle);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  }

  return (
    <div className={styles.editableTitleWrapper}>
      {editing ? (
        <div className={styles.titleEditRow}>
          <input
            ref={inputRef}
            className={styles.titleInput}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={styles.titleSaveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className={styles.titleCancelBtn} onClick={handleCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div className={styles.titleDisplayRow}>
          <h1 className={styles.heading}>{value}</h1>
          <button className={styles.editIconBtn} onClick={() => setEditing(true)} title="Edit title">
            <PencilIcon />
          </button>
        </div>
      )}
      {toast && <div className={styles.titleToast}>Title updated</div>}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1464 1.14645L3.71885 8.57392C3.62439 8.66838 3.55027 8.78411 3.50998 8.90997L2.51069 12.1555C2.46945 12.283 2.50406 12.4218 2.59835 12.5161C2.69264 12.6104 2.83141 12.6451 2.95893 12.6038L6.20455 11.6045C6.33041 11.5642 6.44614 11.4901 6.54061 11.3957L13.9681 3.96823C14.1633 3.77297 14.1633 3.45638 13.9681 3.26112L11.8536 1.14645ZM11.5 2.20711L12.7929 3.49996L12.1464 4.14645L10.8536 2.85355L11.5 2.20711ZM10.1464 3.56066L11.4393 4.85355L5.54039 10.7525L4.27763 11.1738L3.83042 10.7266L4.25171 9.46385L10.1464 3.56066Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
