import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  resolveSharedCanvasSupport,
  worldToPlanarContentUv,
} from './sharedCanvasMapping';
import { DEFAULT_SCENE_OBJECTS } from '../store/defaultScene';

describe('sharedCanvasMapping', () => {
  it('supports planar screens', () => {
    const support = resolveSharedCanvasSupport(DEFAULT_SCENE_OBJECTS);
    expect(support.supported).toBe(true);
    expect(support.mapKind).toBe('planar');
  });

  it('maps screen center to content UV 0.5, 0.5', () => {
    const screen = DEFAULT_SCENE_OBJECTS.find((o) => o.type === 'screen')!;
    const center = new THREE.Vector3(
      screen.transform.position.x,
      screen.transform.position.y,
      screen.transform.position.z,
    );
    const uv = worldToPlanarContentUv(center, screen);
    expect(uv).not.toBeNull();
    expect(uv!.x).toBeCloseTo(0.5, 3);
    expect(uv!.y).toBeCloseTo(0.5, 3);
  });
});
