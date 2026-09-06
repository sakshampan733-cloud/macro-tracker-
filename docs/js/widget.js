/*
 * Feeding the home screen widget.
 *
 * Only the numbers it shows, and only when they change. The widget lives in
 * a separate process with a few milliseconds of refresh budget, so handing
 * it the whole log to parse would be both slow and a needless copy of a
 * private record into a shared container. Nine integers cross; nothing else.
 *
 * Silent by design. A phone with no widget on the home screen, or a build
 * without the App Group provisioned, should behave exactly as if this file
 * did not exist — a person who never adds a widget must never see anything
 * about one.
 */

import { get, totals, dayKey } from './store.js';
import { dayTargets } from './views/today.js';

let bridge = null;
function plugin() {
  if (bridge) return bridge;
  const C = globalThis.Capacitor;
  if (!C?.isNativePlatform?.()) return null;
  bridge = C.Plugins?.WidgetBridge
    || (typeof C.registerPlugin === 'function' ? C.registerPlugin('WidgetBridge') : null);
  return bridge;
}

let lastSent = '';

export function publishWidget() {
  const p = plugin();
  if (!p) return;

  try {
    const s = get();
    if (!s.profile) return;

    const key = dayKey();
    const t = totals(key);
    const target = dayTargets(s, key);
    if (!target?.kcal) return;

    const payload = {
      left: Math.max(0, Math.round((target.kcal || 0) - (t.kcal || 0))),
      target: Math.round(target.kcal || 0),
      eaten: Math.round(t.kcal || 0),
      p: Math.round(t.p || 0), pT: Math.round(target.p || 0),
      c: Math.round(t.c || 0), cT: Math.round(target.c || 0),
      f: Math.round(t.f || 0), fT: Math.round(target.f || 0),
    };

    /* Reloading a widget timeline is not free, and the app draws far more
       often than these numbers move. */
    const sig = JSON.stringify(payload);
    if (sig === lastSent) return;
    lastSent = sig;

    p.publish(payload).catch(() => {});
  } catch {
    /* A widget is a nicety. It must never be able to break a draw. */
  }
}
