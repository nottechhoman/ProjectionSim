import { test, expect, type Page } from '@playwright/test';

type Vec3 = { x: number; y: number; z: number };
type W = Window & {
  __projectionLabStore: {
    getState: () => {
      show: { activeTrackId: string; tracks: { id: string; objectAnimations?: Record<string, { position?: { timeSec: number; value: Vec3 }[] }> }[] };
      setSelectedObject: (id: string) => void;
      undo: () => void;
    };
  };
  __projectionLabTransport: { time: () => number; seek: (t: number) => void; playing: boolean };
  __projectionLabEngine: unknown;
};

// Scrubbing an animated screen re-renders every projector feed per frame: slow on a software GPU.
test.describe.configure({ timeout: 180_000 });

const positionKeys = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as W).__projectionLabStore.getState();
    const track = s.show.tracks.find((t) => t.id === s.show.activeTrackId)!;
    return (track.objectAnimations?.['screen-1']?.position ?? []).map((k) => ({ t: k.timeSec, x: k.value.x }));
  });

/** Where the screen mesh actually is in the 3D view. */
const meshX = (page: Page) =>
  page.evaluate(() => {
    const engine = (window as unknown as W).__projectionLabEngine as { objectMeshes: Map<string, { position: { x: number } }> };
    return engine.objectMeshes.get('screen-1')!.position.x;
  });

const field = (page: Page, label: string) =>
  page.getByTestId('object-transform').getByText(label, { exact: true }).locator('..').getByRole('button');

async function typeField(page: Page, label: string, value: string) {
  await field(page, label).click();
  const input = page.getByTestId('object-transform').getByText(label, { exact: true }).locator('..').locator('input');
  await input.fill(value);
  await input.press('Enter');
}

test('object animation: two position keys, scrub moves the object, stop shows the static transform', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as W).__projectionLabStore);
  await page.evaluate(() => (window as unknown as W).__projectionLabStore.getState().setSelectedObject('screen-1'));

  // Animate on; key the static position at 0.
  await page.getByTestId('object-animate').check();
  await expect(field(page, 'Pos X')).toHaveText('0');
  await page.getByTestId('object-key-add-position').click();

  // At 2 s, between keys: editing offers "Add keyframe here".
  await page.evaluate(() => (window as unknown as W).__projectionLabTransport.seek(2));
  await typeField(page, 'Pos X', '2');
  await page.getByTestId('object-key-here').click();
  expect(await positionKeys(page)).toEqual([
    { t: 0, x: 0 },
    { t: 2, x: 2 },
  ]);
  // "animated" badge in the Inspector and in the Scene list.
  await expect(page.getByTestId('object-transform').getByTestId('animated-badge')).toBeVisible();
  await expect(page.getByTestId('animated-badge')).toHaveCount(2);

  // Timeline shows the object row with two position diamonds.
  await expect(page.getByTestId('objrow-screen-1')).toBeVisible();
  await expect(page.locator('[data-testid^="objkey-screen-1-position-"]')).toHaveCount(2);

  // Scrub on the ruler: the Inspector and the mesh follow the keys.
  const ruler = page.getByTestId('timeline-ruler');
  const box = (await ruler.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(box.x + 4 + k * 3, box.y + box.height / 2);
  await page.mouse.up();
  const t = await page.evaluate(() => (window as unknown as W).__projectionLabTransport.time());
  expect(t).toBeGreaterThan(0);
  expect(t).toBeLessThan(2);
  const expected = Math.round(t * 10000) / 10000; // x goes 0 → 2 over 0 → 2 s
  await expect.poll(async () => Number(await field(page, 'Pos X').textContent())).toBeCloseTo(expected, 3);
  await expect.poll(() => meshX(page)).toBeCloseTo(t, 3);

  // Editing on a key changes that key.
  await page.evaluate(() => (window as unknown as W).__projectionLabTransport.seek(2));
  await typeField(page, 'Pos X', '3');
  expect((await positionKeys(page))[1]).toEqual({ t: 2, x: 3 });
  await expect.poll(() => meshX(page)).toBeCloseTo(3, 4);

  // Stop: playhead at 0, not playing → static transform again.
  await page.getByTestId('transport-stop').click();
  await expect(field(page, 'Pos X')).toHaveText('0');
  await expect.poll(() => meshX(page)).toBe(0);

  // Undo removes the last key edit.
  await page.evaluate(() => (window as unknown as W).__projectionLabStore.getState().undo());
  expect((await positionKeys(page))[1]).toEqual({ t: 2, x: 2 });
});
