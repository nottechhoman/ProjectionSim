import { describe, expect, it } from 'vitest';
import type { Mapping, ProjectorConfig, SceneObject } from '../types';
import { eulerYXZToQuaternion } from '../utils/euler';
import { createScreen } from '../scene/objects/createScreen';
import { createCurvedScreen } from '../scene/objects/createCurvedScreen';
import { createDirectMapping, createMapping, createPerspectiveMapping, defaultFeedRect } from './model';
import { buildContentTemplate, contentTemplateCsv, physicalSizeLabel, templateFileBase } from './contentTemplate';

const screenObj = (id: string, x: number, width: number, height: number): SceneObject => ({
  id,
  name: `Screen ${id}`,
  type: 'screen',
  transform: { position: { x, y: 1.5, z: 0 }, quaternion: eulerYXZToQuaternion(0, 0, 0) },
  visibleInEditor: true,
  receivesProjection: true,
  blocksProjection: false,
  dimensions: { width, height },
});

const makeProjector = (x: number, id: string, res = { width: 384, height: 216 }): ProjectorConfig => ({
  id,
  name: id,
  enabled: true,
  color: '#fff',
  transform: { position: { x, y: 1.5, z: 6 }, quaternion: eulerYXZToQuaternion(0, 0, 0) },
  optics: {
    throwRatio: 1.5,
    resolution: res,
    aspectRatio: res.width / res.height,
    lensShiftH: 0,
    lensShiftV: 0,
    nearLimit: 0.1,
    farLimit: 100,
  },
  brightness: 1,
  blendEdges: { left: 0, right: 0, top: 0, bottom: 0 },
  blendGamma: 1,
  outerEdgeFade: false,
});

const surface = (obj: SceneObject) => ({ obj, root: obj.type === 'curvedScreen' ? createCurvedScreen(obj) : createScreen(obj) });

describe('content template', () => {
  it('Direct (stretch) fills the whole canvas with its one screen', () => {
    const obj = screenObj('a', 0, 6, 3.375);
    const mapping: Mapping = { ...createDirectMapping(obj), resolution: { w: 192, h: 108 } };
    const t = buildContentTemplate(mapping, [], [surface(obj)]);
    expect(t.width).toBe(192);
    expect(t.height).toBe(108);
    expect(t.screens[0].pixels).toBe(192 * 108);
    expect(t.screens[0].bbox).toEqual({ x: 0, y: 0, w: 192, h: 108 });
  });

  it('Feed places each screen at its region (top-left origin)', () => {
    const a = screenObj('a', -2, 3, 2);
    const b = screenObj('b', 2, 3, 2);
    const base = createMapping('feed', ['a', 'b'], []);
    const mapping: Mapping = {
      ...base,
      resolution: { w: 200, h: 100 },
      feed: {
        rects: [
          { ...defaultFeedRect('a'), region: { x: 0, y: 0, width: 0.5, height: 0.5 } },
          { ...defaultFeedRect('b'), region: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } },
        ],
      },
    };
    const t = buildContentTemplate(mapping, [], [surface(a), surface(b)]);
    expect(t.screens[0].bbox).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(t.screens[1].bbox).toEqual({ x: 100, y: 50, w: 100, h: 50 });
    // Nothing in the other two quadrants.
    expect(t.owner[10 * 200 + 150]).toBe(0);
    expect(t.owner[80 * 200 + 50]).toBe(0);
  });

  it('Perspective locked to a projector shows the screen as the projector sees it', () => {
    // 4 × 2.25 m image on a 6 × 2 m screen: full width, 2 / 2.25 of the height.
    const obj = screenObj('a', 0, 6, 2);
    const p = makeProjector(0, 'p');
    const mapping = createPerspectiveMapping(p, ['a']);
    const t = buildContentTemplate(mapping, [p], [surface(obj)]);
    expect(t.width).toBe(384);
    expect(t.height).toBe(216);
    const b = t.screens[0].bbox!;
    expect(b.x).toBe(0);
    expect(b.w).toBe(384);
    expect(Math.abs(b.h - (216 * 2) / 2.25)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.y - (216 - b.h) / 2)).toBeLessThanOrEqual(1);
  });

  it('marks the blend zone where two projectors overlap', () => {
    // Projectors at ±1.6 m, 4 m wide images: overlap −0.4…0.4 m of a 6 m screen.
    const obj = screenObj('a', 0, 6, 2);
    const projectors = [makeProjector(-1.6, 'l'), makeProjector(1.6, 'r')];
    const mapping: Mapping = { ...createDirectMapping(obj), resolution: { w: 300, h: 100 } };
    const t = buildContentTemplate(mapping, projectors, [surface(obj)]);
    expect(t.projectorsChecked).toBe(2);
    const frac = t.screens[0].blendPixels / t.screens[0].pixels;
    expect(frac).toBeGreaterThan(0.8 / 6 - 0.02);
    expect(frac).toBeLessThan(0.8 / 6 + 0.02);
    expect(t.projectorCount[50 * 300 + 150]).toBe(2); // centre
    expect(t.projectorCount[50 * 300 + 10]).toBe(1); // left edge
    // A disabled projector does not count.
    const off = buildContentTemplate(mapping, [projectors[0], { ...projectors[1], enabled: false }], [surface(obj)]);
    expect(off.screens[0].blendPixels).toBe(0);
  });

  it('Cylindrical mapping unrolls a curved screen without a seam', () => {
    const curved: SceneObject = {
      ...screenObj('c', 0, 1, 1),
      type: 'curvedScreen',
      transform: { position: { x: 0, y: 1.5, z: 0 }, quaternion: eulerYXZToQuaternion(0, 0, 0) },
      curved: { radius: 4, arcAngleDeg: 90, height: 2 },
    };
    const base = createMapping('cylindrical', ['c'], []);
    const mapping: Mapping = {
      ...base,
      resolution: { w: 360, h: 100 },
      cylindrical: { center: { x: 0, y: 1.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, arcDeg: 180, height: 4 },
    };
    const t = buildContentTemplate(mapping, [], [surface(curved)]);
    const b = t.screens[0].bbox!;
    // 90° of a 180° canvas, 2 m of 4 m height.
    expect(Math.abs(b.w - 180)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.h - 50)).toBeLessThanOrEqual(2);
    // Solid: no holes inside the box.
    const inside = t.screens[0].pixels / (b.w * b.h);
    expect(inside).toBeGreaterThan(0.98);
  });

  it('writes a CSV row per screen and a safe file name', () => {
    const obj = screenObj('a', 0, 6, 3.375);
    const mapping: Mapping = { ...createDirectMapping(obj), name: 'Main "wall", left', resolution: { w: 64, h: 36 } };
    const t = buildContentTemplate(mapping, [], [surface(obj)]);
    const csv = contentTemplateCsv(t).trim().split('\n');
    expect(csv[0]).toContain('canvas 64 x 36 px');
    expect(csv[1]).toBe('screen,type,x_px,y_px,width_px,height_px,pixels,blend_zone_pixels,physical_size');
    expect(csv[2]).toBe('Screen a,screen,0,0,64,36,2304,0,6.00 × 3.38 m');
    expect(templateFileBase(t)).toBe('main-wall-left-template-64x36');
    expect(physicalSizeLabel({ ...obj, type: 'box', dimensions: { width: 1, height: 2, depth: 3 } })).toBe('1.00 × 2.00 × 3.00 m box');
  });

  it('ignores screens that are not on the mapping', () => {
    const a = screenObj('a', 0, 6, 3.375);
    const b = screenObj('b', 0, 6, 3.375);
    const mapping: Mapping = { ...createDirectMapping(a), resolution: { w: 32, h: 18 } };
    const t = buildContentTemplate(mapping, [], [surface(a), surface(b)]);
    expect(t.screens.map((s) => s.id)).toEqual(['a']);
  });
});

describe('content template depth', () => {
  it('Perspective: a nearer screen hides the one behind it', () => {
    const back = screenObj('back', 0, 6, 2);
    const front: SceneObject = { ...screenObj('front', 0, 1, 1), transform: { position: { x: 0, y: 1.5, z: 2 }, quaternion: eulerYXZToQuaternion(0, 0, 0) } };
    const p = makeProjector(0, 'p');
    const mapping = createPerspectiveMapping(p, ['front', 'back']);
    // Back screen listed last, so without depth it would paint over the front one.
    const t = buildContentTemplate(mapping, [p], [surface(front), surface(back)]);
    const centre = 108 * 384 + 192;
    expect(t.owner[centre]).toBe(1);
    expect(t.screens[0].pixels).toBeGreaterThan(0);
    expect(t.screens[1].pixels).toBeGreaterThan(t.screens[0].pixels);
  });
});
