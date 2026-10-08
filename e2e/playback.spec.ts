import { test, expect } from '@playwright/test';

test('transport: play advances the timecode, stop returns to zero', async ({ page }) => {
  await page.goto('/');
  const timecode = page.getByTestId('transport-timecode');
  await expect(timecode).toHaveText('00:00:00:00');
  await page.getByTestId('transport-play').click();
  await expect.poll(async () => timecode.textContent(), { timeout: 5000 }).not.toBe('00:00:00:00');
  await page.getByTestId('transport-stop').click();
  await expect(timecode).toHaveText('00:00:00:00');
});

test('timeline: drag a clip later and scrub the ruler', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('timeline-dock')).toBeVisible();
  const clip = page.locator('[data-testid^="clip-"]').first();
  await expect(clip).toBeVisible();
  const box = (await clip.boundingBox())!;
  // Grab the middle (not the trim handles) and drag right.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const start = await page.evaluate(() => {
    const st = (window as unknown as { __projectionLabStore: { getState: () => { show: { tracks: { layers: { startSec: number }[] }[] } } } }).__projectionLabStore.getState();
    return st.show.tracks[0].layers[0].startSec;
  });
  expect(start).toBeGreaterThan(1);

  const ruler = page.getByTestId('timeline-ruler');
  const r = (await ruler.boundingBox())!;
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.getByTestId('transport-timecode')).not.toHaveText('00:00:00:00');
});
