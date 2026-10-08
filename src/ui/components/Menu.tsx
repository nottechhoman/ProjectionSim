import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Menu.module.css';

interface MenuProps {
  label: ReactNode;
  title?: string;
  /** Visually mark the trigger (e.g. a non-default option is active inside). */
  active?: boolean;
  align?: 'left' | 'right';
  testId?: string;
  children: (close: () => void) => ReactNode;
}

/**
 * Dropdown that escapes scrolling toolbars (fixed positioning). On narrow screens it
 * opens as a bottom sheet so every option is a full-width, thumb-sized target.
 */
export function Menu({ label, title, active, align = 'left', testId, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos(
      align === 'right'
        ? { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }
        : { top: r.bottom + 6, left: Math.max(8, r.left) },
    );
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${active || open ? styles.triggerActive : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        data-testid={testId}
      >
        {label}
        <span className={styles.chevron} aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className={styles.scrim} onClick={close} />
          <div ref={panelRef} className={styles.panel} style={pos} role="menu">
            {children(close)}
          </div>
        </>
      )}
    </>
  );
}

export function MenuSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      {title && <div className={styles.sectionTitle}>{title}</div>}
      {children}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  selected?: boolean;
  disabled?: boolean;
  title?: string;
  hint?: string;
  children: ReactNode;
}

export function MenuItem({ onSelect, selected, disabled, title, hint, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${styles.item} ${selected ? styles.itemSelected : ''}`}
      onClick={onSelect}
      disabled={disabled}
      title={title}
    >
      <span className={styles.check} aria-hidden>{selected ? '✓' : ''}</span>
      <span className={styles.itemLabel}>{children}</span>
      {hint && <span className={styles.itemHint}>{hint}</span>}
    </button>
  );
}

/** Row of mutually exclusive choices inside a menu. */
export function MenuSegments<T extends string>({
  options,
  value,
  onChange,
  isDisabled,
}: {
  options: { id: T; label: string; title?: string }[];
  value: T;
  onChange: (id: T) => void;
  isDisabled?: (id: T) => boolean;
}) {
  return (
    <div className={styles.segments}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`${styles.segment} ${value === o.id ? styles.segmentOn : ''}`}
          onClick={() => onChange(o.id)}
          disabled={isDisabled?.(o.id)}
          title={o.title}
          aria-pressed={value === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
