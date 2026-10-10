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
