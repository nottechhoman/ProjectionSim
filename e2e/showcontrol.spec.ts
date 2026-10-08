import { test, expect } from '@playwright/test';

type Store = {
  getState: () => {
    show: { tracks: { cues: { timeSec: number }[]; sections: { id: string }[] }[] };
    addSection: (a: number, b: number) => void;
    updateSection: (id: string, patch: Record<string, unknown>) => void;
  };
};

test('keyboard: M adds a cue, arrows step frames, Shift+arrow jumps cues, Enter = GO', async ({ page }) => {
  await page.goto('/');
  const timecode = page.getByTestId('transport-timecode');
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(timecode).toHaveText('00:00:00:02');
  await page.keyboard.press('m');
  await page.keyboard.press('ArrowLeft');
  await expect(timecode).toHaveText('00:00:00:01');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(timecode).toHaveText('00:00:00:02');
  const cues = await page.evaluate(() => (window as unknown as { __projectionLabStore: Store }).__projectionLabStore.getState().show.tracks[0].cues.length);
  expect(cues).toBe(1);
  await page.keyboard.press('Escape');
  await expect(timecode).toHaveText('00:00:00:00');
  // GO from 0 jumps to the cue and plays.
  await page.keyboard.press('Enter');
  await expect.poll(async () => timecode.textContent()).not.toMatch(/^00:00:00:0[0-2]$/);
  await page.keyboard.press(' ');
});

test('section end action "hold" stops the transport at the section end', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const st = (window as unknown as { __projectionLabStore: Store }).__projectionLabStore.getState();
    st.addSection(0, 1);
    const id = (window as unknown as { __projectionLabStore: Store }).__projectionLabStore.getState().show.tracks[0].sections[0].id;
    st.updateSection(id, { endAction: 'hold' });
  });
  await page.getByTestId('transport-play').click();
  // Held on the section's last frame (1 s at 30 fps → frame 29) and paused.
  await expect(page.getByTestId('transport-timecode')).toHaveText('00:00:00:29', { timeout: 5000 });
  await expect(page.getByTestId('transport-play')).toHaveAttribute('aria-label', 'Play');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('transport-timecode')).toHaveText('00:00:00:29');
});
