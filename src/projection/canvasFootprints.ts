import * as THREE from 'three';
import { computeCurvedFootprint } from '../coverage/curvedFootprint';
import { computePlanarFootprint } from '../coverage/planarFootprint';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import type { ContentCanvas, ProjectorConfig, SceneObject } from '../types';
import { surfaceUvToCanvasPixel } from './contentCanvas';
import { worldToCurvedContentUv, worldToPlanarContentUv } from './sharedCanvasMapping';

export interface CanvasFootprint {
  projectorId: string;
  color: string;
  name: string;
  points: { x: number; y: number }[];
}

function objectWorldMatrix(transform: SceneObject['transform']): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
    new THREE.Quaternion(...transform.quaternion),
    new THREE.Vector3(1, 1, 1),
  );
  return matrix;
}

function worldCornersForReceiver(
  projector: ProjectorConfig,
  receiver: SceneObject,
): THREE.Vector3[] {
  const worldMatrix = getProjectorWorldMatrix(projector);
  if (receiver.type === 'screen') {
    const matrix = objectWorldMatrix(receiver.transform);
    const center = new THREE.Vector3().setFromMatrixPosition(matrix);
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(matrix))
      .normalize();
    return computePlanarFootprint(projector.optics, worldMatrix, {
      center,
      normal,
      width: receiver.dimensions.width,
      height: receiver.dimensions.height,
    }).corners.map((c) => new THREE.Vector3(c.x, c.y, c.z));
  }
  if (receiver.type === 'curvedScreen' && receiver.curved) {
    return computeCurvedFootprint(projector.optics, worldMatrix, {
      worldMatrix: objectWorldMatrix(receiver.transform),
      radius: receiver.curved.radius,
      arcAngleDeg: receiver.curved.arcAngleDeg,
      height: receiver.curved.height,
    }).corners.map((c) => new THREE.Vector3(c.x, c.y, c.z));
  }
  return [];
}

function worldToContentUv(world: THREE.Vector3, receiver: SceneObject): THREE.Vector2 | null {
  if (receiver.type === 'screen') return worldToPlanarContentUv(world, receiver);
  if (receiver.type === 'curvedScreen') return worldToCurvedContentUv(world, receiver);
  return null;
}

export function projectorFootprintOnCanvas(
  projector: ProjectorConfig,
  receiver: SceneObject,
  widthPx: number,
  heightPx: number,
): CanvasFootprint | null {
  const corners = worldCornersForReceiver(projector, receiver);
  if (corners.length < 3) return null;
  const points: { x: number; y: number }[] = [];
  for (const corner of corners) {
    const uv = worldToContentUv(corner, receiver);
    if (!uv) return null;
    points.push(surfaceUvToCanvasPixel(uv.x, uv.y, widthPx, heightPx));
  }
  return {
    projectorId: projector.id,
    color: projector.color,
    name: projector.name,
    points,
  };
}

export function projectorsFootprintsOnCanvas(
  projectors: ProjectorConfig[],
  receiver: SceneObject | null,
  canvas: Pick<ContentCanvas, 'widthPx' | 'heightPx'>,
): CanvasFootprint[] {
  if (!receiver) return [];
  return projectors
    .filter((p) => p.enabled)
    .map((p) => projectorFootprintOnCanvas(p, receiver, canvas.widthPx, canvas.heightPx))
    .filter((f): f is CanvasFootprint => f !== null);
}
