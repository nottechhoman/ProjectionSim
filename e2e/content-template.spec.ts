import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('content template: preview, PNG at canvas size, regions CSV', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-toggle').click();
  await page.getByTestId('studio-tab-mappings').click();
  await page.getByTestId('mapping-list').getByRole('button', { name: /^Screen/ }).click();

  const section = page.getByTestId('content-template');
  await expect(section).toContainText('1920 × 1080 px');
  await section.getByTestId('template-preview').click();
  await expect(section.getByTestId('template-image')).toBeVisible();
  await expect(section.getByTestId('template-screens')).toContainText('Screen: 1920 × 1080 px at 0, 0');

  const [png] = await Promise.all([page.waitForEvent('download'), section.getByTestId('template-download').click()]);
  expect(png.suggestedFilename()).toBe('screen-template-1920x1080.png');
  expect(pngSize(await readFile((await png.path())!))).toEqual({ w: 1920, h: 1080 });

  const [csv] = await Promise.all([page.waitForEvent('download'), section.getByTestId('template-csv').click()]);
  const text = await readFile((await csv.path())!, 'utf8');
  expect(text).toContain('Screen,screen,0,0,1920,1080,2073600,');
});

test('content template: projector view mapping shows the screen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-menu').click();
  await page.getByRole('menuitem', { name: /Projector/ }).click();
  await page.getByTestId('studio-toggle').click();
  await page.getByTestId('studio-tab-mappings').click();
  await page.getByTestId('mapping-list').getByRole('button', { name: /^Projector 1 view/ }).click();
  const section = page.getByTestId('content-template');
  await section.getByTestId('template-preview').click();
  await expect(section.getByTestId('template-screens')).toContainText(/Screen: \d+ × \d+ px at/);
  await expect(section.getByTestId('template-image')).toBeVisible();
});
