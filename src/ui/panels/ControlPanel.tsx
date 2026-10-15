import { useState } from 'react';
import { useAppStore } from '../../store';
import { useControl } from '../../control/service';
import { CONTROL_ACTION_LABEL, type ControlAction } from '../../control/commands';
import { describeTrigger, isValidOscHost, oscTargetString } from '../../control/settings';
import { clampRateHz, MAX_TIME_RATE_HZ } from '../../control/oscFeedback';
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
  const [newHost, setNewHost] = useState('127.0.0.1');
  const [newPort, setNewPort] = useState('53000');
  if (!visible) return null;
  const s = control.settings;
  const st = control.status;
  const learning = st.learning;
  const newPortNum = Math.round(Number(newPort));
  const newTargetValid = isValidOscHost(newHost.trim()) && newPortNum >= 1 && newPortNum <= 65535;
  const addTarget = () => {
    if (!newTargetValid) return;
    const host = newHost.trim();
    if (s.oscSendTargets.some((t) => t.host === host && t.port === newPortNum)) return;
    control.update({ oscSendTargets: [...s.oscSendTargets, { id: `target-${Date.now().toString(36)}`, host, port: newPortNum }] });
  };

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
            <div className={styles.sectionTitle}>OSC</div>
            <p className={styles.standby} data-testid="osc-status">
              {s.oscEnabled ? (
                st.osc === 'connected' ? (
                  <>
                    <b style={{ color: '#3ddc84' }}>● Bridge connected</b> — send OSC to UDP port <b>{st.oscUdpPort ?? '?'}</b> on this machine
                  </>
                ) : st.osc === 'connecting' ? (
                  <>◌ Connecting to the bridge…</>
                ) : (
                  <>
                    <b style={{ color: '#e0c070' }}>● No bridge</b> at {s.oscUrl} — retrying. With <code>npm run dev</code> it starts automatically; otherwise run{' '}
                    <code>node tools/osc-bridge/index.mjs</code>.
                  </>
                )
              ) : (
                <>OSC is off. Tick “Receive OSC” and run <code>npm run osc-bridge</code> on this computer.</>
              )}
            </p>
            <p className={styles.hint} data-testid="osc-last">
              Last OSC:{' '}
              {st.lastOsc ? (
                <>
                  <b>
                    {st.lastOsc.address} {st.lastOsc.args.map((a) => JSON.stringify(a)).join(' ')}
                  </b>{' '}
                  → {st.lastOsc.result} · {new Date(st.lastOsc.at).toLocaleTimeString()}
                  {st.lastOsc.from ? ` from ${st.lastOsc.from}` : ''}
                </>
              ) : (
                'none yet'
              )}
            </p>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={s.oscEnabled} onChange={(e) => control.update({ oscEnabled: e.target.checked })} data-testid="osc-enabled" />
              Receive OSC
            </label>
            <div className={styles.row}>
              <label>Bridge</label>
              <input value={s.oscUrl} onChange={(e) => control.update({ oscUrl: e.target.value })} aria-label="OSC bridge URL" />
            </div>
            <p className={styles.hint}>
              /show/go, /show/play, /show/pause, /show/toggle, /show/stop, /show/next, /show/prev, /show/cue N, /show/locate seconds. Test with{' '}
              <code>node tools/osc-bridge/send.mjs /show/go</code>.
            </p>
          </div>

          <div className={styles.section} data-testid="osc-send-section">
            <div className={styles.sectionTitle}>Send OSC (feedback)</div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={s.oscSendEnabled} onChange={(e) => control.update({ oscSendEnabled: e.target.checked })} data-testid="osc-send-enabled" />
              Send OSC
            </label>
            <p className={styles.standby} data-testid="osc-send-status">
              {!s.oscSendEnabled ? (
                <>Off — nothing is sent.</>
              ) : st.osc === 'connected' ? (
                s.oscSendTargets.length > 0 ? (
                  <>
                    <b style={{ color: '#3ddc84' }}>● Sending</b> to {s.oscSendTargets.map(oscTargetString).join(', ')} through the bridge
                  </>
                ) : (
                  <>
                    <b style={{ color: '#e0c070' }}>● No targets</b> — add one below (or start the bridge with <code>--send host:port</code>).
                  </>
                )
              ) : st.osc === 'connecting' ? (
                <>◌ Connecting to the bridge…</>
              ) : (
                <>
                  <b style={{ color: '#e06060' }}>● Not sending: can’t reach the OSC bridge</b> at {s.oscUrl}. Browsers can’t send OSC themselves — on this computer run{' '}
                  <code>npm run osc-bridge</code> (with <code>npm run dev</code> it starts automatically). Retrying…
                </>
              )}
            </p>
            {s.oscSendTargets.map((t) => (
              <div key={t.id} className={styles.cueRow} data-testid="osc-send-target">
                <span style={{ flex: 1, fontSize: 12 }}>{oscTargetString(t)}</span>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => control.update({ oscSendTargets: s.oscSendTargets.filter((x) => x.id !== t.id) })}
                  title="Remove target"
                  aria-label={`Remove target ${oscTargetString(t)}`}
                >
                  ×
                </button>
              </div>
            ))}
            <div className={styles.cueRow}>
              <input value={newHost} onChange={(e) => setNewHost(e.target.value)} aria-label="OSC target host" placeholder="host" style={{ flex: 2, minWidth: 0 }} />
              <input
                value={newPort}
                onChange={(e) => setNewPort(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTarget()}
                aria-label="OSC target port"
                inputMode="numeric"
                style={{ flex: 1, minWidth: 0, maxWidth: 70 }}
              />
              <button type="button" className={styles.addBtn} onClick={addTarget} disabled={!newTargetValid} data-testid="osc-send-add">
                Add
              </button>
            </div>
            <div className={styles.row}>
              <label>Time rate Hz</label>
              <input
                type="number"
                min={1}
                max={MAX_TIME_RATE_HZ}
                value={s.oscSendRateHz}
                onChange={(e) => control.update({ oscSendRateHz: clampRateHz(Number(e.target.value)) })}
                aria-label="OSC time rate"
                data-testid="osc-send-rate"
              />
            </div>
            <p className={styles.hint} data-testid="osc-send-time">
              /show/time, /show/timecode while playing:{' '}
              {st.oscLastTime ? `${st.oscLastTime.timecode} (${st.oscLastTime.seconds.toFixed(2)} s)` : 'none yet'}
            </p>
            <div className={styles.hint}>Last sent:</div>
            <ol className={styles.hint} data-testid="osc-send-log" style={{ margin: '2px 0 0', paddingLeft: 18, maxHeight: 160, overflowY: 'auto' }}>
              {st.oscSendLog.length === 0 ? <li style={{ listStyle: 'none', marginLeft: -18 }}>nothing yet</li> : null}
              {st.oscSendLog.map((e, i) => (
                <li key={`${e.at}-${i}`} style={e.error ? { color: '#e06060' } : undefined}>
                  {e.error ? `Bridge: ${e.error}` : `${e.address} ${e.args.map((a) => JSON.stringify(a)).join(' ')}`}{' '}
                  <span style={{ opacity: 0.6 }}>{new Date(e.at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ol>
            <p className={styles.hint}>
              Sent on change: /show/state, /show/cue, /show/section, /show/track, /show/go/ack. Works with every trigger (buttons, keys, MIDI, MTC, OSC).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
