import { useMemo } from 'react';
import { listSceneContent } from '../../media/sceneContent';
import { useAppStore } from '../../store';
import styles from './LeftPanel.module.css';

export function ContentPanel() {
  const projectors = useAppStore((s) => s.projectors);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const mediaAssets = useAppStore((s) => s.mediaAssets);
  const videoPlaybackRevision = useAppStore((s) => s.videoPlaybackRevision);
  const toggleVideoPlayback = useAppStore((s) => s.toggleVideoPlayback);
  const playAllSceneVideos = useAppStore((s) => s.playAllSceneVideos);
  const pauseAllSceneVideos = useAppStore((s) => s.pauseAllSceneVideos);

  const content = useMemo(
    () => listSceneContent(projectors, sceneObjects, mediaAssets),
    [projectors, sceneObjects, mediaAssets, videoPlaybackRevision],
  );

  const videoCount = content.filter((entry) => entry.videoAssetId).length;

  if (content.length === 0) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Content</div>
      {videoCount > 1 && (
        <div className={styles.contentActions}>
          <button type="button" className={styles.contentBtn} onClick={playAllSceneVideos}>
            Play all videos
          </button>
          <button type="button" className={styles.contentBtn} onClick={pauseAllSceneVideos}>
            Stop all
          </button>
        </div>
      )}
      <ul className={styles.list}>
        {content.map((entry) => (
          <li key={entry.id} className={styles.contentItem}>
            <div className={styles.contentMeta}>
              <span className={styles.name}>{entry.ownerLabel}</span>
              <span className={styles.type}>{entry.ownerKind}</span>
            </div>
            <span className={styles.contentMedia} title={entry.mediaSummary}>
              {entry.mediaSummary}
            </span>
            {entry.videoAssetId && (
              <button
                type="button"
                className={styles.contentBtn}
                data-testid={`content-play-${entry.videoAssetId}`}
                onClick={() => toggleVideoPlayback(entry.videoAssetId!)}
              >
                {entry.isPlaying ? 'Stop' : 'Play'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
