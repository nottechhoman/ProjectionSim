import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseProjectJson } from '../persistence/projectSerializer';
import { getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import { createCurvedScreenGeometry } from '../scene/ModelLoader';
import { applyBoxUvAtlas } from '../scene/objects/createBox';
import { computeSurfaceUvFrame, projectSurfaceUv, type SurfaceUvFrame } from '../uvmapping/surfaceUv';
import { evaluate } from '../playback/evaluate';
import { activeTrack, screenAspect } from './model';
import { compositeTexel, feedRectUv, hexToRgb, patternColor, type Rgb } from './sample';
import { legacyPrimaryReceiver, normalizeLegacy } from './migrationRender.fixtures';
import type { ProjectorConfig, SceneObject, TestPattern, Vec2, Vec3 } from '../types';

/**
 * "Bundled samples render the same": for every sample project, every receiving
 * surface point and every projector that lights it, the content colour from the
 * v1–v3 pipeline (projector raster / shared mapping, reimplemented here from the
 * old shaders) must equal the colour of the migrated v4 layers sampled through
 * their mappings for that projector.
 */

const SAMPLES = import.meta.glob('../../samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

interface SurfacePoint {
  world: Vec3;
  local: Vec3;
  uv: Vec2;
}

function objectMatrix(obj: SceneObject): THREE.Matrix4 {
  const p = obj.transform.position;
  return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(...obj.transform.quaternion), new THREE.Vector3(1, 1, 1));
}

function geometryFor(obj: SceneObject): THREE.BufferGeometry | null {
  if (obj.type === 'screen' || obj.type === 'wall') return new THREE.PlaneGeometry(obj.dimensions.width, obj.dimensions.height, 12, 8);
  if (obj.type === 'curvedScreen' && obj.curved) return createCurvedScreenGeometry(obj.curved);
  if (obj.type === 'box') {
    const g = new THREE.BoxGeometry(obj.dimensions.width, obj.dimensions.height, obj.dimensions.depth ?? 1, 6, 6, 6);
    applyBoxUvAtlas(g);
    return g;
  }
  return null;
}

/** Points inside triangles (centroids + vertices) with interpolated UVs. */
function surfacePoints(obj: SceneObject): { points: SurfacePoint[]; frame: SurfaceUvFrame } {
  const geo = geometryFor(obj)!;
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const m = objectMatrix(obj);
  const locals: Vec3[] = [];
  for (let i = 0; i < pos.count; i++) locals.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
  const frame = computeSurfaceUvFrame(locals);
  const points: SurfacePoint[] = [];
  const index = geo.getIndex()!;
  const add = (ids: number[], w: number[]) => {
    const l = new THREE.Vector3();
    const u = { x: 0, y: 0 };
    ids.forEach((id, k) => {
      l.x += pos.getX(id) * w[k];
      l.y += pos.getY(id) * w[k];
      l.z += pos.getZ(id) * w[k];
      u.x += uv.getX(id) * w[k];
      u.y += uv.getY(id) * w[k];
    });
    const world = l.clone().applyMatrix4(m);
    points.push({ world: { x: world.x, y: world.y, z: world.z }, local: { x: l.x, y: l.y, z: l.z }, uv: u });
  };
  for (let t = 0; t < index.count; t += 3) {
    const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    add(ids, [1 / 3, 1 / 3, 1 / 3]);
    add(ids, [0.6, 0.3, 0.1]);
  }
  return { points, frame };
}

function projectorUv(p: ProjectorConfig, world: Vec3): Vec2 | null {
  const clip = new THREE.Vector4(world.x, world.y, world.z, 1).applyMatrix4(getProjectorViewProjectionMatrix(p.optics, getProjectorWorldMatrix(p)));
  if (clip.w <= 0) return null;
  const n = { x: clip.x / clip.w, y: clip.y / clip.w, z: clip.z / clip.w };
  if (Math.abs(n.x) > 1 || Math.abs(n.y) > 1 || Math.abs(n.z) > 1) return null;
  return { x: n.x * 0.5 + 0.5, y: n.y * 0.5 + 0.5 };
}

type Raw = Record<string, any>;

/** v1–v3 content colour seen at a surface point from projector `raw` (patterns only, as in the samples). */
function legacyColor(data: Raw, rawProjector: Raw, obj: Raw, pt: SurfacePoint, frame: SurfaceUvFrame, q: Vec2): Rgb | 'skip' {
  const shared = data.mappingMode === 'sharedCanvas' || data.contentCanvas?.enabled === true;
  const tint = (p: Raw) => hexToRgb(p.color ?? '#ffffff');
  if (!shared) return patternColor(rawProjector.testPattern as TestPattern, q, tint(rawProjector));
  if (data.contentCanvas?.enabled) return 'skip';
  const source = data.projectors.find((p: Raw) => p.id === data.sharedContentSourceProjectorId) ?? data.projectors[0];
  let c: Vec2 | null;
  if (obj.uvMapping?.enabled) {
    const s = obj.uvMapping.projection === 'meshUv' ? pt.uv : projectSurfaceUv(pt.local, obj.uvMapping.projection, frame, pt.uv);
    c = feedRectUv({ ...obj.uvMapping, screenId: obj.id }, s);
  } else {
    const primary = legacyPrimaryReceiver(data.sceneObjects) as SceneObject;
    if (primary.type !== 'screen') return 'skip';
    const l = new THREE.Vector3(pt.world.x, pt.world.y, pt.world.z).applyMatrix4(objectMatrix(primary).invert());
    c = { x: l.x / primary.dimensions.width + 0.5, y: l.y / primary.dimensions.height + 0.5 };
    if (c.x < 0 || c.x > 1 || c.y < 0 || c.y > 1) return [0, 0, 0];
  }
  if (!c) return [0, 0, 0];
  return patternColor(source.testPattern as TestPattern, c, tint(source));
}

const close = (a: Rgb, b: Rgb) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

describe('bundled samples render the same after migration to layers + mappings', () => {
  const files = Object.keys(SAMPLES);
  it('finds the bundled samples', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of files) {
    it(file, () => {
      const text = SAMPLES[file];
      const data = normalizeLegacy(JSON.parse(text));
      const project = parseProjectJson(text);
      const live = evaluate(activeTrack(project.show), 0);
      let compared = 0;
      let boundary = 0;
      for (const obj of project.sceneObjects) {
        if (!obj.receivesProjection || !geometryFor(obj)) continue;
        const rawObj = data.sceneObjects.find((o: Raw) => o.id === obj.id);
        const { points, frame } = surfacePoints(obj);
        for (const pt of points) {
          for (const projector of project.projectors) {
            const q = projectorUv(projector, pt.world);
            if (!q) continue;
            const rawProjector = data.projectors.find((p: Raw) => p.id === projector.id);
            const expected = legacyColor(data, rawProjector, rawObj, pt, frame, q);
            if (expected === 'skip') continue;
            const actual = compositeTexel(
              live,
              project.show.mappings,
              project.projectors,
              {
                world: pt.world,
                surfaceUv: pt.uv,
                screenId: obj.id,
                screenAspect: screenAspect(obj),
                screenTexSize: { w: 2048, h: 1024 },
                local: pt.local,
                frame,
              },
              projector.id,
            );
            compared += 1;
            if (close(actual, expected)) continue;
            // Checker cells: a point exactly on a cell edge may round either way.
            const nudged = [-1e-5, 1e-5].some((d) =>
              close(actual, legacyColor(data, rawProjector, rawObj, pt, frame, { x: q.x + d, y: q.y + d }) as Rgb),
            );
            if (nudged) {
              boundary += 1;
              continue;
            }
            expect.soft(actual, `${file} ${obj.id} ${projector.id} at ${JSON.stringify(pt.world)}`).toEqual(expected);
          }
        }
      }
      expect(compared).toBeGreaterThan(50);
      expect(boundary / compared).toBeLessThan(0.02);
    });
  }
});
