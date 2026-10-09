import { test, expect, type Page } from '@playwright/test';

type StoreWindow = Window & {
  __projectionLabStore: {
    getState: () => {
      projectors: {
        transform: { position: { x: number; y: number; z: number } };
        optics: { throwRatio: number; lensShiftV: number };
        catalog?: { modelId: string; lensId: string };
      }[];
      setMaterialPreviewMode: (m: string) => void;
    };
  };
};

const projector0 = (page: Page) =>
  page.evaluate(() => (window as unknown as StoreWindow).__projectionLabStore.getState().projectors[0]);

test('v6 previz: researched lens table, auto place, pixel density', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('listitem').filter({ hasText: 'Projector 1' }).first().click();

  await page.getByTestId('projector-model-select').selectOption('panasonic-pt-rz21k');
  const lenses = page.getByTestId('projector-lens-select').locator('option');
  await expect(lenses).toHaveCount(17);
  await expect(page.getByTestId('catalog-note')).toContainText('ISO 21118');

  await page.getByTestId('auto-place').click();
  const placed = await projector0(page);
  // 6 m wide screen: distance = throw × 6 m, square-on, on the screen's axis.
  expect(placed.transform.position.z).toBeCloseTo(placed.optics.throwRatio * 6, 3);
  expect(placed.transform.position.x).toBeCloseTo(0, 6);
  expect(placed.optics.lensShiftV).toBe(0);

  await expect(page.getByTestId('density-avg')).toContainText('px/m');
  await page.getByTestId('show-density-heatmap').click();
  await expect(page.getByTestId('density-legend')).toBeVisible();
  await page.getByTestId('density-scale').selectOption('500');
  await expect(page.getByTestId('density-legend')).toContainText('2.0 mm per pixel');
});

test('v6 phone: a copied link opens the project in the phone viewer', async ({ browser }) => {
  const desk = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const d = await desk.newPage();
  await d.goto('/');
  await d.getByRole('listitem').filter({ hasText: 'Projector 1' }).first().click();
  await d.getByTestId('projector-model-select').selectOption('epson-eb-l1755u');
  await d.getByTestId('auto-place').click();
  const deskProjector = await projector0(d);
  await d.getByTestId('more-menu').click();
  await d.getByText('Copy link for phone').click();
  await expect.poll(() => d.evaluate(() => navigator.clipboard.readText())).toContain('#view=');
  const link = await d.evaluate(() => navigator.clipboard.readText());
  await desk.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await p.goto(link);
  await expect(p.getByTestId('phone-viewer')).toBeVisible();
  await expect.poll(async () => (await projector0(p)).catalog?.modelId).toBe('epson-eb-l1755u');
  expect((await projector0(p)).transform.position.z).toBeCloseTo(deskProjector.transform.position.z, 6);
  expect(p.url()).not.toContain('#view=');

  await p.getByTestId('phone-show-illuminance').click();
  await expect(p.getByTestId('illuminance-legend')).toBeVisible();
  await p.getByTestId('phone-details-toggle').click();
  await expect(p.getByTestId('phone-brightness')).toContainText('nits');
  await expect(p.getByTestId('phone-projector-card').first()).toContainText('Epson EB-L1755U');

  await p.getByTestId('phone-edit').click();
  await expect(p.getByTestId('phone-viewer')).toHaveCount(0);
  await expect(p.getByTestId('more-menu')).toBeVisible();
  await phone.close();
});
