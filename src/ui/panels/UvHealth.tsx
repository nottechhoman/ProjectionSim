import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import type { SceneObject } from '../../types';
import type { UvReport } from '../../mapping/uvAtlas';
import type { SceneEngine } from '../../scene/SceneEngine';
import styles from './Inspector.module.css';

function engine(): SceneEngine | undefined {
  return (window as Window & { __projectionLabEngine?: SceneEngine }).__projectionLabEngine;
}

export function uvProblem(r: UvReport | null): string | null {
  if (!r) return null;
  if (r.missing) return 'has no UVs';
  if (r.overlap > 0.02) return `has overlapping UVs (${Math.round(r.overlap * 100)}% of its UV area is reused)`;
  if (r.outside > 0.02) return `has UVs outside 0–1 (${Math.round(r.outside * 100)}% of triangles)`;
  return null;
}

/** Warns when a screen's UV layout cannot carry a screen texture, and offers a generated atlas. */
export function UvHealth({ obj }: { obj: SceneObject }) {
  const setAtlas = useAppStore((s) => s.setSceneObjectUvAtlas);
  const [report, setReport] = useState<UvReport | null>(null);
  const key = JSON.stringify([obj.id, obj.type, obj.dimensions, obj.curved, obj.modelAssetId, obj.modelScale, obj.uvAtlas]);
  useEffect(() => {
    setReport(null);
    const t = setTimeout(() => setReport(engine()?.getUvReport(obj.id) ?? null), 120);
    return () => clearTimeout(t);
  }, [key]);
  const problem = uvProblem(report);
  if (obj.type !== 'model') {
    return problem ? <p className={styles.hint} style={{ color: '#e0c070' }} data-testid="uv-warning">⚠ This screen {problem}.</p> : null;
  }
  if (obj.uvAtlas) {
    return (
      <p className={styles.hint} data-testid="uv-atlas-on">
        Using a generated non-overlapping UV atlas{problem ? ` (still ${problem})` : ''}.{' '}
        <button type="button" className={styles.linkBtn} onClick={() => setAtlas(obj.id, false)}>
          Use the model&apos;s own UVs
        </button>
      </p>
    );
  }
  if (!problem) return null;
  return (
    <p className={styles.hint} style={{ color: '#e0c070' }} data-testid="uv-warning">
      ⚠ This model {problem}: layers mapped onto it would show in several places or not at all.{' '}
      <button type="button" className={styles.linkBtn} onClick={() => setAtlas(obj.id, true)} data-testid="uv-atlas-generate">
        Generate non-overlapping UVs
      </button>
    </p>
  );
}
