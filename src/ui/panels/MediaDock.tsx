import { useRef, useState, type ChangeEvent } from 'react';
import { useAppStore } from '../../store';
import { transport } from '../../playback/clock';
import { formatTimecode } from '../../playback/timecode';
import { usePlayhead, useTransportState } from '../../playback/useTransport';
import { activeTrack } from '../../mapping/model';
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
          onClick={() => (playing ? transport.pause() : transport.play())}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          data-testid="transport-play"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => {
            transport.pause();
            transport.seek(0);
          }}
          aria-label="Stop"
          title="Stop (Esc)"
          data-testid="transport-stop"
        >
          ■
        </button>
        <span className={styles.timecode} data-testid="transport-timecode">
          {formatTimecode(t, show.fps)}
        </span>
        <span className={styles.trackTime}>/ {formatTimecode(track.durationSec, show.fps)}</span>
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
        <div className={styles.actions}>
          <button type="button" className={styles.ghostBtn} onClick={() => pick('image')} data-testid="media-add-image" title="Add an image layer">
            ＋ Image
          </button>
          <button type="button" className={styles.accentBtn} onClick={() => pick('video')} data-testid="media-add-video" title="Add a video layer">
            ＋ Video
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" hidden accept={pendingKind === 'video' ? 'video/*' : 'image/*'} onChange={handleFile} />
    </section>
  );
}
