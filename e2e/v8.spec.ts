import { test, expect, type Page } from '@playwright/test';

type EngineWindow = Window & {
  __projectionLabEngine: { editorCamera: { position: { x: number; y: number; z: number }; fov: number } };
  __projectionLabStore: {
    getState: () => {
      projectors: { transform: { position: { x: number; y: number; z: number } } }[];
      viewFromProjectorId: string | null;
    };
  };
};

const camera = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as EngineWindow;
    const c = w.__projectionLabEngine.editorCamera;
    return { x: c.position.x, y: c.position.y, z: c.position.z, fov: c.fov };
  });

test('v8 phone: look through a projector, fit, full screen', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByTestId('phone-viewer')).toBeVisible();

  await page.getByTestId('phone-view-projector').first().click();
  await expect(page.getByTestId('phone-lens-badge')).toContainText('Projector 1');
  const proj = await page.evaluate(
    () => (window as unknown as EngineWindow).__projectionLabStore.getState().projectors[0].transform.position,
  );
  await expect.poll(async () => (await camera(page)).z).toBeCloseTo(proj.z, 3);
  expect((await camera(page)).x).toBeCloseTo(proj.x, 3);

  await page.getByTestId('phone-fit').click();
  await expect(page.getByTestId('phone-lens-badge')).toHaveCount(0);
  await expect.poll(async () => (await camera(page)).fov).toBe(50);

  await page.getByTestId('phone-fullscreen').click();
  await expect(page.getByTestId('phone-play')).toBeHidden();
  await page.getByTestId('phone-exit-fullscreen').click();
  await expect(page.getByTestId('phone-play')).toBeVisible();

  // Editor on a phone: the transport row fits, Cues is on screen.
  await page.getByTestId('phone-edit').click();
  const cues = await page.getByTestId('cues-toggle').boundingBox();
  expect(cues).not.toBeNull();
  expect(cues!.x + cues!.width).toBeLessThanOrEqual(390);
  await ctx.close();
});

test('v8 phone on its side: controls in a column beside the 3D view', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByTestId('phone-viewer')).toBeVisible();
  const canvas = await page.locator('[data-testid="phone-viewer"] canvas').first().boundingBox();
  // The 3D view is the full height and most of the width.
  expect(canvas!.height).toBeGreaterThan(380);
  expect(canvas!.width).toBeGreaterThan(500);
  const go = await page.getByRole('button', { name: 'GO, next cue' }).boundingBox();
  expect(go!.x).toBeGreaterThan(canvas!.width - 1);
  expect(go!.y + go!.height).toBeLessThanOrEqual(390);
  await ctx.close();
});

test('v8 web app: manifest and icons are linked', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await page.request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await page.request.get(new URL(icon.src, new URL(href!, page.url())).href)).ok()).toBe(true);
  }
});
