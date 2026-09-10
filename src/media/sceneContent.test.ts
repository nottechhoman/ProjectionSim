import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';
import { listSceneContent } from './sceneContent';

describe('sceneContent', () => {
  it('lists projector pattern and video assignments', () => {
    const entries = listSceneContent(
      [
        DEFAULT_PROJECTORS[0],
        {
          ...DEFAULT_PROJECTORS[0],
          id: 'proj-2',
          name: 'Projector 2',
          mediaSource: 'video',
          mediaAssetId: 'clip-1',
          testPattern: 'projectorId',
        },
      ],
      [],
      [{ id: 'clip-1', name: 'Trailer.mp4', kind: 'video', mimeType: 'video/mp4' }],
    );

    expect(entries).toHaveLength(2);
    expect(entries[0].mediaSummary).toContain('Pattern');
    expect(entries[1].mediaSummary).toBe('Video: Trailer.mp4');
    expect(entries[1].videoAssetId).toBe('clip-1');
  });
});
