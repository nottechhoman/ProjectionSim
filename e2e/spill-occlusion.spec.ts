import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const samplePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../public/samples/spill-occlusion.projectionlab.json',
);

async function loadSpillSample(page: import('@playwright/test').Page): Promise<void> {
  const projectJson = readFileSync(samplePath, 'utf8');
  await page.addInitScript((json: string) => {
    localStorage.setItem('projectionlab-v4-autosave-v1', json);
  }, projectJson);
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForTimeout(800);
}

/** Viewport pixel at a world point (rear screen is at z = -2). */
async function readPixel(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  z = -2,
): Promise<[number, number, number, number]> {
  return page.evaluate(
    ({ wx, wy, wz }) => {
      const engine = (window as Window & {
        __projectionLabEngine?: {
          readCanvasPixel: (x: number, y: number) => [number, number, number, number] | null;
          worldToCanvas: (x: number, y: number, z: number) => { x: number; y: number } | null;
        };
      }).__projectionLabEngine;
      if (!engine) throw new Error('SceneEngine test hook missing');
      const at = engine.worldToCanvas(wx, wy, wz);
      if (!at) throw new Error('worldToCanvas failed');
      const sample = engine.readCanvasPixel(at.x, at.y);
      if (!sample) throw new Error('readCanvasPixel failed');
      return sample;
    },
    { wx: x, wy: y, wz: z },
  );
}

// Rear-screen points seen past the front screen from the default camera:
// SHADOW is behind the front screen as seen by the projector; SPILL_* are lit beside it.
const SHADOW: [number, number] = [1.5, 2.3];
const SPILL_LEFT: [number, number] = [-2.3, 2.5];
const SPILL_RIGHT: [number, number] = [2.3, 2.5];

function colorDistance(a: [number, number, number, number], b: [number, number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test('raw spill occlusion hides rear center behind front blocker', async ({ page }) => {
  await loadSpillSample(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  const center = await readPixel(page, ...SHADOW);
  const spillLeft = await readPixel(page, ...SPILL_LEFT);
  const spillRight = await readPixel(page, ...SPILL_RIGHT);

  expect(center[0] + center[1] + center[2]).toBeLessThan(220);
  expect(spillLeft[0] + spillLeft[1] + spillLeft[2]).toBeGreaterThan(280);
  expect(spillRight[0] + spillRight[1] + spillRight[2]).toBeGreaterThan(280);
  expect(colorDistance(spillLeft, spillRight)).toBeGreaterThan(40);
});

test('disabling front blocking reveals rear center projection', async ({ page }) => {
  await loadSpillSample(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  const before = await readPixel(page, ...SHADOW);
  await page.getByRole('listitem').filter({ hasText: 'Front Screen' }).click();
  await page.getByTestId('blocks-projection-checkbox').uncheck();
  await page.waitForTimeout(600);

  const after = await readPixel(page, ...SHADOW);
  expect(after[0] + after[1] + after[2]).toBeGreaterThan(before[0] + before[1] + before[2] + 80);
});

test('rear visible coverage drops when front screen blocks center beam', async ({ page }) => {
  await loadSpillSample(page);

  const visibleCoverage = page.getByTestId('visible-coverage');
  await expect(visibleCoverage).toBeVisible();
  const obstructed = parseCoverageArea(await visibleCoverage.textContent() ?? '');

  await page.getByRole('listitem').filter({ hasText: 'Front Screen' }).click();
  await page.getByTestId('blocks-projection-checkbox').uncheck();
  await expect
    .poll(async () => parseCoverageArea(await visibleCoverage.textContent() ?? ''))
    .toBeGreaterThan(obstructed + 0.5);
});

function parseCoverageArea(text: string): number {
  const match = text.match(/([\d.]+)\s*m²/);
  return match ? Number(match[1]) : 0;
}

