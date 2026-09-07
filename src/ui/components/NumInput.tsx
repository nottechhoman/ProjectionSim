import { useEffect, useRef, useState } from 'react';
import styles from './NumInput.module.css';

interface NumInputProps {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}

export function NumInput({ label, value, onChange }: NumInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(Number.isFinite(value) ? String(value) : '0');
    }
  }, [value, editing]);

  const beginEdit = () => {
    setDraft(Number.isFinite(value) ? String(value) : '0');
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) {
      onChange(parsed);
    }
  };

  const cancel = () => {
    setEditing(false);
    setDraft(Number.isFinite(value) ? String(value) : '0');
  };

  return (
    <div className={styles.row}>
      <label>{label}</label>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.display}
          onClick={beginEdit}
          onDoubleClick={beginEdit}
          title="Click or double-click to edit"
        >
          {Number.isFinite(value) ? value : 0}
        </button>
      )}
    </div>
  );
}
