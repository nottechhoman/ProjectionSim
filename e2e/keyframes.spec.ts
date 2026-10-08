import { test, expect } from '@playwright/test';

type Layer = { keyframes?: Record<string, { timeSec: number; value: number }[]> };
const keysOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const st = (window as unknown as { __projectionLabStore: { getState: () => { show: { tracks: { layers: Layer[] }[] } } } }).__projectionLabStore.getState();
    return st.show.tracks[0].layers[0].keyframes?.x ?? [];
  });

test('keyframes: add in the Inspector, auto-key, drag a diamond, delete with the Delete key', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.getByText('Checkerboard', { exact: true }).first().click();
  await expect(page.getByTestId('keyframe-editor')).toBeVisible();
  await page.getByTestId('key-toggle-x').click();
  // 30 frames later, change X → a second key (auto-key).
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
  const box = page.getByLabel('X value');
  await box.fill('0.4');
  await box.press('Enter');
  await expect.poll(async () => (await keysOf(page)).map((k) => [k.timeSec, k.value])).toEqual([[0, 0], [1, 0.4]]);
  const diamonds = page.locator('[data-testid^="key-x-"]');
  await expect(diamonds).toHaveCount(2);

  // Drag the second diamond right.
  const d = (await diamonds.nth(1).boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2 + 60, d.y + d.height / 2, { steps: 5 });
  await page.mouse.up();
  const moved = await keysOf(page);
  expect(moved[1].timeSec).toBeGreaterThan(1.5);

  // Delete the selected key.
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await keysOf(page)).length).toBe(1);
});
