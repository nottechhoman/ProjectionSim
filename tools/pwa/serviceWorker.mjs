/**
 * v8: offline support for the installed web app.
 *
 * `serviceWorkerSource(version, precache)` returns the text of sw.js. The build plugin in
 * vite.config.ts calls it with the list of files Vite wrote, so the whole app (code, styles,
 * lens table, icons) works with no network after the first visit.
 *
 * Strategy:
 *  - Pages (navigations) and anything not fingerprinted: network first, so a phone with
 *    signal always gets the newest version; the cached copy is used only when offline.
 *  - Fingerprinted build files (assets/name-HASH.ext): cache first — their names change
 *    whenever their content does.
 *  - Old caches are deleted when a new version activates.
 */
export function serviceWorkerSource(version, precache) {
  return `/* Projection Simulator service worker — generated at build time. */
const CACHE = 'projsim-${version}';
const PRECACHE = ${JSON.stringify(['./', ...precache])};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('projsim-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const FINGERPRINTED = /\\/assets\\/[^/]+-[A-Za-z0-9_-]{8,}\\.[a-z0-9]+$/;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Range requests (video seeking) go straight to the network.
  if (req.headers.has('range')) return;

  if (FINGERPRINTED.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './' : req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: req.mode === 'navigate' })
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : undefined))
          .then((hit) => hit || Response.error()),
      ),
  );
});
`;
}
