/*
 * Offline shell.
 *
 * The app must work in a kitchen with no signal, so everything except the
 * barcode proxy is cached on install and served cache-first. API calls go
 * to the network and fall back to whatever was cached last.
 */

const CACHE = 'basal-2026.08.29-steps';

const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js',
  'js/feedback.js',
  'js/boot.js',
  'js/theme.js',
  'js/swipe.js',
  'js/search.js',
  'js/views/planner.js',
  'js/pulltorefresh.js',
  'js/views/starbucks.js', 'js/data/starbucks.js',
  'js/views/restaurant.js', 'js/data/restaurants.js',
  'js/views/medication.js', 'js/data/medications.js',
  'js/views/labelscan.js', 'js/label.js', 'js/reminders.js',
  'js/views/sleep.js', 'js/data/caffeine.js',
  'js/views/apple.js',
  'js/applehealth.js',
  'js/views/guide.js', 'js/store.js', 'js/nutrition.js', 'js/whoop.js', 'js/coach.js',
  'js/off.js', 'js/scanner.js', 'js/ui.js', 'js/data/foods.js',
  'js/views/today.js', 'js/views/add.js', 'js/views/plan.js',
  'js/views/body.js', 'js/views/foods.js', 'js/views/setup.js', 'js/views/portion.js',
  'js/views/dish.js', 'js/views/pot.js', 'js/views/trust.js', 'js/views/meal.js', 'js/dishes.js',
  'js/views/nutrients.js', 'js/data/nutrients.js',
  'js/views/macro.js', 'js/data/quality.js', 'js/data/quality-map.js',
  'js/views/supplements.js', 'js/data/supplements.js',
  'js/views/blood.js', 'js/data/bloodwork.js', 'js/views/report.js', 'js/demo.js',
  'js/whooprelay.js', 'js/charts.js', 'js/coachnow.js', 'js/views/goal.js',
  'vendor/zxing.min.js',
  'fonts/ibm-plex-sans-400.woff2', 'fonts/ibm-plex-sans-500.woff2', 'fonts/ibm-plex-sans-600.woff2',
  'fonts/ibm-plex-sans-condensed-500.woff2', 'fonts/ibm-plex-sans-condensed-600.woff2',
  'fonts/ibm-plex-sans-condensed-700.woff2',
  'fonts/ibm-plex-mono-400.woff2', 'fonts/ibm-plex-mono-500.woff2', 'fonts/ibm-plex-mono-600.woff2',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Fonts, icons and the vendored decoder never change. Everything else is
   app code you may well edit tonight, so it goes to the network first and
   falls back to cache only when there isn't one. */
const IMMUTABLE = /\/(fonts|icons|vendor)\//;

/* The page asks which build this worker is serving, so a mixed set of
   modules can be detected before it crashes on a missing export. */
self.addEventListener('message', e => {
  if (e.data === 'version') {
    e.source && e.source.postMessage({ type: 'sw-version', cache: CACHE });
  }
  if (e.data === 'skip-waiting') self.skipWaiting();
});

const VERSION_QUERY = 1;

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (url.pathname.startsWith('/api/product/') && r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return r;
        })
        .catch(() => caches.match(e.request).then(r => r || new Response(
          JSON.stringify({ found: false, offline: true }),
          { headers: { 'Content-Type': 'application/json' } })))
    );
    return;
  }

  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }))
    );
    return;
  }

  /*
   * App code, network-first — and forced to revalidate.
   *
   * GitHub Pages serves assets with max-age=600, so a plain fetch can hand
   * back a ten-minute-old module from the browser's own HTTP cache even
   * though this looks like it went to the network. `cache: 'no-cache'`
   * makes it a conditional request: a 304 when nothing changed, the new
   * file the moment it does. Cheap, and it means a push actually reaches
   * the phone.
   */
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => {
        if (r.ok && url.origin === location.origin) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html')))
  );
});
