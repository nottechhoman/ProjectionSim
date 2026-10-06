import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { mediaTextureCache } from '../../media/assetImport';
import { listSceneVideoSources, type VideoSourceRef } from '../../media/videoPlayback';
import { useAppStore } from '../../store';
import styles from './MediaDock.module.css';

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** One large, touch-friendly transport row for a single video asset. */
function VideoTrack({ source }: { source: VideoSourceRef }) {
  const { assetId, label } = source;
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
    const sync = () => {
      setDuration(video.duration || 0);
      setCurrentTime(video.currentTime);
      setMuted(video.muted);
      setLoop(video.loop);
      setPlaying(!video.paused);
    };
    const onTime = () => setCurrentTime(video.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    sync();
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onPause);
    return () => {
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onPause);
    };
  }, [assetId, videoPlaybackRevision]);

  const progress = duration > 0 ? (Math.min(currentTime, duration) / duration) * 100 : 0;

  return (
    <div className={styles.track} data-testid={`media-track-${assetId}`}>
      <button
        type="button"
        className={`${styles.playBtn} ${playing ? styles.playing : ''}`}
        onClick={() => toggleVideoPlayback(assetId)}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className={styles.trackBody}>
        <div className={styles.trackHeader}>
          <span className={styles.trackLabel} title={label}>{label}</span>
          <span className={styles.trackTime}>
            {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
          </span>
        </div>
        <input
          type="range"
          className={styles.seek}
          style={{ ['--progress' as string]: `${progress}%` }}
          min={0}
          max={duration || 0}
          step={0.05}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => seekVideo(assetId, parseFloat(event.target.value))}
          aria-label={`Timeline for ${label}`}
        />
      </div>
      <button
        type="button"
        className={`${styles.toggleBtn} ${!muted ? styles.on : ''}`}
        onClick={() => {
          setVideoMuted(assetId, !muted);
          setMuted(!muted);
        }}
        aria-pressed={!muted}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Muted' : 'Sound on'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button
        type="button"
        className={`${styles.toggleBtn} ${loop ? styles.on : ''}`}
        onClick={() => {
          setVideoLoop(assetId, !loop);
          setLoop(!loop);
        }}
        aria-pressed={loop}
        aria-label={loop ? 'Looping' : 'Play once'}
        title={loop ? 'Looping' : 'Play once'}
      >
        {loop ? '🔁' : '1×'}
      </button>
    </div>
  );
}

/**
 * Always-visible media bar: add a video or image to a projector and control
 * playback of every video in the scene with large, easy-to-press controls.
 */
export function MediaDock() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingKind, setPendingKind] = useState<'video' | 'image'>('video');
  const [open, setOpen] = useState(true);

  const projectors = useAppStore((s) => s.projectors);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const contentCanvas = useAppStore((s) => s.contentCanvas);
  const selectedProjectorId = useAppStore((s) => s.selectedProjectorId);
  const selectProjector = useAppStore((s) => s.setSelectedProjector);
  const importFile = useAppStore((s) => s.importFile);
  const playAllSceneVideos = useAppStore((s) => s.playAllSceneVideos);
  const pauseAllSceneVideos = useAppStore((s) => s.pauseAllSceneVideos);

  const target = projectors.find((p) => p.id === selectedProjectorId) ?? projectors[0];
  const videoSources = useMemo(
    () => listSceneVideoSources(projectors, sceneObjects, contentCanvas),
    [projectors, sceneObjects, contentCanvas],
  );

  const pick = (kind: 'video' | 'image') => {
    setPendingKind(kind);
    fileRef.current?.click();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await importFile(file);
    setOpen(true);
  };

  const hasTracks = videoSources.length > 0;

  return (
    <section className={styles.dock} data-testid="media-dock" aria-label="Media">
      <div className={styles.header}>
        {hasTracks ? (
          <button
            type="button"
            className={styles.titleBtn}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            title={open ? 'Hide players' : 'Show players'}
          >
            Media <span className={styles.count}>{videoSources.length}</span>
            <span className={styles.caret} aria-hidden>{open ? '▾' : '▴'}</span>
          </button>
        ) : (
          <span className={styles.title}>Media</span>
        )}

        {projectors.length > 1 && (
          <select
            className={styles.targetSelect}
            value={target?.id ?? ''}
            onChange={(e) => selectProjector(e.target.value)}
            aria-label="Projector to receive media"
          >
            {projectors.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className={styles.actions}>
          {videoSources.length > 1 && (
            <>
              <button type="button" className={styles.ghostBtn} onClick={playAllSceneVideos} title="Play all videos">
                ▶ All
              </button>
              <button type="button" className={styles.ghostBtn} onClick={pauseAllSceneVideos} title="Pause all videos">
                ❚❚ All
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => pick('image')}
            disabled={!target}
            data-testid="media-add-image"
            title={target ? `Add an image to ${target.name}` : undefined}
          >
            ＋ Image
          </button>
          <button
            type="button"
            className={styles.accentBtn}
            onClick={() => pick('video')}
            disabled={!target}
            data-testid="media-add-video"
            title={target ? `Add a video to ${target.name}` : undefined}
          >
            ＋ Video
          </button>
        </div>
      </div>

      {hasTracks && open && (
        <div className={styles.tracks}>
          {videoSources.map((source) => <VideoTrack key={source.assetId} source={source} />)}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        hidden
        accept={pendingKind === 'video' ? 'video/*' : 'image/*'}
        onChange={handleFile}
      />
    </section>
  );
}
