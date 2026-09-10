import { useEffect, useState } from 'react';
import { mediaTextureCache } from '../../media/assetImport';
import { isVideoPlaying } from '../../media/videoPlayback';
import { useAppStore } from '../../store';
import styles from './BottomPanel.module.css';

interface VideoTransportProps {
  assetId: string;
  label?: string;
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function VideoTransport({ assetId, label }: VideoTransportProps) {
  const videoPlaybackRevision = useAppStore((s) => s.videoPlaybackRevision);
  const toggleVideoPlayback = useAppStore((s) => s.toggleVideoPlayback);
  const seekVideo = useAppStore((s) => s.seekVideo);
  const setVideoMuted = useAppStore((s) => s.setVideoMuted);
  const setVideoLoop = useAppStore((s) => s.setVideoLoop);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loop, setLoop] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = mediaTextureCache.get(assetId)?.video;
    if (!video) return;

    const syncMeta = () => {
      setDuration(video.duration || 0);
      setCurrentTime(video.currentTime);
      setMuted(video.muted);
      setLoop(video.loop);
      setPlaying(!video.paused);
    };

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);

    syncMeta();
    video.addEventListener('loadedmetadata', syncMeta);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('loadedmetadata', syncMeta);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [assetId, videoPlaybackRevision]);

  useEffect(() => {
    setPlaying(isVideoPlaying(assetId));
  }, [assetId, videoPlaybackRevision]);

  return (
    <div className={styles.videoTransport} data-testid={`video-transport-${assetId}`}>
      {label && <span className={styles.videoLabel}>{label}</span>}
      <button type="button" className={styles.videoBtn} onClick={() => toggleVideoPlayback(assetId)}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        className={styles.videoSeek}
        min={0}
        max={duration || 0}
        step={0.05}
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => seekVideo(assetId, parseFloat(event.target.value))}
        aria-label={`Video timeline${label ? ` for ${label}` : ''}`}
      />
      <span className={styles.videoTime}>
        {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
      </span>
      <button
        type="button"
        className={styles.videoBtn}
        onClick={() => {
          setVideoMuted(assetId, !muted);
          setMuted(!muted);
        }}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <button
        type="button"
        className={styles.videoBtn}
        onClick={() => {
          setVideoLoop(assetId, !loop);
          setLoop(!loop);
        }}
      >
        {loop ? 'Loop' : 'Once'}
      </button>
    </div>
  );
}
