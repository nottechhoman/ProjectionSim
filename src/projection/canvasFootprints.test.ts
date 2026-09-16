import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from '../store/defaultScene';
import type { ProjectorConfig, SceneObject } from '../types';
import { eulerYXZToQuaternion } from '../utils/euler';
import { projectorFootprintOnCanvas } from './canvasFootprints';
import { canvasPixelToSurfaceUv } from './contentCanvas';
import { worldToCurvedContentUv, worldToPlanarContentUv } from './sharedCanvasMapping';

function projectorAt(x: number): ProjectorConfig {
  return {
    ...DEFAULT_PROJECTORS[0],
    id: `proj-${x}`,
    transform: {
      position: { x, y: 1.5, z: 6 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
    lookAtEnabled: false,
  };
}

describe('world-to-canvas footprints', () => {
  it('places a centered planar footprint around canvas mid-pixels', () => {
    const screen = DEFAULT_SCENE_OBJECTS.find((o) => o.type === 'screen')!;
    const footprint = projectorFootprintOnCanvas(projectorAt(0), screen, 3840, 1080);
    expect(footprint).not.toBeNull();
    const xs = footprint!.points.map((p) => p.x);
    const ys = footprint!.points.map((p) => p.y);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(midX).toBeCloseTo(1920, 0);
    expect(midY).toBeCloseTo(540, 0);
  });

  it('applies the same V-flip as canvas UV conversion', () => {
    const screen = DEFAULT_SCENE_OBJECTS.find((o) => o.type === 'screen')!;
    const footprint = projectorFootprintOnCanvas(projectorAt(0), screen, 3840, 1080)!;
    for (const point of footprint.points) {
      const uv = canvasPixelToSurfaceUv(point.x, point.y, 3840, 1080);
      expect(uv.u).toBeGreaterThanOrEqual(0);
      expect(uv.u).toBeLessThanOrEqual(1);
      expect(uv.v).toBeGreaterThanOrEqual(0);
      expect(uv.v).toBeLessThanOrEqual(1);
    }
  });

  it('shifts a right-aimed projector toward the right of the canvas', () => {
    const screen = DEFAULT_SCENE_OBJECTS.find((o) => o.type === 'screen')!;
    const left = projectorFootprintOnCanvas(projectorAt(-1.6), screen, 3840, 1080)!;
    const right = projectorFootprintOnCanvas(projectorAt(1.6), screen, 3840, 1080)!;
    const leftMid =
      (Math.min(...left.points.map((p) => p.x)) + Math.max(...left.points.map((p) => p.x))) / 2;
    const rightMid =
      (Math.min(...right.points.map((p) => p.x)) + Math.max(...right.points.map((p) => p.x))) / 2;
    expect(rightMid).toBeGreaterThan(leftMid);
  });

  it('maps curved-screen center to UV 0.5, 0.5 using the shader atan formula', () => {
    const curved: SceneObject = {
      id: 'curved-1',
      name: 'Curved',
      type: 'curvedScreen',
      transform: {
        position: { x: 0, y: 1.5, z: 0 },
        quaternion: eulerYXZToQuaternion(0, 0, 0),
      },
      visibleInEditor: true,
      receivesProjection: true,
      blocksProjection: false,
      dimensions: { width: 6, height: 3.375 },
      curved: { radius: 4, arcAngleDeg: 90, height: 3.375 },
    };
    const center = new THREE.Vector3(4, 1.5, 0);
    const uv = worldToCurvedContentUv(center, curved);
    expect(uv).not.toBeNull();
    expect(uv!.x).toBeCloseTo(0.5, 3);
    expect(uv!.y).toBeCloseTo(0.5, 3);
  });

  it('agrees with planar shader UV at screen center', () => {
    const screen = DEFAULT_SCENE_OBJECTS.find((o) => o.type === 'screen')!;
    const center = new THREE.Vector3(
      screen.transform.position.x,
      screen.transform.position.y,
      screen.transform.position.z,
    );
    const uv = worldToPlanarContentUv(center, screen)!;
    const pixel = projectorFootprintOnCanvas(projectorAt(0), screen, 1000, 500);
    expect(pixel).not.toBeNull();
    expect(uv.x).toBeCloseTo(0.5, 3);
    expect(uv.y).toBeCloseTo(0.5, 3);
  });
});
