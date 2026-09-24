import { describe, expect, it } from 'vitest';
import { parseProjectJson, serializeProject } from './projectSerializer';
import { sliceToSnapshot, defaultPersistedSlice, snapshotToSlice } from '../store/persistenceHelpers';

describe('v2 advanced fields persist', () => {
  it('round-trips blend settings, projector warp and surface UV mapping', () => {
    const slice = defaultPersistedSlice();
    slice.blendSettings = { ...slice.blendSettings, mode: 'auto', curve: 'cosine', blackLevel: 0.01 };
    slice.projectors[0] = {
      ...slice.projectors[0],
      warp: {
        enabled: true,
        corners: [
          { x: 0.1, y: 0 },
          { x: 0.9, y: 0.05 },
          { x: 1, y: 1 },
          { x: 0, y: 0.95 },
        ],
      },
    };
    slice.sceneObjects[0] = {
      ...slice.sceneObjects[0],
      uvMapping: {
        enabled: true,
        projection: 'planar',
        region: { x: 0.25, y: 0, width: 0.5, height: 1 },
        rotationDeg: 90,
        flipU: true,
        flipV: false,
        repeatU: 2,
        repeatV: 1,
        wrap: 'mirror',
      },
    };
    const parsed = parseProjectJson(serializeProject(sliceToSnapshot(slice)));
    const back = snapshotToSlice(parsed);
    expect(back.blendSettings.mode).toBe('auto');
    expect(back.blendSettings.curve).toBe('cosine');
    expect(back.blendSettings.blackLevel).toBeCloseTo(0.01, 9);
    expect(back.projectors[0].warp!.enabled).toBe(true);
    expect(back.projectors[0].warp!.corners[1]).toEqual({ x: 0.9, y: 0.05 });
    expect(back.sceneObjects[0].uvMapping!.wrap).toBe('mirror');
    expect(back.sceneObjects[0].uvMapping!.region.x).toBe(0.25);
  });

  it('v1-era files without advanced fields load with safe defaults', () => {
    const snap = sliceToSnapshot(defaultPersistedSlice());
    const raw = JSON.parse(serializeProject(snap));
    delete raw.blendSettings;
    for (const p of raw.projectors) delete p.warp;
    const back = snapshotToSlice(parseProjectJson(JSON.stringify(raw)));
    expect(back.blendSettings.mode).toBe('manual');
    expect(back.projectors[0].warp!.enabled).toBe(false);
    expect(back.sceneObjects[0].uvMapping).toBe(undefined);
  });
});
