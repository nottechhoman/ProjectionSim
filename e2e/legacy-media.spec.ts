import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const sample = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../samples/two-projector-blend.projectionlab.json'), 'utf8'),
);

/**
 * A visitor who used the previous version on the same site: its autosave (v2 file,
 * projector media) and its media database. v4 must reopen that work with the media.
 */
test('previous version autosave + media on the same site open in v4 with the image showing', async ({ page }) => {
  const legacy = {
    ...sample,
    version: 2,
    name: 'Old show',
    mediaAssets: [{ id: 'asset-old-1', name: 'old.png', kind: 'image', mimeType: 'image/png' }],
    projectors: sample.projectors.map((p: Record<string, unknown>, i: number) =>
      i === 0 ? { ...p, mediaSource: 'image', mediaAssetId: 'asset-old-1', mediaFit: 'stretch' } : p,
    ),
  };
  await page.goto('/');
  // They already opened v4 once (an untouched default autosave exists).
  await page.evaluate(() => (window as unknown as { __projectionLabStore: { getState: () => { setDisplayUnit: (u: string) => void } } }).__projectionLabStore.getState().setDisplayUnit('cm'));
  await page.waitForFunction(() => localStorage.getItem('projectionlab-v4-autosave-v1') !== null, null, { timeout: 10000 });
  await page.evaluate(async (json) => {
    localStorage.removeItem('projectionlab-v4-imported-previous');
    localStorage.setItem('projectionlab-advanced-autosave-v1', json);
    // Solid red PNG in the old media database.
    const canvas = new OffscreenCanvas(64, 36);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 64, 36);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('projectionlab-advanced-assets', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('blobs');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(blob, 'asset-old-1');
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
      };
    });
  }, JSON.stringify(legacy));
  await page.reload();
  await page.waitForTimeout(1500);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as unknown as { __projectionLabStore: { getState: () => { projectName: string } } }).__projectionLabStore.getState().projectName)).toBe('Old show');
  // Projector 1's feed (its migrated, projector-only image layer) is red where it hits the screen.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const e = (window as unknown as { __projectionLabEngine: { feedPass: { contentTargets: Map<string, { width: number; height: number }> }; renderer: { readRenderTargetPixels: (...a: unknown[]) => void } } }).__projectionLabEngine;
          const t = e.feedPass.contentTargets.get('proj-1');
          if (!t) return null;
          const px = new Uint8Array(4);
          e.renderer.readRenderTargetPixels(t, t.width >> 1, t.height >> 1, 1, 1, px);
          return Array.from(px);
        }),
      { timeout: 10000 },
    )
    .toEqual([255, 0, 0, 255]);
});
