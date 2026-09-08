import { test, expect } from '@playwright/test';

test('loads the app shell and viewport', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Move' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Measure' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('shows scene and inspector panels', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Scene', { exact: true })).toBeVisible();
  await expect(page.getByText('Inspector', { exact: true })).toBeVisible();
});

test('keeps shared content source and calculation target stable across selection', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '+ Projector' }).click();
  await page.getByTestId('mapping-shared-button').click();

  const sourceSelect = page.getByTestId('shared-content-source-select');
  await expect(sourceSelect).toBeVisible();
  await sourceSelect.selectOption({ label: 'Projector 1' });

  await page.getByRole('listitem').filter({ hasText: 'Projector 2' }).click();
  await expect(sourceSelect).toHaveValue('proj-1');

  const targetSelect = page.getByTestId('calculation-target-select');
  await targetSelect.selectOption({ label: 'Screen (flat)' });
  await expect(targetSelect).toHaveValue('screen-1');

  await page.getByRole('listitem').filter({ hasText: 'Floor' }).click();
  await expect(targetSelect).toHaveValue('screen-1');
  await expect(page.getByTestId('calculation-target-label')).toContainText('Screen (flat)');

  await page.getByRole('button', { name: 'Curved Screen' }).click();
  await expect(targetSelect).toHaveValue('screen-1');
  await expect(page.getByTestId('calculation-target-label')).toContainText('Screen (flat)');
});
