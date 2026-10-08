import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/overlap-uv.obj');

test('setlist: add, rename and switch tracks; the active track drives the timeline', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  const select = page.getByTestId('track-select');
  await expect(select.locator('option')).toHaveCount(1);
  await page.getByTestId('track-add').click();
  await expect(select.locator('option')).toHaveCount(2);
  await expect(page.locator('[data-testid^="clip-"]')).toHaveCount(0);
  page.once('dialog', (d) => d.accept('Encore'));
  await page.getByTestId('track-rename').click();
  await expect(select).toContainText('2. Encore');
  await select.selectOption({ index: 0 });
  await expect(page.locator('[data-testid^="clip-"]')).toHaveCount(1);
  await page.keyboard.press('Meta+z');
});

test('overlapping model UVs: warning, then a generated atlas clears it', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  page.on('dialog', (d) => d.accept('1'));
  await page.locator('input[type=file][accept*=".obj"]').setInputFiles(fixture);
  await page.getByRole('listitem').filter({ hasText: 'overlap-uv' }).click();
  await expect(page.getByTestId('uv-warning')).toContainText('overlapping UVs');
  await page.getByTestId('uv-atlas-generate').click();
  await expect(page.getByTestId('uv-atlas-on')).toBeVisible();
  await expect(page.getByTestId('uv-atlas-on')).not.toContainText('still');
});
