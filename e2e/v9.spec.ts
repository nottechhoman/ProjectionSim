import { test, expect, type Page } from '@playwright/test';

type StoreWindow = Window & {
  __projectionLabStore: {
    getState: () => {
      projectName: string;
      sceneObjects: { name: string }[];
      projectors: { id: string; name: string }[];
      viewLayout: string;
      leftPanelVisible: boolean;
      timelineVisible: boolean;
      undo: () => void;
    };
  };
};

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as StoreWindow).__projectionLabStore.getState();
    return {
      name: s.projectName,
      objects: s.sceneObjects.map((o) => o.name),
      projectors: s.projectors.map((p) => p.name),
      layout: s.viewLayout,
      left: s.leftPanelVisible,
      timeline: s.timelineVisible,
    };
  });

/** Share of non-background pixels in a pane canvas (it must show something). */
const paneFill = (page: Page, index: number) =>
  page.evaluate((i) => {
    const canvas = document.querySelector(`[data-testid="view-pane-${i}"] canvas`) as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || canvas.width === 0) return 0;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let k = 0; k < data.length; k += 4 * 16) if (data[k] + data[k + 1] + data[k + 2] > 120) lit++;
    return lit / (data.length / (4 * 16));
  }, index);

test('v9: stage preset, multiview and workspace modes', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('projectionSim.multiview'));

  page.once('dialog', (d) => d.accept());
  await page.getByTestId('stage-menu').click();
  await page.getByRole('menuitem', { name: 'Proscenium theatre' }).click();
  await expect.poll(async () => (await state(page)).name).toBe('Proscenium theatre');
  const loaded = await state(page);
  expect(loaded.objects).toEqual(expect.arrayContaining(['Cyc', 'Proscenium header', 'Stage deck']));
  expect(loaded.projectors).toEqual(['FOH left', 'FOH right']);

  // Previz: 2×2 with top, front and through the selected projector.
  await page.getByTestId('mode-switch').getByRole('button', { name: 'Previz' }).click();
  await expect(page.getByTestId('viewport-grid')).toHaveAttribute('data-layout', 'quad');
  await expect(page.getByTestId('view-pane-3')).toBeVisible();
  await expect.poll(() => paneFill(page, 3), { timeout: 10_000 }).toBeGreaterThan(0.2);
  await expect.poll(() => paneFill(page, 2), { timeout: 10_000 }).toBeGreaterThan(0.01);

  // A pane can show a projector output instead.
  await page.getByTestId('view-pane-1').locator('select').selectOption({ label: 'Output · FOH right' });
  await expect.poll(() => paneFill(page, 1), { timeout: 10_000 }).toBeGreaterThan(0.2);

  // Show: one view, timeline up, side panels away.
  await page.getByTestId('mode-switch').getByRole('button', { name: 'Show' }).click();
  await expect(page.getByTestId('viewport-grid')).toHaveAttribute('data-layout', 'single');
  const show = await state(page);
  expect(show.left).toBe(false);
  expect(show.timeline).toBe(true);

  // Undo brings the previous scene back.
  await page.evaluate(() => (window as unknown as StoreWindow).__projectionLabStore.getState().undo());
  await expect.poll(async () => (await state(page)).objects).not.toContain('Proscenium header');
});

test('v9: set piece adds a screen that every projector paints', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('stage-menu').click();
  await page.getByRole('menuitem', { name: 'Flat screen' }).click();
  const painted = await page.evaluate(() => {
    const s = (window as unknown as { __projectionLabStore: { getState: () => {
      sceneObjects: { id: string; name: string }[];
      show: { mappings: { kind: string; screenIds: string[]; perspective?: { lockToProjectorId: string | null } }[] };
    } } }).__projectionLabStore.getState();
    const screen = s.sceneObjects.find((o) => o.name === 'Screen' && o.id.startsWith('screen-') && o.id !== 'screen-1');
    const locked = s.show.mappings.filter((m) => m.kind === 'perspective' && m.perspective?.lockToProjectorId);
    return { hasScreen: !!screen, all: locked.every((m) => screen && m.screenIds.includes(screen.id)), direct: s.show.mappings.some((m) => m.kind === 'direct' && screen && m.screenIds[0] === screen.id) };
  });
  expect(painted).toEqual({ hasScreen: true, all: true, direct: true });
});
