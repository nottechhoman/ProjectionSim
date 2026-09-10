import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  collectBlockerMeshes,
  occlusionDepthKeyForReceiver,
  projectorRasterUv,
  requiredOcclusionDepthKeys,
} from './projectionOcclusion';
import { getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';

function fakeRoot(id: string, blocks: boolean): { id: string; root: THREE.Object3D; blocksProjection: boolean } {
  const root = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  root.userData.pickId = id;
  return { id, root, blocksProjection: blocks };
}

describe('projectionOcclusion', () => {
  it('includes blocking receivers in the all-blockers depth pass', () => {
    const front = fakeRoot('front', true);
    const floor = fakeRoot('floor', true);
    const meshes = collectBlockerMeshes([front, floor]);
    expect(meshes.length).toBe(2);
  });

  it('excludes only the specified blocker from a self-shadow depth pass', () => {
    const front = fakeRoot('front', true);
    const floor = fakeRoot('floor', true);
    const meshes = collectBlockerMeshes([front, floor], 'front');
    expect(meshes.length).toBe(1);
  });

  it('requests exclude-self depth keys for blocking receivers', () => {
    const keys = requiredOcclusionDepthKeys([
      { id: 'front', blocksProjection: true, receivesProjection: true },
      { id: 'rear', blocksProjection: false, receivesProjection: true },
      { id: 'floor', blocksProjection: true, receivesProjection: false },
    ]);
    expect(keys).toContain('all');
    expect(keys).toContain('exclude:front');
    expect(keys).not.toContain('exclude:rear');
    expect(keys).not.toContain('exclude:floor');
  });

  it('uses exclude-self keys only for blocking receivers', () => {
    expect(occlusionDepthKeyForReceiver('front', true)).toBe('exclude:front');
    expect(occlusionDepthKeyForReceiver('rear', false)).toBe('all');
  });

  it('maps collinear front/rear points to the same raster UV', () => {
    const projector = DEFAULT_PROJECTORS[0];
    const worldMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(
        projector.transform.position.x,
        projector.transform.position.y,
        projector.transform.position.z,
      ),
      new THREE.Quaternion(...projector.transform.quaternion),
      new THREE.Vector3(1, 1, 1),
    );
    const matrix = getProjectorViewProjectionMatrix(projector.optics, worldMatrix);

    const front = new THREE.Vector3(0, 1.5, 0.5);
    const rear = new THREE.Vector3(0, 1.5, -2);
    const frontUv = projectorRasterUv(front, matrix);
    const rearUv = projectorRasterUv(rear, matrix);
    expect(frontUv?.inFrustum).toBe(true);
    expect(rearUv?.inFrustum).toBe(true);
    expect(frontUv!.uv.x).toBeCloseTo(rearUv!.uv.x, 5);
    expect(frontUv!.uv.y).toBeCloseTo(rearUv!.uv.y, 5);
  });
});
