import { useMemo, useState } from 'react';
import { useAppStore } from '../../store';
import { getCalculationTargetObject } from '../../store/reliabilitySettings';
import { go, stop, togglePlay } from '../../playback/controls';
import { formatTimecode } from '../../playback/timecode';
import { usePlayhead, useTransportState } from '../../playback/useTransport';
import type { MaterialPreviewMode, ViewPreset } from '../../types';
import { formatLength } from '../../utils/units';
import { APP_NAME_SHORT } from '../../branding/appName';
import { Viewport } from '../Viewport';
import { IlluminanceLegend } from '../components/IlluminanceLegend';
import { buildViewerSummary } from './viewerSummary';
import styles from './PhoneViewer.module.css';

const LOGO_URL = `${import.meta.env.BASE_URL}logo.svg`;

const SHOW_OPTIONS: { id: MaterialPreviewMode; label: string }[] = [
  { id: 'projectionPreview', label: 'Picture' },
  { id: 'illuminance', label: 'Brightness' },
  { id: 'pixelDensity', label: 'Sharpness' },
  { id: 'blendSum', label: 'Blends' },
];

const VIEWS: { id: ViewPreset; label: string }[] = [
  { id: 'persp', label: '3D' },
  { id: 'front', label: 'Front' },
  { id: 'top', label: 'Top' },
  { id: 'side', label: 'Side' },
];

/** v6: phone layout for looking at a project — the 3D view first, key numbers one tap away. */
export function PhoneViewer() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const projectName = useAppStore((s) => s.projectName);
  const setPhoneView = useAppStore((s) => s.setPhoneView);
  const previewMode = useAppStore((s) => s.materialPreviewMode);
  const setPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);
  const viewPreset = useAppStore((s) => s.viewPreset);
  const setViewPreset = useAppStore((s) => s.setViewPreset);
  const projectMessage = useAppStore((s) => s.projectMessage);

  // Projects saved on a computer remember open side panels; on a phone they are drawers, so start closed.
  const openEditor = () => {
    useAppStore.setState({
      leftPanelVisible: false,
      rightPanelVisible: false,
      layersPanelVisible: false,
      rasterPreviewPanelVisible: false,
      uvEditorPanelVisible: false,
    });
    setPhoneView(false);
  };

  return (
    <div className={styles.viewer} data-testid="phone-viewer">
      <header className={styles.header}>
        <img src={LOGO_URL} alt="" width={28} height={28} className={styles.logo} />
        <div className={styles.titleBlock}>
          <div className={styles.title}>{projectName || APP_NAME_SHORT}</div>
          {projectMessage ? <div className={styles.subtitle}>{projectMessage}</div> : null}
        </div>
        <button type="button" className={styles.editBtn} onClick={openEditor} data-testid="phone-edit">
          Edit
        </button>
      </header>

      <main className={styles.stage}>
        <Viewport viewOnly />
        {!detailsOpen ? <IlluminanceLegend /> : null}
      </main>

      <section className={`${styles.sheet} ${detailsOpen ? styles.sheetOpen : ''}`} aria-label="View options">
        <button
          type="button"
          className={styles.handle}
          onClick={() => setDetailsOpen(!detailsOpen)}
          aria-expanded={detailsOpen}
          data-testid="phone-details-toggle"
        >
          <span className={styles.grip} aria-hidden />
          <span>{detailsOpen ? 'Hide numbers' : 'Numbers'}</span>
        </button>
        <div className={styles.chips} role="group" aria-label="Show on surfaces">
          {SHOW_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={previewMode === o.id ? styles.chipOn : styles.chip}
              aria-pressed={previewMode === o.id}
              onClick={() => setPreviewMode(o.id)}
              data-testid={`phone-show-${o.id}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className={styles.chips} role="group" aria-label="Camera">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={viewPreset === v.id ? styles.chipOn : styles.chip}
              aria-pressed={viewPreset === v.id}
              onClick={() => setViewPreset(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        {detailsOpen ? <Details /> : null}
      </section>

      <PhoneTransport />
    </div>
  );
}

function Details() {
  const projectors = useAppStore((s) => s.projectors);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const targetId = useAppStore((s) => s.calculationTargetId);
  const results = useAppStore((s) => s.calculationResults);
  const previz = useAppStore((s) => s.previzSettings);
  const unit = useAppStore((s) => s.displayUnit);
  const summary = useMemo(
    () => buildViewerSummary(projectors, getCalculationTargetObject(sceneObjects, targetId), results, previz),
    [projectors, sceneObjects, targetId, results, previz],
  );
  const len = (m: number) => formatLength(m, unit, 2);
  const range = (v: { min: number; avg: number; max: number }, suffix: string) =>
    `${Math.round(v.avg)} ${suffix} (${Math.round(v.min)}–${Math.round(v.max)})`;

  return (
    <div className={styles.details} data-testid="phone-details">
      {summary.target ? (
        <div className={styles.card}>
          <div className={styles.cardTitle}>{summary.target.name}</div>
          <dl className={styles.facts}>
            <dt>Size</dt>
            <dd>
              {len(summary.target.width)} × {len(summary.target.height)}
            </dd>
            {summary.target.coveredPct != null ? (
              <>
                <dt>Covered</dt>
                <dd>{Math.round(summary.target.coveredPct)}%</dd>
              </>
            ) : null}
            {summary.target.nits ? (
              <>
                <dt>Brightness</dt>
                <dd data-testid="phone-brightness">{range(summary.target.nits, 'nits')}</dd>
              </>
            ) : null}
            {summary.target.pxPerM ? (
              <>
                <dt>Sharpness</dt>
                <dd data-testid="phone-density">
                  {range(summary.target.pxPerM, 'px/m')} · {(1000 / summary.target.pxPerM.avg).toFixed(1)} mm/px
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : (
        <div className={styles.card}>No calculation target set.</div>
      )}
      {summary.projectors.map((p) => (
        <div className={styles.card} key={p.id} data-testid="phone-projector-card">
          <div className={styles.cardTitle}>
            <span className={styles.dot} style={{ background: p.color }} aria-hidden />
            {p.name}
            {!p.enabled ? <span className={styles.off}> off</span> : null}
          </div>
          <dl className={styles.facts}>
            {p.model ? (
              <>
                <dt>Model</dt>
                <dd>{p.model}</dd>
              </>
            ) : null}
            {p.lens ? (
              <>
                <dt>Lens</dt>
                <dd>{p.lens}</dd>
              </>
            ) : null}
            <dt>Light</dt>
            <dd>{p.lumens.toLocaleString()} lm</dd>
            <dt>Throw</dt>
            <dd>
              {p.throwRatio.toFixed(2)}:1{p.distance != null ? ` at ${len(p.distance)}` : ''}
            </dd>
            {p.imageWidth != null && p.imageHeight != null ? (
              <>
                <dt>Image</dt>
                <dd>
                  {len(p.imageWidth)} × {len(p.imageHeight)}
                </dd>
              </>
            ) : null}
            {p.onTargetPct != null ? (
              <>
                <dt>On target</dt>
                <dd>{Math.round(p.onTargetPct)}% of its light</dd>
              </>
            ) : null}
          </dl>
        </div>
      ))}
    </div>
  );
}

function PhoneTransport() {
  const { playing } = useTransportState();
  const t = usePlayhead();
  const fps = useAppStore((s) => s.show.fps);
  return (
    <div className={styles.transport} aria-label="Transport">
      <button
        type="button"
        className={playing ? styles.playOn : styles.play}
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        data-testid="phone-play"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" className={styles.stop} onClick={stop} aria-label="Stop">
        ■
      </button>
      <span className={styles.timecode}>{formatTimecode(t, fps)}</span>
      <button type="button" className={styles.go} onClick={go} aria-label="GO, next cue">
        GO
      </button>
    </div>
  );
}
