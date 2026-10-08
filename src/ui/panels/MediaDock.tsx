import { useRef, useState, type ChangeEvent } from 'react';
import { useAppStore } from '../../store';
import { transport } from '../../playback/clock';
import { go, stop, togglePlay } from '../../playback/controls';
import type { PlayMode } from '../../playback/showControl';
import { formatTimecode } from '../../playback/timecode';
import { usePlayhead, useTransportState } from '../../playback/useTransport';
import { activeTrack } from '../../mapping/model';
import { useDeviceProfile } from '../useDeviceProfile';
import { TimelineDock } from './TimelineDock';
import styles from './MediaDock.module.css';

const RATES = [0.25, 0.5, 1, 1.5, 2];

/** Transport bar: play / pause / stop, timecode, rate, and quick media import (as layers). */
export function MediaDock() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingKind, setPendingKind] = useState<'video' | 'image'>('video');
  const importLayerMedia = useAppStore((s) => s.importLayerMedia);
  const show = useAppStore((s) => s.show);
  const { playing, rate } = useTransportState();
  const t = usePlayhead();
  const track = activeTrack(show);
  const profile = useDeviceProfile();
  const timelineVisible = useAppStore((s) => s.timelineVisible);
  const toggleTimeline = useAppStore((s) => s.toggleTimeline);
  const showTimeline = profile !== 'phone' && timelineVisible;
  const playMode = useAppStore((s) => s.playMode);
  const setPlayMode = useAppStore((s) => s.setPlayMode);
  const cuesVisible = useAppStore((s) => s.cuesPanelVisible);
  const setCuesVisible = useAppStore((s) => s.setCuesPanelVisible);

  const pick = (kind: 'video' | 'image') => {
    setPendingKind(kind);
    fileRef.current?.click();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await importLayerMedia(file, pendingKind);
  };

  return (
    <section className={styles.dock} data-testid="media-dock" aria-label="Transport">
      <div className={styles.header}>
        <button
          type="button"
          className={`${styles.playBtn} ${playing ? styles.playing : ''}`}
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          data-testid="transport-play"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={stop}
          aria-label="Stop"
          title="Stop (Esc)"
          data-testid="transport-stop"
        >
          ■
        </button>
        <span className={styles.timecode} data-testid="transport-timecode">
          {formatTimecode(t, show.fps)}
        </span>
        {profile !== 'phone' ? <span className={styles.trackTime}>/ {formatTimecode(track.durationSec, show.fps)}</span> : null}
        <select
          className={styles.targetSelect}
          value={rate}
          onChange={(e) => transport.setRate(Number(e.target.value))}
          aria-label="Playback rate"
          title="Playback rate"
        >
          {RATES.map((r) => (
            <option key={r} value={r}>{r}×</option>
          ))}
        </select>
        {profile !== 'phone' ? (
          <select
            className={styles.targetSelect}
            value={playMode}
            onChange={(e) => setPlayMode(e.target.value as PlayMode)}
            aria-label="Play mode"
            title="Play mode (L toggles loop section)"
            data-testid="play-mode"
          >
            <option value="play">Play</option>
            <option value="playSection">Play section</option>
            <option value="loopSection">Loop section</option>
          </select>
        ) : null}
        <button type="button" className={styles.goBtn} onClick={go} title="GO — next cue (Enter)" data-testid="transport-go">
          GO
        </button>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.ghostBtn} ${cuesVisible ? styles.on : ''}`}
            onClick={() => setCuesVisible(!cuesVisible)}
            data-testid="cues-toggle"
            title="Cues & sections"
          >
            Cues
          </button>
          {profile !== 'phone' ? (
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={toggleTimeline}
              aria-expanded={timelineVisible}
              data-testid="timeline-toggle"
              title={timelineVisible ? 'Hide timeline' : 'Show timeline'}
            >
              Timeline {timelineVisible ? '▾' : '▴'}
            </button>
          ) : null}
          {profile !== 'phone' ? (
            <>
              <button type="button" className={styles.ghostBtn} onClick={() => pick('image')} data-testid="media-add-image" title="Add an image layer">
                ＋ Image
              </button>
              <button type="button" className={styles.accentBtn} onClick={() => pick('video')} data-testid="media-add-video" title="Add a video layer">
                ＋ Video
              </button>
            </>
          ) : null}
        </div>
      </div>
      {showTimeline ? <TimelineDock compact={profile === 'tablet'} /> : null}
      <input ref={fileRef} type="file" hidden accept={pendingKind === 'video' ? 'video/*' : 'image/*'} onChange={handleFile} />
    </section>
  );
}
