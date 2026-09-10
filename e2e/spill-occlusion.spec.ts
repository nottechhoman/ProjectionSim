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
    localStorage.setItem('projectionlab-autosave-v1', json);
  }, projectJson);
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForTimeout(800);
}

async function readPixel(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  return page.evaluate(
    ({ px, py }) => {
      const engine = (window as Window & {
        __projectionLabEngine?: { readCanvasPixel: (x: number, y: number) => [number, number, number, number] | null };
      }).__projectionLabEngine;
      if (!engine) throw new Error('SceneEngine test hook missing');
      const sample = engine.readCanvasPixel(px, py);
      if (!sample) throw new Error('readCanvasPixel failed');
      return sample;
    },
    { px: x, py: y },
  );
}

function colorDistance(a: [number, number, number, number], b: [number, number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test('raw spill occlusion hides rear center behind front blocker', async ({ page }) => {
  await loadSpillSample(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  const center = await readPixel(page, 640, 360);
  const spillLeft = await readPixel(page, 420, 360);
  const spillRight = await readPixel(page, 860, 360);

  expect(center[0] + center[1] + center[2]).toBeLessThan(220);
  expect(spillLeft[0] + spillLeft[1] + spillLeft[2]).toBeGreaterThan(280);
  expect(spillRight[0] + spillRight[1] + spillRight[2]).toBeGreaterThan(280);
  expect(colorDistance(spillLeft, spillRight)).toBeGreaterThan(40);
});

