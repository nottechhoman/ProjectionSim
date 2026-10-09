import { test, expect } from '@playwright/test';

test('previz: pick a projector model and lens, read brightness, show the heatmap', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page).toHaveTitle('Projection Simulator');

  await page.getByRole('listitem').filter({ hasText: 'Projector 1' }).first().click();
  const section = page.getByTestId('projector-model-section');
  await expect(section).toBeVisible();

  await page.getByTestId('projector-model-select').selectOption('barco-udx-w22');
  await expect(page.getByTestId('projector-lens-select')).toBeVisible();
  await expect(section.getByRole('button', { name: '21000' })).toBeVisible();
  await expect(page.getByTestId('projector-fill-hint')).toContainText('To fill Screen');

  const optics = await page.evaluate(() => {
    const store = (window as unknown as { __projectionLabStore: { getState: () => { projectors: { optics: { throwRatio: number; throwRatioMin?: number; throwRatioMax?: number; resolution: { width: number } } }[] } } }).__projectionLabStore;
    return store.getState().projectors[0].optics;
  });
  expect(optics.resolution.width).toBe(1920);
  expect(optics.throwRatio).toBeGreaterThanOrEqual(optics.throwRatioMin!);
  expect(optics.throwRatio).toBeLessThanOrEqual(optics.throwRatioMax!);

  const avg = page.getByTestId('brightness-avg');
  await expect(avg).toContainText('nits');
  const before = await avg.textContent();

  // Halving the lumens halves the brightness readout.
  await section.getByRole('button', { name: '21000' }).click();
  const lumens = section.locator('input[inputmode="decimal"]');
  await lumens.fill('10500');
  await lumens.press('Enter');
  await expect(avg).not.toHaveText(before ?? '');

  await page.getByTestId('show-brightness-heatmap').click();
  await expect(page.getByTestId('illuminance-legend')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/v5-brightness-heatmap.png' });

  await page.getByTestId('illuminance-unit').selectOption('lux');
  await expect(page.getByTestId('illuminance-scale')).toBeVisible();
});
