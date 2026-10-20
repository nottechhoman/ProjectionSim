import { describe, expect, it } from 'vitest';
import { buildViewLink, decodeProjectFromLink, encodeProjectForLink, viewPayloadFromHash } from './shareLink';

describe('share link', () => {
  it('round-trips a project through the URL hash', async () => {
    const json = JSON.stringify({ name: 'Stage — 舞台', projectors: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, x: i * 0.5 })) });
    const link = await buildViewLink(json, 'https://example.org/ProjectionSim/#old');
    expect(link.startsWith('https://example.org/ProjectionSim/#view=')).toBe(true);
    expect(link.split('#view=')[1]).toMatch(/^[A-Za-z0-9_-]+$/);
    const payload = viewPayloadFromHash(link.slice(link.indexOf('#')))!;
    expect(await decodeProjectFromLink(payload)).toBe(json);
    expect((await encodeProjectForLink(json)).length).toBeLessThan(json.length);
  });

  it('ignores other hashes', () => {
    expect(viewPayloadFromHash('#settings')).toBeNull();
  });
});

describe('share link keeps v10 object animation', () => {
  it('a #view= link carries the track animation', async () => {
    const { defaultPersistedSlice, sliceToSnapshot, snapshotToSlice } = await import('../../store/persistenceHelpers');
    const { parseProjectJson, serializeProject } = await import('../../persistence/projectSerializer');
    const slice = defaultPersistedSlice();
    const anim = { position: [{ id: 'k0', timeSec: 0, value: { x: 0, y: 1.5, z: 0 }, ease: 'linear' as const }, { id: 'k1', timeSec: 2, value: { x: 2, y: 1.5, z: 0 }, ease: 'easeInOut' as const }] };
    slice.show.tracks[0] = { ...slice.show.tracks[0], objectAnimations: { [slice.sceneObjects[0].id]: anim } };
    const link = await buildViewLink(serializeProject(sliceToSnapshot(slice)), 'https://example.org/');
    const json = await decodeProjectFromLink(viewPayloadFromHash(link.slice(link.indexOf('#')))!);
    const back = snapshotToSlice(parseProjectJson(json));
    expect(back.show.tracks[0].objectAnimations).toEqual({ [slice.sceneObjects[0].id]: anim });
  });
});
