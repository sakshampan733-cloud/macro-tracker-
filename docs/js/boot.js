/*
 * Boot guard.
 *
 * A service worker can end up serving a fresh app.js beside a stale
 * store.js — network-first still falls back to cache on any hiccup, and a
 * half-updated module graph fails hard on the first missing export. From
 * the outside that looks exactly like "the fix you shipped does not work",
 * which is the worst possible failure because it is invisible and blames
 * the wrong thing.
 *
 * Two defences, both of which must be cheap enough to run on every boot:
 * compare the worker's cache name against this build before anything
 * loads, and catch a module-resolution failure as a last resort. Either
 * one recovers by clearing caches and reloading exactly once — the
 * once-only guard matters, because a genuine syntax error would otherwise
 * put the app in a reload loop.
 */

const RELOAD_FLAG = 'basal.recovering';

export async function recover(reason) {
  if (sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.removeItem(RELOAD_FLAG);
    console.error('Basal: recovery already attempted, not looping.', reason);
    return false;
  }
  sessionStorage.setItem(RELOAD_FLAG, '1');
  console.warn('Basal: stale build detected (' + reason + '), clearing and reloading.');
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  } catch { /* clearing is best-effort; the reload is the part that matters */ }
  location.reload();
  return true;
}

export function guard(version) {
  /* A module that fails to resolve never runs, so the only place left to
     notice is the window. */
  addEventListener('error', e => {
    const m = String(e.message || '');
    if (/does not provide an export|Importing a module script failed|Failed to fetch dynamically imported/.test(m)) {
      recover('module mismatch');
    }
  });

  if (!navigator.serviceWorker) return;
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'sw-version') {
      const serving = String(e.data.cache || '').replace(/^basal-/, '');
      if (serving && serving !== version) recover('cache ' + serving + ' vs build ' + version);
      else sessionStorage.removeItem(RELOAD_FLAG);
    }
  });
  navigator.serviceWorker.ready.then(reg => {
    (reg.active || navigator.serviceWorker.controller)?.postMessage('version');
  }).catch(() => {});
}
