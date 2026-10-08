import { useAppStore } from '../store';
import { activeTrack } from '../mapping/model';
import { transport } from './clock';
import { goTarget, nextCue, prevCue, sectionAt } from './showControl';
import { snapToFrame } from './timecode';
import { findCue, type ControlCommand } from '../control/commands';

/** Transport commands shared by the buttons and keyboard shortcuts. */

function track() {
  return activeTrack(useAppStore.getState().show);
}

function frameSec(): number {
  return 1 / useAppStore.getState().show.fps;
}

export function togglePlay(): void {
  if (transport.playing) transport.pause();
  else {
    if (transport.time() >= track().durationSec - 1e-3) transport.seek(0);
    transport.play();
  }
}

export function stop(): void {
  transport.pause();
  transport.seek(0);
}

/** GO: play from the cue we stand on, else jump to the next cue and play. */
export function go(): void {
  const target = goTarget(track(), transport.time(), transport.playing, frameSec());
  if (target.seek !== null) transport.seek(target.seek);
  if (!transport.playing) transport.play();
}

/** Step whole frames (pauses first). */
export function stepFrame(direction: 1 | -1): void {
  const fps = useAppStore.getState().show.fps;
  transport.pause();
  const t = snapToFrame(transport.time(), fps) + direction / fps;
  transport.seek(Math.min(track().durationSec, Math.max(0, t)));
}

/** Jump to the previous / next cue (keeps playing state). */
export function jumpCue(direction: 1 | -1): void {
  const tr = track();
  const cue = direction > 0 ? nextCue(tr, transport.time(), frameSec()) : prevCue(tr, transport.time(), frameSec());
  if (cue) transport.seek(cue.timeSec);
  else if (direction < 0) transport.seek(0);
}

export function addCueAtPlayhead(): void {
  const fps = useAppStore.getState().show.fps;
  useAppStore.getState().addCue(snapToFrame(transport.time(), fps));
}

/** L: loop the current section (or back to normal play). */
export function toggleLoopSection(): void {
  const st = useAppStore.getState();
  if (st.playMode === 'loopSection') {
    st.setPlayMode('play');
    return;
  }
  st.setPlayMode('loopSection');
  if (!sectionAt(track(), transport.time())) {
    useAppStore.setState({ projectMessage: 'Loop section: the playhead is not inside a section' });
  }
}

/** Run an external control command (MIDI / MSC / OSC). */
export function runCommand(cmd: ControlCommand): string {
  switch (cmd.type) {
    case 'go':
      go();
      return 'GO';
    case 'play':
      transport.play();
      return 'Play';
    case 'pause':
      transport.pause();
      return 'Pause';
    case 'togglePlay':
      togglePlay();
      return transport.playing ? 'Play' : 'Pause';
    case 'stop':
      stop();
      return 'Stop';
    case 'nextCue':
      jumpCue(1);
      return 'Next cue';
    case 'prevCue':
      jumpCue(-1);
      return 'Previous cue';
    case 'cue': {
      const cue = findCue(track(), cmd.number);
      if (!cue) return `No cue "${cmd.number}"`;
      transport.seek(cue.timeSec);
      if (!transport.playing) transport.play();
      return `Cue ${cue.name}`;
    }
    case 'locate':
      transport.seek(Math.min(track().durationSec, cmd.seconds));
      return `Locate ${cmd.seconds.toFixed(2)} s`;
  }
}
