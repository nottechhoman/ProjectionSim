import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import { activeTrack } from '../../mapping/model';
import { transport } from '../../playback/clock';
import { addCueAtPlayhead, go } from '../../playback/controls';
import { nextCue, sectionAt, sortedCues, sortedSections } from '../../playback/showControl';
import { formatTimecode, parseTimecode } from '../../playback/timecode';
import { usePlayhead } from '../../playback/useTransport';
import type { SectionEndAction } from '../../types';
import { isCompactLayout } from '../deviceProfile';
import { useDeviceProfile } from '../useDeviceProfile';
import { TrackSelector } from './TrackSelector';
import styles from './LayersPanel.module.css';

function TimeInput({ value, fps, onChange }: { value: number; fps: number; onChange: (sec: number) => void }) {
  const [draft, setDraft] = useState(formatTimecode(value, fps));
  useEffect(() => setDraft(formatTimecode(value, fps)), [value, fps]);
  return (
    <input
      style={{ flex: '0 0 92px', fontFamily: 'ui-monospace, Menlo, monospace' }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const sec = parseTimecode(draft, fps);
        if (sec === null) setDraft(formatTimecode(value, fps));
        else if (Math.abs(sec - value) > 1e-6) onChange(sec);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Timecode"
    />
  );
}

/** Cue list with a big GO button, and the track's sections with their end actions. */
export function CuesPanel() {
  const profile = useDeviceProfile();
  const compact = isCompactLayout(profile);
  const visible = useAppStore((s) => s.cuesPanelVisible);
  const setVisible = useAppStore((s) => s.setCuesPanelVisible);
  const show = useAppStore((s) => s.show);
  const updateCue = useAppStore((s) => s.updateCue);
  const removeCue = useAppStore((s) => s.removeCue);
  const addSection = useAppStore((s) => s.addSection);
  const updateSection = useAppStore((s) => s.updateSection);
  const removeSection = useAppStore((s) => s.removeSection);
  const t = usePlayhead();
  if (!visible) return null;
  const track = activeTrack(show);
  const fps = show.fps;
  const next = nextCue(track, t, 1 / fps);
  const current = sectionAt(track, t);

  return (
    <div className={compact ? styles.compactShell : `${styles.shell} ${styles.shellRight}`} data-testid="cues-panel">
      <div className={styles.panel}>
        <div className={styles.header} data-panel-header>
          <span>Cues &amp; sections</span>
          <button type="button" className={styles.collapseBtn} onClick={() => setVisible(false)} title="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Setlist</div>
            <TrackSelector />
          </div>
          <div className={styles.section}>
            <button type="button" className={styles.goBtn} onClick={go} data-testid="cue-go" title="GO (Enter)">
              GO
            </button>
            <p className={styles.standby} data-testid="cue-standby">
              {next ? (
                <>
                  Standby: <b>{next.name}</b> at {formatTimecode(next.timeSec, fps)}
                </>
              ) : (
                'No cue ahead — GO plays on.'
              )}
            </p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Cues</div>
            {track.cues.length === 0 ? <p className={styles.hint}>No cues. Press M (or “+ Cue”) to drop one at the playhead.</p> : null}
            {sortedCues(track).map((cue) => (
              <div key={cue.id} className={`${styles.cueRow} ${next?.id === cue.id ? styles.cueNext : ''}`}>
                <span className={styles.cueTime} onClick={() => transport.seek(cue.timeSec)} title="Jump here">
                  {formatTimecode(cue.timeSec, fps)}
                </span>
                <input value={cue.name} onChange={(e) => updateCue(cue.id, { name: e.target.value })} aria-label="Cue name" />
                <button type="button" className={styles.iconBtn} onClick={() => updateCue(cue.id, { timeSec: transport.time() })} title="Move to playhead">
                  ⇥
                </button>
                <button type="button" className={styles.iconBtn} onClick={() => removeCue(cue.id)} title="Delete cue">
                  ×
                </button>
              </div>
            ))}
            <div className={styles.addRow}>
              <button type="button" className={styles.addBtn} onClick={addCueAtPlayhead} data-testid="cue-add">
                + Cue at playhead
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Sections</div>
            {track.sections.length === 0 ? <p className={styles.hint}>No sections. A section sets what happens at its end.</p> : null}
            {sortedSections(track).map((sec) => (
              <div key={sec.id} style={{ marginBottom: 8 }}>
                <div className={styles.cueRow}>
                  <input value={sec.name} onChange={(e) => updateSection(sec.id, { name: e.target.value })} aria-label="Section name" style={current?.id === sec.id ? { borderColor: '#3ddc84' } : undefined} />
                  <select value={sec.endAction} onChange={(e) => updateSection(sec.id, { endAction: e.target.value as SectionEndAction })} aria-label="End action">
                    <option value="continue">At end: continue</option>
                    <option value="stop">At end: stop (rewind)</option>
                    <option value="hold">At end: hold last frame</option>
                    <option value="loop">At end: loop</option>
                  </select>
                  <button type="button" className={styles.iconBtn} onClick={() => removeSection(sec.id)} title="Delete section">
                    ×
                  </button>
                </div>
                <div className={styles.cueRow}>
                  <TimeInput value={sec.startSec} fps={fps} onChange={(startSec) => updateSection(sec.id, { startSec })} />
                  <span className={styles.cueTime}>→</span>
                  <TimeInput value={sec.endSec} fps={fps} onChange={(endSec) => updateSection(sec.id, { endSec })} />
                  <button type="button" className={styles.iconBtn} onClick={() => transport.seek(sec.startSec)} title="Go to start">
                    ⏮
                  </button>
                </div>
              </div>
            ))}
            <div className={styles.addRow}>
              <button
                type="button"
                className={styles.addBtn}
                data-testid="section-add"
                onClick={() => {
                  const start = transport.time();
                  const nextCueAfter = nextCue(track, start, 1 / fps);
                  const end = Math.min(track.durationSec, nextCueAfter ? nextCueAfter.timeSec : start + 10);
                  addSection(start, end > start ? end : Math.min(track.durationSec, start + 10));
                }}
              >
                + Section from playhead
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <button type="button" className={styles.addBtn} onClick={() => useAppStore.getState().setControlPanelVisible(true)} data-testid="open-control">
              External control (MIDI / MSC / MTC / OSC)…
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Keys</div>
            <div className={styles.kbd}>
              Space play / pause · Enter GO · Esc stop · ← → frame · Shift+← → previous / next cue · L loop section · M add cue
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
