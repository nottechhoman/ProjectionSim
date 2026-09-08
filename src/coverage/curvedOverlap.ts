import * as THREE from 'three';
import type { FootprintResult, OverlapResults, PairwiseOverlap, ProjectorConfig } from '../types';
import { computeCurvedFootprint, type CurvedScreenSurface } from './curvedFootprint';
import {
  multiCoverageArea,
  rectArea,
  rectIntersection,
  type Rect2D,
  unionArea,
} from './overlap';

/** Footprint bounds in curved-surface coordinates: x = arc length (m), y = height (m). */
export function footprintToCurvedRect(
  footprint: FootprintResult,
  surface: CurvedScreenSurface,
): Rect2D | null {
  if (footprint.corners.length < 3) return null;

  const inv = surface.worldMatrix.clone().invert();
  const r = surface.radius;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const corner of footprint.corners) {
    const local = new THREE.Vector3(corner.x, corner.y, corner.z).applyMatrix4(inv);
    const arcX = r * Math.atan2(local.z, local.x);
    const y = local.y;
    minX = Math.min(minX, arcX);
    maxX = Math.max(maxX, arcX);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

export function computeCurvedOverlap(
  projectors: ProjectorConfig[],
  surface: CurvedScreenSurface,
): OverlapResults | null {
  const enabled = projectors.filter((p) => p.enabled);
  if (enabled.length === 0) return null;

  const rects: { id: string; rect: Rect2D; widthM: number }[] = [];

  for (const proj of enabled) {
    const worldMatrix = new THREE.Matrix4();
    const pos = new THREE.Vector3(
      proj.transform.position.x,
      proj.transform.position.y,
      proj.transform.position.z,
    );
    const quat = new THREE.Quaternion(...proj.transform.quaternion);
    worldMatrix.compose(pos, quat, new THREE.Vector3(1, 1, 1));

    const footprint = computeCurvedFootprint(proj.optics, worldMatrix, surface);
    const rect = footprintToCurvedRect(footprint, surface);
    if (!rect) continue;

    const widthM = rect.maxX - rect.minX;
    rects.push({ id: proj.id, rect, widthM });
  }

  if (rects.length === 0) return null;

  const perProjectorAreaM2: Record<string, number> = {};
  for (const { id, rect } of rects) {
    perProjectorAreaM2[id] = rectArea(rect);
  }

  const pairwise: PairwiseOverlap[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const inter = rectIntersection(a.rect, b.rect);
      if (!inter) continue;

      const area = rectArea(inter);
      const overlapWidthM = inter.maxX - inter.minX;
      const overlapHeightM = inter.maxY - inter.minY;
      const projA = enabled.find((p) => p.id === a.id)!;
      const projB = enabled.find((p) => p.id === b.id)!;
      const resA = projA.optics.resolution.width;
      const resB = projB.optics.resolution.width;

      pairwise.push({
        projectorAId: a.id,
        projectorBId: b.id,
        areaM2: area,
        overlapWidthM,
        overlapHeightM,
        overlapPixelsA: a.widthM > 0 ? Math.round((overlapWidthM / a.widthM) * resA) : null,
        overlapPixelsB: b.widthM > 0 ? Math.round((overlapWidthM / b.widthM) * resB) : null,
        percentOfA: a.widthM > 0 ? (overlapWidthM / a.widthM) * 100 : 0,
        percentOfB: b.widthM > 0 ? (overlapWidthM / b.widthM) * 100 : 0,
      });
    }
  }

  const rectList = rects.map((r) => r.rect);
  const unionAreaM2 = unionArea(rectList);
  const multiCoverageAreaM2 = multiCoverageArea(rectList);

  const arcRad = THREE.MathUtils.degToRad(surface.arcAngleDeg);
  const arcWidth = surface.radius * arcRad;
  const screenRect: Rect2D = {
    minX: -arcWidth / 2,
    maxX: arcWidth / 2,
    minY: -surface.height / 2,
    maxY: surface.height / 2,
  };
  const uncoveredAreaM2 = Math.max(0, rectArea(screenRect) - unionAreaM2);

  let combinedWidthM: number | null = null;
  let horizontalOverlapM: number | null = null;
  if (rects.length >= 2) {
    const widths = rects.map((r) => r.rect.maxX - r.rect.minX);
    const allSameWidth = widths.every((w) => Math.abs(w - widths[0]) < 0.01);
    const sorted = [...rects].sort((a, b) => a.rect.minX - b.rect.minX);
    if (allSameWidth) {
      horizontalOverlapM = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const inter = rectIntersection(sorted[i].rect, sorted[i + 1].rect);
        if (inter) horizontalOverlapM += inter.maxX - inter.minX;
      }
      combinedWidthM =
        widths[0] * rects.length -
        (rects.length - 1) * (horizontalOverlapM / (rects.length - 1));
    }
  }

  return {
    perProjectorAreaM2,
    pairwise,
    unionAreaM2,
    multiCoverageAreaM2,
    uncoveredAreaM2,
    combinedWidthM,
    horizontalOverlapM,
  };
}
