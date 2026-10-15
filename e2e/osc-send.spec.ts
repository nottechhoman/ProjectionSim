import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';

const BRIDGE = 'ws://127.0.0.1:9100';
const SETTINGS_KEY = 'projectionlab-v4-control-v2';

interface Sent {
  type: string;
  address: string;
  args: unknown[];
  types: string;
  targets: string[];
}

/** Mock bridge: records what the app sends; never touches the real one. */
async function mockBridge(page: Page, opts: { refuse?: boolean } = {}) {
  const sent: Sent[] = [];
  let connections = 0;
  await page.routeWebSocket(BRIDGE, (ws: WebSocketRoute) => {
    connections += 1;
    if (opts.refuse) {
      ws.close({ code: 1006 });
      return;
    }
    ws.send(JSON.stringify({ type: 'hello', udpPort: 9000, wsPort: 9100 }));
    ws.onMessage((m) => {
      if (typeof m === 'string') sent.push(JSON.parse(m) as Sent);
    });
  });
  return { sent, connections: () => connections };
}

async function open(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [SETTINGS_KEY, JSON.stringify(settings)] as const,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __projectionLabStore?: unknown }).__projectionLabStore);
  await page.evaluate(() => {
    (window as unknown as { __projectionLabStore: { getState: () => { setControlPanelVisible: (v: boolean) => void } } }).__projectionLabStore
      .getState()
      .setControlPanelVisible(true);
  });
}

async function playAndStop(page: Page) {
  const timecode = page.getByTestId('transport-timecode');
  await page.getByTestId('transport-play').click();
  await expect.poll(async () => timecode.textContent(), { timeout: 10_000 }).not.toBe('00:00:00:00');
  await page.waitForTimeout(500);
  await page.getByTestId('transport-stop').click();
}

test('OSC send: off means no WebSocket traffic at all', async ({ page }) => {
  const bridge = await mockBridge(page);
  await open(page, { oscEnabled: false, oscSendEnabled: false });
  await playAndStop(page);
  expect(bridge.connections()).toBe(0);
  expect(bridge.sent).toEqual([]);
});

test('OSC send: receive on, send off sends nothing', async ({ page }) => {
  const bridge = await mockBridge(page);
  await open(page, { oscEnabled: true, oscSendEnabled: false });
  await expect(page.getByTestId('osc-status')).toContainText('Bridge connected');
  await playAndStop(page);
  expect(bridge.sent).toEqual([]);
});

test('OSC send: enable, add a target, play → /show/state "playing" in the log and on the wire', async ({ page }) => {
  const bridge = await mockBridge(page);
  await open(page, { oscEnabled: false, oscSendEnabled: false });
  await page.getByLabel('OSC target host').fill('127.0.0.1');
  await page.getByLabel('OSC target port').fill('53000');
  await page.getByTestId('osc-send-add').click();
  await expect(page.getByTestId('osc-send-target')).toHaveText(/127\.0\.0\.1:53000/);
  await page.getByTestId('osc-send-enabled').check();
  await expect(page.getByTestId('osc-send-status')).toContainText('Sending');
  // The full state goes out once on connect.
  await expect(page.getByTestId('osc-send-log')).toContainText('/show/state "stopped"');

  await page.getByTestId('transport-play').click();
  await expect(page.getByTestId('osc-send-log')).toContainText('/show/state "playing"');
  await expect(page.getByTestId('osc-send-time')).toContainText(/00:00:0\d:\d\d/);
  await page.getByTestId('transport-stop').click();
  await expect(page.getByTestId('osc-send-log').locator('li').first()).toContainText('/show/state "stopped"');

  const playing = bridge.sent.find((m) => m.address === '/show/state' && m.args[0] === 'playing');
  expect(playing).toEqual({ type: 'send', address: '/show/state', args: ['playing'], types: 's', targets: ['127.0.0.1:53000'] });
  const times = bridge.sent.filter((m) => m.address === '/show/time');
  expect(times.length).toBeGreaterThan(0);
  expect(times.every((m) => m.types === 'f')).toBe(true);
  // No duplicate state messages.
  const states = bridge.sent.filter((m) => m.address === '/show/state').map((m) => m.args[0]);
  expect(states).toEqual(['stopped', 'playing', 'stopped']);
});

test('OSC send: GO from the keyboard is acknowledged', async ({ page }) => {
  const bridge = await mockBridge(page);
  await open(page, { oscEnabled: false, oscSendEnabled: true, oscSendTargets: [{ id: 't', host: '127.0.0.1', port: 7000 }] });
  await page.evaluate(() => {
    (window as unknown as { __projectionLabStore: { getState: () => { addCue: (t: number, n?: string) => void } } }).__projectionLabStore.getState().addCue(2, 'Intro');
  });
  await expect(page.getByTestId('osc-send-status')).toContainText('Sending');
  await page.locator('canvas').first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('osc-send-log')).toContainText('/show/go/ack 1');
  expect(bridge.sent.some((m) => m.address === '/show/cue' && m.args[1] === 'Intro')).toBe(true);
  await page.getByTestId('transport-stop').click();
});

test('OSC send: a clear message when the bridge is not reachable', async ({ page }) => {
  await mockBridge(page, { refuse: true });
  await open(page, { oscEnabled: false, oscSendEnabled: true, oscSendTargets: [{ id: 't', host: '127.0.0.1', port: 7000 }] });
  await expect(page.getByTestId('osc-send-status')).toContainText('can’t reach the OSC bridge', { timeout: 10_000 });
  await expect(page.getByTestId('osc-send-status')).toContainText('npm run osc-bridge');
});
