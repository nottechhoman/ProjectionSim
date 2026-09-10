import type { SceneObject, ProjectorConfig } from '../types';
import { eulerYXZToQuaternion } from '../utils/euler';

export const DEFAULT_SCENE_OBJECTS: SceneObject[] = [
  {
    id: 'screen-1',
    name: 'Screen',
    type: 'screen',
    transform: {
      position: { x: 0, y: 1.5, z: 0 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
    visibleInEditor: true,
    receivesProjection: true,
    blocksProjection: true,
    projectionSides: 'front',
    dimensions: { width: 6, height: 3.375 },
  },
  {
    id: 'floor-1',
    name: 'Floor',
    type: 'floor',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
    visibleInEditor: true,
    receivesProjection: false,
    blocksProjection: true,
    dimensions: { width: 20, height: 20 },
  },
];

export const DEFAULT_PROJECTORS: ProjectorConfig[] = [
  {
    id: 'proj-1',
    name: 'Projector 1',
    enabled: true,
    color: '#4fc3f7',
    transform: {
      position: { x: 0, y: 1.5, z: 6 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
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
    mediaSource: 'pattern',
    mediaAssetId: null,
    mediaFit: 'contain',
    blendEdges: { left: 0, right: 0, top: 0, bottom: 0 },
    outerEdgeFade: false,
    lookAtEnabled: true,
    lookAtTarget: { x: 0, y: 1.5, z: 0 },
  },
];
