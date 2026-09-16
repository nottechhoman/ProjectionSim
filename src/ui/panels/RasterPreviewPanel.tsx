import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { isCompactLayout } from '../deviceProfile';
import { useDeviceProfile } from '../useDeviceProfile';
import type { SceneEngine } from '../../scene/SceneEngine';
import styles from './RasterPreviewPanel.module.css';

function engine(): SceneEngine | undefined {
  return (window as Window & { __projectionLabEngine?: SceneEngine }).__projectionLabEngine;
}

function PreviewThumb({
  projectorId,
  aspect,
  revision,
}: {
  projectorId: string;
  aspect: number;
  revision: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const src = engine()?.getRasterPreviewCanvas(projectorId);
    const dst = canvasRef.current;
    if (!src || !dst) return;
    if (dst.width !== src.width || dst.height !== src.height) {
      dst.width = src.width;
      dst.height = src.height;
    }
    const ctx = dst.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
  }, [projectorId, revision]);

  return (
    <div className={styles.thumbWrap} style={{ aspectRatio: String(aspect > 0 ? aspect : 16 / 9) }}>
      <canvas ref={canvasRef} className={styles.thumb} />
    </div>
  );
}

export function RasterPreviewPanel() {
  const deviceProfile = useDeviceProfile();
  const compact = isCompactLayout(deviceProfile);
  const visible = useAppStore((s) => s.rasterPreviewPanelVisible);
  const projectors = useAppStore((s) => s.projectors);
  const revision = useAppStore((s) => s.rasterPreviewRevision);
  const toggle = useAppStore((s) => s.toggleRasterPreviewPanel);

  const enabled = projectors.filter((p) => p.enabled);

  if (!visible) return null;

  return (
    <div className={compact ? styles.compactShell : styles.shell} data-testid="raster-preview-panel">
      <div className={styles.panel}>
        <div className={styles.header} data-panel-header>
          <span>Projector output</span>
          <button type="button" className={styles.collapseBtn} onClick={toggle} title="Close output preview">
            ×
          </button>
        </div>
        <div className={styles.body}>
          {enabled.length === 0 ? (
            <p className={styles.hint}>No enabled projectors.</p>
          ) : (
            enabled.map((projector) => {
              const { width, height } = projector.optics.resolution;
              return (
                <div key={projector.id} className={styles.card}>
                  <div className={styles.cardLabel}>
                    {projector.name} — {width}×{height}
                  </div>
                  <PreviewThumb
                    projectorId={projector.id}
                    aspect={projector.optics.aspectRatio}
                    revision={revision}
                  />
                </div>
              );
            })
          )}
          <p className={styles.hint}>
            Each thumbnail is that projector&apos;s output raster with blend ramp and brightness
            applied.
          </p>
        </div>
      </div>
    </div>
  );
}
