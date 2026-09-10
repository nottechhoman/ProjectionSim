import { describe, expect, it } from 'vitest';
import type { ProjectorConfig } from '../types';
import { listProjectorVideoSources, listSceneVideoSources } from './videoPlayback';

function projector(id: string, mediaAssetId: string | null): ProjectorConfig {
  return {
    id,
    name: id,
    enabled: true,
    color: '#fff',
    transform: { position: { x: 0, y: 0, z: 0 }, quaternion: [0, 0, 0, 1] },
    optics: {
      throwRatio: 1.5,
      resolution: { width: 1920, height: 1080 },
      aspectRatio: 16 / 9,
      lensShiftH: 0,
      lensShiftV: 0,
      nearLimit: 0.1,
      farLimit: 100,
    },
    testPattern: 'checkerboard',
    brightness: 1,
    mediaSource: mediaAssetId ? 'video' : 'pattern',
    mediaAssetId,
    mediaFit: 'contain',
    blendEdges: { left: 0, right: 0, top: 0, bottom: 0 },
    outerEdgeFade: false,
  };
}

describe('videoPlayback', () => {
  it('lists unique projector video sources with combined labels', () => {
    const sources = listProjectorVideoSources([
      projector('Projector 1', 'video-a'),
      projector('Projector 2', 'video-b'),
      projector('Projector 3', 'video-a'),
    ]);
    expect(sources).toHaveLength(2);
    expect(sources.find((source) => source.assetId === 'video-a')?.label).toBe(
      'Projector 1, Projector 3',
    );
  });

  it('ignores non-video projectors', () => {
    expect(listSceneVideoSources([projector('Projector 1', null)])).toEqual([]);
  });

  it('includes LED wall video sources', () => {
    const sources = listSceneVideoSources([], [
      {
        id: 'led-1',
        name: 'Stage LED',
        type: 'ledWall',
        transform: { position: { x: 0, y: 0, z: 0 }, quaternion: [0, 0, 0, 1] },
        visibleInEditor: true,
        receivesProjection: false,
        blocksProjection: true,
        dimensions: { width: 4, height: 2 },
        ledWall: {
          pixelResolution: { width: 1920, height: 1080 },
          mediaSource: 'video',
          mediaAssetId: 'clip-1',
          mediaFit: 'contain',
        },
      },
    ]);
    expect(sources).toEqual([{ assetId: 'clip-1', label: 'Stage LED' }]);
  });
});
