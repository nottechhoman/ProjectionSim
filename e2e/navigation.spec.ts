import { test, expect, type Page } from '@playwright/test';

type Cam = { position: { x: number; y: number; z: number } };
const camPos = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __projectionLabEngine: { editorCamera: Cam } }).__projectionLabEngine;
    const p = e.editorCamera.position;
    return { x: p.x, y: p.y, z: p.z };
  });

test('hold right mouse + W flies forward; keys do not trigger shortcuts while flying; F frames the selection', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const before = await camPos(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await expect(page.getByTestId('fly-hint')).toBeVisible();
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  // E flies up — and must not switch the gizmo to Rotate.
  await page.keyboard.down('e');
  await page.waitForTimeout(300);
  await page.keyboard.up('e');
  await page.mouse.up({ button: 'right' });
  const after = await camPos(page);
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  expect(moved).toBeGreaterThan(1);
  expect(after.y).toBeGreaterThan(before.y);
  await expect(page.getByRole('button', { name: 'Move', exact: false }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('fly-hint')).toBeHidden();

  // F: frame the selected projector.
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  const focused = await camPos(page);
  expect(Math.hypot(focused.x - after.x, focused.y - after.y, focused.z - after.z)).toBeGreaterThan(0.5);
});
