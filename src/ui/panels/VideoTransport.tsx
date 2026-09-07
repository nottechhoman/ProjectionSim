import { useEffect, useState } from 'react';
import { mediaTextureCache } from '../../media/assetImport';
import { useAppStore } from '../../store';
import styles from './BottomPanel.module.css';

interface VideoTransportProps {
  assetId: string;
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function VideoTransport({ assetId }: VideoTransportProps) {
  const videoPlaying = useAppStore((s) => s.videoPlaying);
  const toggleVideoPlayback = useAppStore((s) => s.toggleVideoPlayback);
  const seekVideo = useAppStore((s) => s.seekVideo);
  const setVideoMuted = useAppStore((s) => s.setVideoMuted);
  const setVideoLoop = useAppStore((s) => s.setVideoLoop);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loop, setLoop] = useState(true);

  useEffect(() => {
    const video = mediaTextureCache.get(assetId)?.video;
    if (!video) return;

    const syncMeta = () => {
      setDuration(video.duration || 0);
      setCurrentTime(video.currentTime);
      setMuted(video.muted);
      setLoop(video.loop);
    };

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onEnded = () => useAppStore.setState({ videoPlaying: false });

    syncMeta();
    video.addEventListener('loadedmetadata', syncMeta);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('loadedmetadata', syncMeta);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
    };
  }, [assetId]);

  return (
    <div className={styles.videoTransport}>
      <button type="button" className={styles.videoBtn} onClick={toggleVideoPlayback}>
        {videoPlaying ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        className={styles.videoSeek}
        min={0}
        max={duration || 0}
        step={0.05}
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => seekVideo(parseFloat(event.target.value))}
        aria-label="Video timeline"
      />
      <span className={styles.videoTime}>
        {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
      </span>
      <button
        type="button"
        className={styles.videoBtn}
        onClick={() => {
          setVideoMuted(!muted);
          setMuted(!muted);
        }}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <button
        type="button"
        className={styles.videoBtn}
        onClick={() => {
          setVideoLoop(!loop);
          setLoop(!loop);
        }}
      >
        {loop ? 'Loop' : 'Once'}
      </button>
    </div>
  );
}
