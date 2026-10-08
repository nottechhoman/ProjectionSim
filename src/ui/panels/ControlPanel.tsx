import { useState } from 'react';
import { useAppStore } from '../../store';
import { useControl } from '../../control/service';
import { CONTROL_ACTION_LABEL, type ControlAction } from '../../control/commands';
import { describeTrigger } from '../../control/settings';
import { isCompactLayout } from '../deviceProfile';
import { useDeviceProfile } from '../useDeviceProfile';
import styles from './LayersPanel.module.css';

const LEARNABLE: ControlAction[] = ['go', 'togglePlay', 'play', 'pause', 'stop', 'nextCue', 'prevCue'];

/** External control: MIDI bindings with learn, MIDI Show Control, MTC chase, OSC bridge. */
export function ControlPanel() {
  const profile = useDeviceProfile();
  const compact = isCompactLayout(profile);
  const visible = useAppStore((s) => s.controlPanelVisible);
  const setVisible = useAppStore((s) => s.setControlPanelVisible);
  const control = useControl();
  const [cueNumber, setCueNumber] = useState('1');
  if (!visible) return null;
  const s = control.settings;
  const st = control.status;
  const learning = st.learning;

  return (
    <div className={compact ? styles.compactShell : `${styles.shell} ${styles.shellRight}`} data-testid="control-panel">
      <div className={styles.panel}>
        <div className={styles.header} data-panel-header>
          <span>External control</span>
          <button type="button" className={styles.collapseBtn} onClick={() => setVisible(false)} title="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>MIDI</div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={s.midiEnabled} onChange={(e) => control.update({ midiEnabled: e.target.checked })} data-testid="midi-enabled" />
              Listen to MIDI <span className={styles.hint}>({st.midi})</span>
            </label>
            {s.midiEnabled ? (
              <div className={styles.row}>
                <label>Input</label>
                <select value={s.midiInputId ?? ''} onChange={(e) => control.update({ midiInputId: e.target.value || null })} data-testid="midi-input">
                  <option value="">All inputs</option>
                  {st.inputs.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <p className={styles.hint} data-testid="midi-last">
              Last MIDI: {st.lastMidi} · last command: {st.lastCommand}
            </p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Bindings</div>
            {learning ? (
              <p className={styles.standby} data-testid="midi-learning">
                Learning <b>{CONTROL_ACTION_LABEL[learning.action]}{learning.cue ? ` ${learning.cue}` : ''}</b> — press a key or move a control…{' '}
                <button type="button" className={styles.iconBtn} onClick={() => control.cancelLearn()}>
                  cancel
                </button>
              </p>
            ) : null}
            {s.bindings.length === 0 ? <p className={styles.hint}>No bindings. Press Learn, then a MIDI key or button.</p> : null}
            {s.bindings.map((b) => (
              <div key={b.id} className={styles.cueRow} data-testid={`binding-${b.action}`}>
                <span style={{ flex: 1, fontSize: 12 }}>
                  {CONTROL_ACTION_LABEL[b.action]}
                  {b.action === 'cue' ? ` ${b.cue}` : ''}
                </span>
                <span className={styles.cueTime}>{describeTrigger(b.trigger)}</span>
                <button type="button" className={styles.iconBtn} onClick={() => control.removeBinding(b.id)} title="Remove binding">
                  ×
                </button>
              </div>
            ))}
            <div className={styles.addRow} style={{ flexWrap: 'wrap' }}>
              {LEARNABLE.map((a) => (
                <button key={a} type="button" className={styles.addBtn} onClick={() => control.learn(a)} disabled={!s.midiEnabled} data-testid={`learn-${a}`}>
                  Learn {CONTROL_ACTION_LABEL[a]}
                </button>
              ))}
            </div>
            <div className={styles.cueRow} style={{ marginTop: 6 }}>
              <span style={{ fontSize: 12 }}>Cue #</span>
              <input value={cueNumber} onChange={(e) => setCueNumber(e.target.value)} aria-label="Cue number to bind" style={{ maxWidth: 70 }} />
              <button type="button" className={styles.addBtn} onClick={() => control.learn('cue', cueNumber.trim() || '1')} disabled={!s.midiEnabled}>
                Learn cue
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>MIDI Show Control</div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={s.mscEnabled} onChange={(e) => control.update({ mscEnabled: e.target.checked })} />
              Answer MSC (GO [cue], STOP, RESUME, RESET)
            </label>
            <div className={styles.row}>
              <label>Device ID</label>
              <input
                type="number"
                min={0}
                max={127}
                value={s.mscDeviceId}
                onChange={(e) => control.update({ mscDeviceId: Math.min(127, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                aria-label="MSC device id"
              />
            </div>
            <p className={styles.hint}>127 = all-call. GO with a cue number jumps to the cue with that name (or the N-th cue) and plays.</p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>MIDI Timecode</div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={s.mtcChase} onChange={(e) => control.update({ mtcChase: e.target.checked })} data-testid="mtc-chase" />
              Chase incoming MTC
            </label>
            <div className={styles.row}>
              <label>Offset s</label>
              <input type="number" step={1} value={s.mtcOffsetSec} onChange={(e) => control.update({ mtcOffsetSec: Number(e.target.value) || 0 })} aria-label="MTC offset" />
            </div>
            <p className={styles.hint} data-testid="mtc-status">
              Timecode: {st.mtc}. The playhead locates when more than 2 frames off, runs while timecode arrives, stops when it goes quiet. Offset −3600 makes 01:00:00:00 the show start.
            </p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>OSC (via bridge)</div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={s.oscEnabled} onChange={(e) => control.update({ oscEnabled: e.target.checked })} data-testid="osc-enabled" />
              Connect to the OSC bridge <span className={styles.hint}>({st.osc})</span>
            </label>
            <div className={styles.row}>
              <label>Bridge</label>
              <input value={s.oscUrl} onChange={(e) => control.update({ oscUrl: e.target.value })} aria-label="OSC bridge URL" />
            </div>
            <p className={styles.hint}>
              Run <code>node tools/osc-bridge/index.mjs</code> in the project folder, then send OSC to UDP 9000: /show/go, /show/play, /show/pause, /show/stop, /show/next, /show/prev, /show/cue N, /show/locate seconds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
