import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  normalizeProjectionSides,
  projectionSidesToInt,
  projectorIlluminatesFace,
  worldFaceNormal,
} from './projectionSides';
import { DEFAULT_SCENE_OBJECTS } from '../store/defaultScene';

describe('projectionSides', () => {
  it('defaults to front for legacy objects', () => {
    const screen = structuredClone(DEFAULT_SCENE_OBJECTS[0]);
    delete screen.projectionSides;
    expect(normalizeProjectionSides(screen)).toBe('front');
  });

  it('maps sides to shader integers', () => {
    expect(projectionSidesToInt('front')).toBe(0);
    expect(projectionSidesToInt('back')).toBe(1);
    expect(projectionSidesToInt('both')).toBe(2);
  });

  it('checks projector illuminates the front face of a flat screen', () => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
    );
    const normal = worldFaceNormal('screen', matrix, 'front');
    const sample = new THREE.Vector3(0, 1.5, 0);
    const projector = new THREE.Vector3(0, 1.5, 6);
    expect(projectorIlluminatesFace(projector, sample, normal)).toBe(true);
    expect(projectorIlluminatesFace(projector, sample, normal.clone().multiplyScalar(-1))).toBe(false);
  });
});
