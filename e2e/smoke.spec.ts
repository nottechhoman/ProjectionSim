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
