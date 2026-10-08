import { test, expect } from '@playwright/test';

test('studio: auto edge blend, blend-mask export, mappings and warp', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-menu').click();
  await page.getByRole('menuitem', { name: /Projector/ }).click();

  await page.getByTestId('studio-toggle').click();
  await expect(page.getByTestId('studio-panel')).toBeVisible();

  // Edge blend
  await page.getByTestId('blend-mode-auto').click();
  await expect(page.getByTestId('blend-chart')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-masks').click();
  expect((await download).suggestedFilename()).toMatch(/blend-mask-\d+x\d+\.png$/);

  // Mappings: add a Feed mapping and edit its regions
  await page.getByTestId('studio-tab-mappings').click();
  await page.getByLabel('New mapping kind').selectOption('feed');
  await page.getByTestId('mapping-add').click();
  await expect(page.getByTestId('mapping-kind')).toHaveValue('feed');
  await expect(page.getByTestId('uv-editor')).toBeVisible();

  // Warp
  await page.getByTestId('studio-tab-warp').click();
  await expect(page.getByTestId('warp-editor')).toBeVisible();
  await page.getByTestId('warp-fit').click();
  await expect(page.getByTestId('warp-enabled')).toBeChecked();
});

test('outputs: open a projector output window', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('more-menu').click();
  await page.getByRole('menuitem', { name: 'Send to displays…' }).click();
  const popup = context.waitForEvent('page');
  await page.getByTestId('open-output-proj-1').click();
  const win = await popup;
  await expect(win).toHaveTitle(/NAPT Output — Projector 1/);
  await expect(win.locator('canvas')).toHaveCount(1);
});
