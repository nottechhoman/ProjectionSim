import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { listZip } from '../src/utils/zip';

type Vec2 = { x: number; y: number };
type StoreWindow = Window & {
  __projectionLabStore: {
    getState: () => {
      projectors: { id: string; name: string; warp?: { mode: string; grid: { cols: number; rows: number; points: Vec2[] } } }[];
      updateProjectorWarp: (id: string, warp: Record<string, unknown>, record?: boolean) => void;
    };
  };
  __projectionLabEngine: {
    renderProjectorFeed: (id: string, kind: 'color' | 'mask', maxLongEdge?: number) => HTMLCanvasElement | null;
    getRasterPreviewCanvas: (id: string) => HTMLCanvasElement | null;
  };
};

const warpOf = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__projectionLabStore.getState().projectors[0].warp!);

type Which = 'pane' | 'preview' | 'feed';

/**
 * Keep a canvas's pixels in the page under `key` (top-left origin); returns the byte
 * count. Pixels stay in the page: shipping full frames to the runner is slow.
 */
async function snap(page: Page, which: Which, key: string): Promise<number> {
  return page.evaluate(
    ([w, k]) => {
      const win = window as unknown as StoreWindow & { __snaps?: Record<string, Uint8ClampedArray> };
      const id = win.__projectionLabStore.getState().projectors[0].id;
      let canvas: HTMLCanvasElement | null = null;
      if (w === 'pane') canvas = document.querySelector('[data-testid="view-pane-1"] canvas');
      else if (w === 'preview') canvas = win.__projectionLabEngine.getRasterPreviewCanvas(id);
      else canvas = win.__projectionLabEngine.renderProjectorFeed(id, 'color');
      const ctx = canvas?.getContext('2d');
      const data = canvas && ctx && canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height).data : new Uint8ClampedArray();
      (win.__snaps ??= {})[k] = data;
      return data.length;
    },
    [which, key] as const,
  );
}

/** Bytes that differ between two kept snapshots (all bytes if the sizes differ). */
function diffSnaps(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(
    ([ka, kb]) => {
      const snaps = (window as unknown as { __snaps: Record<string, Uint8ClampedArray> }).__snaps;
      const x = snaps[ka];
      const y = snaps[kb];
      if (x.length !== y.length) return Math.max(x.length, y.length);
      let n = 0;
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++;
      return n;
    },
    [a, b] as const,
  );
}

/** Take a fresh snapshot and diff it against an earlier one. */
async function changedSince(page: Page, which: Which, before: string): Promise<number> {
  await snap(page, which, 'now');
  return diffSnaps(page, 'now', before);
}

// Grid edits re-render warp maps and feeds; software WebGL (CI / cloud) is slow at that.
test.describe.configure({ timeout: 180_000 });

async function openWarpTab(page: Page) {
  await page.getByTestId('studio-toggle').click();
  await expect(page.getByTestId('studio-panel')).toBeVisible();
  await page.getByTestId('studio-tab-warp').click();
}

test('grid warp: drag a point, the Output pane changes, undo restores', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('projectionSim.multiview'));
  await page.waitForFunction(() => !!(window as unknown as StoreWindow).__projectionLabStore);

  // Previz 2×2 with an Output pane for the projector.
  await page.getByTestId('mode-switch').getByRole('button', { name: 'Previz' }).click();
  await page.getByTestId('view-pane-1').locator('select').selectOption({ label: 'Output · Projector 1' });

  await openWarpTab(page);
  await page.getByTestId('warp-mode-grid').click();
  await expect(page.getByTestId('warp-grid-editor')).toBeVisible();
  expect((await warpOf(page)).mode).toBe('grid');

  // Let the Output pane and the preview settle, then take the "before" pictures.
  await expect.poll(() => snap(page, 'preview', 'preview0'), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  await snap(page, 'preview', 'preview0');
  expect(await snap(page, 'pane', 'pane0')).toBeGreaterThan(0);

  // Drag the centre point of the 5×5 grid.
  const point = page.getByTestId('warp-grid-point-12');
  const box = (await point.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(cx + 10 * k, cy + 6 * k);
  await page.mouse.up();

  const moved = (await warpOf(page)).grid.points[12];
  expect(moved.x).toBeGreaterThan(0.55);
  expect(moved.y).toBeLessThan(0.45);
  await expect.poll(() => changedSince(page, 'preview', 'preview0'), { timeout: 10_000 }).toBeGreaterThan(1000);
  await expect.poll(() => changedSince(page, 'pane', 'pane0'), { timeout: 10_000 }).toBeGreaterThan(1000);

  // Undo puts the point and the picture back.
  await page.getByTestId('warp-grid-editor').focus();
  await page.keyboard.press('Control+z');
  expect((await warpOf(page)).grid.points[12]).toEqual({ x: 0.5, y: 0.5 });
  await expect.poll(() => changedSince(page, 'preview', 'preview0'), { timeout: 10_000 }).toBe(0);

  // Arrow keys nudge the selected point by one pixel.
  await page.getByTestId('warp-grid-point-12').click();
  await page.keyboard.press('ArrowRight');
  const nudged = (await warpOf(page)).grid.points[12];
  expect(nudged.y).toBeCloseTo(0.5, 9);
  expect(nudged.x).toBeGreaterThan(0.5);
  expect(nudged.x).toBeLessThan(0.5 + 2 / 1000);

  // Resampling keeps the warp and changes the point count.
  await page.getByTestId('warp-grid-cols').fill('7');
  await page.getByTestId('warp-grid-cols').press('Enter');
  await expect.poll(async () => (await warpOf(page)).grid.points.length).toBe(35);
});

test('grid warp: an untouched grid is pixel-identical to no warp', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as StoreWindow).__projectionLabEngine);
  await page.waitForTimeout(500);
  expect(await snap(page, 'feed', 'none')).toBeGreaterThan(0);
  await page.evaluate(() => {
    const s = (window as unknown as StoreWindow).__projectionLabStore.getState();
    s.updateProjectorWarp(s.projectors[0].id, { mode: 'grid' });
  });
  await page.waitForTimeout(200);
  expect(await changedSince(page, 'feed', 'none')).toBe(0);
});

test('warp export: zip per projector and for all projectors', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-menu').click();
  await page.getByRole('menuitem', { name: /Projector/ }).click();
  await openWarpTab(page);
  await page.getByTestId('warp-mode-grid').click();

  const one = page.waitForEvent('download');
  await page.getByTestId('warp-export').click();
  const oneFile = await one;
  expect(oneFile.suggestedFilename()).toMatch(/-warp\.zip$/);
  const oneNames = listZip(new Uint8Array(readFileSync(await oneFile.path())));
  expect(oneNames).toHaveLength(5);
  expect(oneNames).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/-warp\.obj$/),
      expect.stringMatching(/-warp\.csv$/),
      expect.stringMatching(/-blend-mask\.png$/),
      expect.stringMatching(/-warp\.json$/),
      'README.txt',
    ]),
  );

  const all = page.waitForEvent('download');
  await page.getByTestId('warp-export-all').click();
  const allFile = await all;
  expect(allFile.suggestedFilename()).toBe('all-projectors-warp.zip');
  const allNames = listZip(new Uint8Array(readFileSync(await allFile.path())));
  expect(allNames).toEqual([
    'projector-1/projector-1-warp.obj',
    'projector-1/projector-1-warp.csv',
    'projector-1/projector-1-blend-mask.png',
    'projector-1/projector-1-warp.json',
    'projector-2/projector-2-warp.obj',
    'projector-2/projector-2-warp.csv',
    'projector-2/projector-2-blend-mask.png',
    'projector-2/projector-2-warp.json',
    'README.txt',
  ]);

  // Our warp JSON imports back.
  const points = [0, 0.5, 1].flatMap((y) => [0, 0.5, 1].map((x) => ({ x: 0.1 + 0.8 * x, y: 0.1 + 0.8 * y })));
  const warpJson = { format: 'projectionsim-warp', version: 1, projector: { name: 'Elsewhere' }, warp: { mode: 'grid', grid: { cols: 3, rows: 3, points, interpolation: 'linear' } } };
  await page.getByTestId('warp-import').setInputFiles({ name: 'w.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(warpJson)) });
  await expect(page.getByText(/Imported 3×3 grid settings from “Elsewhere”/)).toBeVisible();
  const imported = await page.evaluate(() => {
    const s = (window as unknown as StoreWindow).__projectionLabStore.getState();
    return s.projectors.find((p) => p.warp?.grid.cols === 3)?.warp?.grid.points[4];
  });
  expect(imported).toEqual({ x: 0.5, y: 0.5 });
});
