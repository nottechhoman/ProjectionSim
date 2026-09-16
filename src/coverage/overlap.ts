import * as THREE from 'three';
import type { FootprintResult, OverlapResults, PairwiseOverlap, ProjectorConfig } from '../types';
import { computePlanarFootprint } from './planarFootprint';

export interface Rect2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function rectArea(rect: Rect2D): number {
  return Math.max(0, rect.maxX - rect.minX) * Math.max(0, rect.maxY - rect.minY);
}

export function rectIntersection(a: Rect2D, b: Rect2D): Rect2D | null {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  const minY = Math.max(a.minY, b.minY);
  const maxY = Math.min(a.maxY, b.maxY);
  if (maxX <= minX || maxY <= minY) return null;
  return { minX, maxX, minY, maxY };
}

export function unionArea(rects: Rect2D[]): number {
  if (rects.length === 0) return 0;
  if (rects.length === 1) return rectArea(rects[0]);

  const areas = rects.map(rectArea);
  let union = areas.reduce((a, b) => a + b, 0);

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const inter = rectIntersection(rects[i], rects[j]);
      if (inter) union -= rectArea(inter);
    }
  }

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      for (let k = j + 1; k < rects.length; k++) {
        const ab = rectIntersection(rects[i], rects[j]);
        if (!ab) continue;
        const abc = rectIntersection(ab, rects[k]);
        if (abc) union += rectArea(abc);
      }
    }
  }

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      for (let k = j + 1; k < rects.length; k++) {
        for (let l = k + 1; l < rects.length; l++) {
          const ab = rectIntersection(rects[i], rects[j]);
          if (!ab) continue;
          const abc = rectIntersection(ab, rects[k]);
          if (!abc) continue;
          const abcd = rectIntersection(abc, rects[l]);
          if (abcd) union -= rectArea(abcd);
        }
      }
    }
  }

  return Math.max(0, union);
}

export function multiCoverageArea(rects: Rect2D[]): number {
  if (rects.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const inter = rectIntersection(rects[i], rects[j]);
      if (inter) total += rectArea(inter);
    }
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      for (let k = j + 1; k < rects.length; k++) {
        const ab = rectIntersection(rects[i], rects[j]);
        if (!ab) continue;
        const abc = rectIntersection(ab, rects[k]);
        if (abc) total -= 2 * rectArea(abc);
      }
    }
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      for (let k = j + 1; k < rects.length; k++) {
        for (let l = k + 1; l < rects.length; l++) {
          const ab = rectIntersection(rects[i], rects[j]);
          if (!ab) continue;
          const abc = rectIntersection(ab, rects[k]);
          if (!abc) continue;
          const abcd = rectIntersection(abc, rects[l]);
          if (abcd) total += rectArea(abcd);
        }
      }
    }
  }
  return Math.max(0, total);
}

export interface AlignedProjectorLayout {
  id: string;
  rect: Rect2D;
  widthM: number;
}

export function collectAlignedProjectorLayouts(
  projectors: ProjectorConfig[],
  screen: {
    center: THREE.Vector3;
    normal: THREE.Vector3;
    width: number;
    height: number;
    matrix: THREE.Matrix4;
  },
): AlignedProjectorLayout[] {
  const enabled = projectors.filter((p) => p.enabled);
  const layouts: AlignedProjectorLayout[] = [];

  for (const proj of enabled) {
    const worldMatrix = new THREE.Matrix4();
    const pos = new THREE.Vector3(
      proj.transform.position.x,
      proj.transform.position.y,
      proj.transform.position.z,
    );
    const quat = new THREE.Quaternion(...proj.transform.quaternion);
    worldMatrix.compose(pos, quat, new THREE.Vector3(1, 1, 1));

    const footprint = computePlanarFootprint(proj.optics, worldMatrix, {
      center: screen.center,
      normal: screen.normal,
      width: screen.width,
      height: screen.height,
    });
    const rect = footprintToAlignedRect(footprint, screen.matrix);
    if (!rect) continue;

    layouts.push({
      id: proj.id,
      rect,
      widthM: rect.maxX - rect.minX,
    });
  }

  return layouts;
}

export function footprintToAlignedRect(
  footprint: FootprintResult,
  screenMatrix: THREE.Matrix4,
): Rect2D | null {
  if (footprint.corners.length < 3) return null;

  const right = new THREE.Vector3(1, 0, 0).transformDirection(screenMatrix);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(screenMatrix);
  const origin = new THREE.Vector3().setFromMatrixPosition(screenMatrix);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const corner of footprint.corners) {
    const lx = new THREE.Vector3(corner.x, corner.y, corner.z).sub(origin).dot(right);
    const ly = new THREE.Vector3(corner.x, corner.y, corner.z).sub(origin).dot(up);
    minX = Math.min(minX, lx);
    maxX = Math.max(maxX, lx);
    minY = Math.min(minY, ly);
    maxY = Math.max(maxY, ly);
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

export function computeAlignedOverlap(
  projectors: ProjectorConfig[],
  screen: {
    center: THREE.Vector3;
    normal: THREE.Vector3;
    width: number;
    height: number;
    matrix: THREE.Matrix4;
  },
): OverlapResults | null {
  const layouts = collectAlignedProjectorLayouts(projectors, screen);
  if (layouts.length === 0) return null;

  const rects = layouts.map((l) => ({ id: l.id, rect: l.rect, widthM: l.widthM }));
  const enabled = projectors.filter((p) => p.enabled);

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

  const screenRect: Rect2D = {
    minX: -screen.width / 2,
    maxX: screen.width / 2,
    minY: -screen.height / 2,
    maxY: screen.height / 2,
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
      combinedWidthM = widths[0] * rects.length - (rects.length - 1) * (horizontalOverlapM / (rects.length - 1));
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
