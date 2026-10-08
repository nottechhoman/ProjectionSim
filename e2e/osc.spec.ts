import { createSocket } from 'node:dgram';
import { test, expect } from '@playwright/test';
// @ts-expect-error plain JS helper shared with the bridge
import { encodeOsc } from '../tools/osc-bridge/osc.mjs';

/** Real UDP OSC → the bridge started by the dev server → the app (no manual steps). */
async function sendOsc(address: string, args: (string | number)[] = []) {
  const udp = createSocket('udp4');
  await new Promise<void>((resolve, reject) => udp.send(encodeOsc(address, args), 9000, '127.0.0.1', (err) => (err ? reject(err) : resolve())));
  udp.close();
}

test('OSC: the dev server bridge is connected by default; /show/cue and /show/go drive the transport', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    const st = (window as unknown as { __projectionLabStore: { getState: () => { addCue: (t: number, n?: string) => void; setControlPanelVisible: (v: boolean) => void } } }).__projectionLabStore.getState();
    st.addCue(5, 'Intro');
    st.addCue(20, 'Finale');
    st.setControlPanelVisible(true);
  });
  await expect(page.getByTestId('osc-status')).toContainText('Bridge connected', { timeout: 10000 });
  await expect(page.getByTestId('osc-status')).toContainText('9000');

  const timecode = page.getByTestId('transport-timecode');
  await sendOsc('/show/cue', [2]);
  await expect(timecode).toHaveText(/^00:00:2\d:/);
  await expect(page.getByTestId('osc-last')).toContainText('/show/cue 2');
  await expect(page.getByTestId('osc-last')).toContainText('Cue Finale');

  await sendOsc('/show/stop');
  await expect(timecode).toHaveText('00:00:00:00');
  await sendOsc('/show/go');
  await expect(timecode).toHaveText(/^00:00:0[5-9]:/);
  await expect(page.getByTestId('osc-last')).toContainText('/show/go');
  await sendOsc('/show/pause');
});
