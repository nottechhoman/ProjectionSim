import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// Every bundled sample opens through File → Open, plays and stops.
const dir = join(dirname(fileURLToPath(import.meta.url)), '../public/samples');
const samples = readdirSync(dir).filter((f) => f.endsWith('.json'));

test('there are three bundled samples', () => {
  expect(samples).toHaveLength(3);
});

for (const file of samples) {
  test(`sample ${file} opens and plays`, async ({ page }) => {
    test.setTimeout(90_000);
    const text = readFileSync(join(dir, file), 'utf8');
    const { name } = JSON.parse(text) as { name: string };
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    await page.locator('input[type="file"][accept=".json,.projectionlab.json"]').setInputFiles({
      name: file,
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(page.getByText(`Loaded "${name}"`)).toBeVisible({ timeout: 15_000 });
    const timecode = page.getByTestId('transport-timecode');
    await page.getByTestId('transport-play').click();
    await expect.poll(async () => timecode.textContent(), { timeout: 15_000 }).not.toBe('00:00:00:00');
    await page.getByTestId('transport-stop').click();
    await expect(timecode).toHaveText('00:00:00:00');
    expect(errors).toEqual([]);
  });
}
