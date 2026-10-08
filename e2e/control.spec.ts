import { test, expect, type Page } from '@playwright/test';

/** A fake Web MIDI device: window.__midiSend(bytes) delivers a message on its input. */
async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    const input = { id: 'fake-1', name: 'Fake MIDI', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: () => Promise.resolve(access), configurable: true });
    (window as unknown as { __midiSend: (b: number[]) => void }).__midiSend = (bytes: number[]) => input.onmidimessage?.({ data: new Uint8Array(bytes) });
  });
}

const send = (page: Page, bytes: number[]) => page.evaluate((b) => (window as unknown as { __midiSend: (b: number[]) => void }).__midiSend(b), bytes);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

test('MIDI: learn a note for Stop, MSC GO to a cue, MTC chase', async ({ page }) => {
  await fakeMidi(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    const st = (window as unknown as { __projectionLabStore: { getState: () => { addCue: (t: number, n?: string) => void } } }).__projectionLabStore.getState();
    st.addCue(5, 'Intro');
    st.addCue(20, 'Finale');
  });
  await page.getByTestId('more-menu').click();
  await page.getByRole('menuitem', { name: /External control/ }).click();
  await page.getByTestId('midi-enabled').check();
  await expect(page.getByTestId('control-panel')).toContainText('(ready)');

  // Learn: Stop ← note 60 on channel 1.
  await page.getByTestId('learn-stop').click();
  await expect(page.getByTestId('midi-learning')).toBeVisible();
  await send(page, [0x90, 60, 100]);
  await expect(page.getByTestId('binding-stop')).toContainText('Note C4 (60)');

  const timecode = page.getByTestId('transport-timecode');
  // MSC GO cue "Finale" → playhead at 20 s, playing.
  await send(page, [0xf0, 0x7f, 0x7f, 0x02, 0x01, 0x01, ...ascii('Finale'), 0xf7]);
  await expect(timecode).toHaveText(/^00:00:2\d:/);
  // The learned note stops and rewinds.
  await send(page, [0x90, 60, 100]);
  await expect(timecode).toHaveText('00:00:00:00');

  // MTC chase: full frame 00:00:10:00 at 30 fps, then quarter frames.
  await page.getByTestId('mtc-chase').check();
  await send(page, [0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x60, 0, 10, 0, 0xf7]);
  await expect(timecode).toHaveText(/^00:00:1[01]:/);
  await expect(page.getByTestId('mtc-status')).toContainText('00:00:10:00');
  // Timecode goes quiet → the transport stops.
  await expect(page.getByTestId('transport-play')).toHaveAttribute('aria-label', 'Play', { timeout: 3000 });
});
