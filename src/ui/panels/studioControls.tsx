import { useEffect, useState } from 'react';
import type { Vec2 } from '../../types';
import styles from './StudioPanel.module.css';

/** Pointer position inside an SVG in viewBox units. */
export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Vec2 {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function MiniNum({ label, value, step = 0.01, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(+value.toFixed(4)));
  useEffect(() => setDraft(String(+value.toFixed(4))), [value]);
  return (
    <label className={styles.mini}>
      {label}
      <input
        type="number"
        step={step}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

