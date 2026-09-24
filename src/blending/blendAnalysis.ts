import * as THREE from 'three';
import type { BlendSettings, ProjectorConfig, SceneObject, Vec2 } from '../types';
import { getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import { validateOptics } from '../optics/validate';
import { applyMat3, warpInverseMatrix, type Mat3 } from '../warp/homography';
import { autoBlendWeights, blendWeightWithGammaShim, lightWeight } from './advancedBlendCompose';

/**
 * v2 blend uniformity analysis on the calculation target (flat or curved screen).
 * Samples the surface, evaluates exactly the same weights the shader uses and
 * reports how flat the summed light is across the covered area. Occlusion is not
 * considered here (use the viewport Blend-sum preview for occluded scenes).
 */
export interface BlendAnalysisResult {
  mode: BlendSettings['mode'];
  samples: number;
  coveredSamples: number;
  overlapSamples: number;
  maxOverlap: number;
  /** Light-weight sum statistics over covered samples (1.0 = seamless). */
  minSum: number;
  maxSum: number;
  meanSum: number;
  /** Fraction of covered samples whose sum is within ±2 % of 1. */
  uniformFraction: number;
  /** Worst deviation from 1 inside overlaps (0 = perfect). */
  worstSeamDeviation: number;
  /** Min/max over the overlap region only. */
  overlapMinSum: number | null;
  overlapMaxSum: number | null;
}

interface ProjectorSampler {
  vp: THREE.Matrix4;
  warpInv: Mat3;
  projector: ProjectorConfig;
}

function samplePoints(receiver: SceneObject, nu: number, nv: number): THREE.Vector3[] {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(receiver.transform.position.x, receiver.transform.position.y, receiver.transform.position.z),
    new THREE.Quaternion(...receiver.transform.quaternion),
    new THREE.Vector3(1, 1, 1),
  );
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u = (i + 0.5) / nu;
      const v = (j + 0.5) / nv;
      let local: THREE.Vector3;
      if (receiver.type === 'curvedScreen' && receiver.curved) {
        const arc = THREE.MathUtils.degToRad(receiver.curved.arcAngleDeg);
        const theta = -arc / 2 + u * arc;
        const r = receiver.curved.radius;
        local = new THREE.Vector3(r * Math.sin(theta), (v - 0.5) * receiver.curved.height, r * Math.cos(theta));
      } else {
        local = new THREE.Vector3((u - 0.5) * receiver.dimensions.width, (v - 0.5) * receiver.dimensions.height, 0);
      }
      pts.push(local.applyMatrix4(m));
    }
  }
  return pts;
}

export function rasterUvOf(point: THREE.Vector3, vp: THREE.Matrix4): Vec2 | null {
  const clip = new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(vp);
  if (clip.w <= 1e-6) return null;
  const x = clip.x / clip.w;
  const y = clip.y / clip.w;
  const z = clip.z / clip.w;
  if (Math.abs(x) > 1 || Math.abs(y) > 1 || Math.abs(z) > 1) return null;
  return { x: x * 0.5 + 0.5, y: y * 0.5 + 0.5 };
}

/** Content UV of a world point for one projector (after inverse warp), or null. */
function contentUv(point: THREE.Vector3, s: ProjectorSampler): Vec2 | null {
  const p = rasterUvOf(point, s.vp);
  if (!p) return null;
  const q = applyMat3(s.warpInv, p);
  if (!q || q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) return null;
  return q;
}

export function computeBlendAnalysis(
  receiver: SceneObject | null,
  projectors: ProjectorConfig[],
  settings: BlendSettings,
  resolution = { u: 96, v: 54 },
): BlendAnalysisResult | null {
  if (!receiver || (receiver.type !== 'screen' && receiver.type !== 'curvedScreen')) return null;
  const eligible = projectors.filter((p) => p.enabled && validateOptics(p.optics).valid).slice(0, 4);
  if (eligible.length === 0) return null;
  const samplers: ProjectorSampler[] = eligible.map((projector) => ({
    projector,
    vp: getProjectorViewProjectionMatrix(projector.optics, getProjectorWorldMatrix(projector)),
    warpInv: warpInverseMatrix(projector.warp),
  }));

  const points = samplePoints(receiver, resolution.u, resolution.v);
  let covered = 0;
  let overlap = 0;
  let maxOverlap = 0;
  let minSum = Infinity;
  let maxSum = -Infinity;
  let total = 0;
  let uniform = 0;
  let worst = 0;
  let oMin = Infinity;
  let oMax = -Infinity;

  for (const point of points) {
    const qs = samplers.map((s) => contentUv(point, s));
    const count = qs.filter((q) => q !== null).length;
    if (count === 0) continue;
    covered++;
    maxOverlap = Math.max(maxOverlap, count);
    let weights: number[];
    if (settings.mode === 'auto') {
      weights = autoBlendWeights(qs, settings);
    } else {
      weights = qs.map((q, i) => (q ? blendWeightWithGammaShim(q, samplers[i].projector) : 0));
    }
    const sum = weights.reduce((acc, w, i) => acc + (qs[i] ? lightWeight(w, settings) : 0), 0);
    minSum = Math.min(minSum, sum);
    maxSum = Math.max(maxSum, sum);
    total += sum;
    if (Math.abs(sum - 1) <= 0.02) uniform++;
    if (count >= 2) {
      overlap++;
      worst = Math.max(worst, Math.abs(sum - 1));
      oMin = Math.min(oMin, sum);
      oMax = Math.max(oMax, sum);
    }
  }

  if (covered === 0) {
    return {
      mode: settings.mode,
      samples: points.length,
      coveredSamples: 0,
      overlapSamples: 0,
      maxOverlap: 0,
      minSum: 0,
      maxSum: 0,
      meanSum: 0,
      uniformFraction: 0,
      worstSeamDeviation: 0,
      overlapMinSum: null,
      overlapMaxSum: null,
    };
  }
  return {
    mode: settings.mode,
    samples: points.length,
    coveredSamples: covered,
    overlapSamples: overlap,
    maxOverlap,
    minSum,
    maxSum,
    meanSum: total / covered,
    uniformFraction: uniform / covered,
    worstSeamDeviation: worst,
    overlapMinSum: overlap > 0 ? oMin : null,
    overlapMaxSum: overlap > 0 ? oMax : null,
  };
}
