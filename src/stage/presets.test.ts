import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildSetPiece, buildStagePreset, SET_PIECES, STAGE_PRESETS } from './presets';
import { MAX_PROJECTORS } from '../types';
import { activeTrack, isScreen } from '../mapping/model';
import { buildProjectorCamera } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';

describe('stage presets', () => {
  it.each(STAGE_PRESETS.map((p) => p.id))('%s builds a valid scene', (id) => {
    const scene = buildStagePreset(id);
    expect(scene.projectors.length).toBeGreaterThan(0);
    expect(scene.projectors.length).toBeLessThanOrEqual(MAX_PROJECTORS);
    const ids = [...scene.sceneObjects.map((o) => o.id), ...scene.projectors.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(scene.sceneObjects.some((o) => o.id === scene.calculationTargetId)).toBe(true);

    // Every screen gets a Direct mapping and a UV-grid layer; every projector a locked Perspective mapping.
    const screens = scene.sceneObjects.filter(isScreen);
    const directs = scene.show.mappings.filter((m) => m.kind === 'direct');
    expect(directs.map((m) => m.screenIds[0]).sort()).toEqual(screens.map((s) => s.id).sort());
    const locked = scene.show.mappings.filter((m) => m.kind === 'perspective').map((m) => m.perspective?.lockToProjectorId);
    expect(locked.sort()).toEqual(scene.projectors.map((p) => p.id).sort());
    expect(activeTrack(scene.show).layers).toHaveLength(screens.length);

    for (const p of scene.projectors) {
      expect(p.optics.throwRatio).toBeGreaterThan(0.2);
      expect(p.optics.throwRatio).toBeLessThan(8);
    }
  });

  it.each(STAGE_PRESETS.map((p) => p.id))('%s projectors aim at their look-at target', (id) => {
    const scene = buildStagePreset(id);
    for (const p of scene.projectors) {
      const cam = buildProjectorCamera(p.optics, getProjectorWorldMatrix(p));
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const t = p.lookAtTarget!;
      const toTarget = new THREE.Vector3(t.x, t.y, t.z).sub(cam.position).normalize();
      expect(forward.dot(toTarget)).toBeGreaterThan(0.999);
    }
  });

  it('set pieces build with unique ids', () => {
    const all = SET_PIECES.flatMap((p) => buildSetPiece(p.id));
    expect(new Set(all.map((o) => o.id)).size).toBe(all.length);
    expect(buildSetPiece('proscenium')).toHaveLength(3);
    const floorArea = buildSetPiece('floorArea')[0];
    // Pitched −90°: the screen faces up.
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...floorArea.transform.quaternion));
    expect(n.y).toBeCloseTo(1, 5);
  });
});
