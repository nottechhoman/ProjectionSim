import { test, expect } from '@playwright/test';

test('loads the app shell and viewport', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Move' })).toBeVisible();
  await expect(page.getByTestId('more-menu')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('shows scene and inspector panels', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Scene', { exact: true })).toBeVisible();
  await expect(page.getByText('Inspector', { exact: true })).toBeVisible();
});

test('adding a projector adds a locked perspective mapping; calculation target stays stable', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('add-menu').click();
  await page.getByRole('menuitem', { name: /Projector/ }).click();
  await page.getByTestId('studio-toggle').click();
  await page.getByTestId('studio-tab-mappings').click();
  await expect(page.getByTestId('mapping-list')).toContainText('Projector 2 view');

  const targetSelect = page.getByTestId('calculation-target-select');
  await page.getByRole('listitem').filter({ hasText: 'Screen' }).first().click();
  await targetSelect.selectOption({ label: 'Screen (flat)' });
  await expect(targetSelect).toHaveValue('screen-1');
  await page.getByRole('listitem').filter({ hasText: 'Floor' }).click();
  await expect(targetSelect).toHaveValue('screen-1');
  await expect(page.getByTestId('calculation-target-label')).toContainText('Screen (flat)');
});

test('layers panel: add a pattern layer and pick its mapping', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('more-menu').click();
  await page.getByRole('menuitem', { name: 'Layers' }).click();
  await expect(page.getByTestId('layers-panel')).toBeVisible();
  await page.getByTestId('layer-add-pattern').click();
  await expect(page.getByTestId('layer-inspector')).toBeVisible();
  const selects = page.locator('[data-testid^="layer-mapping-"]');
  await expect(selects).toHaveCount(3);
});

test('visible coverage responds to blocker and preserves calculation target', async ({ page }) => {
  await page.goto('/');

  const targetSelect = page.getByTestId('calculation-target-select');
  await targetSelect.selectOption({ label: 'Screen (flat)' });

  const visibleCoverage = page.getByTestId('visible-coverage');
  await expect(visibleCoverage).toBeVisible();
  const baselineText = await visibleCoverage.textContent();
  const baselineArea = parseCoverageArea(baselineText ?? '');
  expect(baselineArea).toBeGreaterThan(0);

  await page.getByTestId('add-menu').click();
  await page.getByRole('menuitem', { name: 'Box' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Box' }).click();

  await expect
    .poll(async () => parseCoverageArea(await visibleCoverage.textContent() ?? ''))
    .toBeLessThan(baselineArea);

  await page.getByTestId('blocks-projection-checkbox').uncheck();
  await expect
    .poll(async () => parseCoverageArea(await visibleCoverage.textContent() ?? ''))
    .toBeCloseTo(baselineArea, 1);

  await page.getByRole('listitem').filter({ hasText: 'Floor' }).click();
  await expect(targetSelect).toHaveValue('screen-1');
});

function parseCoverageArea(text: string): number {
  const match = text.match(/([\d.]+)\s*m²/);
  return match ? Number(match[1]) : 0;
}
