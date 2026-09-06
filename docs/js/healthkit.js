/*
 * Apple Health, read directly.
 *
 * This is what the native shell was for. It replaces, entirely: the
 * Shortcut with its dozen hand-built blocks, the Cloudflare relay, the
 * shared key, the 11:50pm automation, the Sum-versus-Average confusion, and
 * the duplicate step counts from three devices writing the same walk. The
 * phone was always willing to hand these numbers over — a web page simply
 * had no way to ask.
 *
 * Deliberately thin. The merge, the provenance rules, the gaps-only
 * behaviour for somebody wearing a Whoop as well, the refusal to overwrite
 * a hand-typed weight — all of that already exists and is shared with the
 * relay path, so this file's whole job is to produce rows in the same shape
 * and hand them over. A second implementation of the merge is how the two
 * paths would quietly start disagreeing.
 */

import { get, commit } from './store.js';
import { absorbAppleRows, healthSource, existingSource } from './applehealth.js';

/*
 * Getting hold of the plugin.
 *
 * Capacitor.Plugins is the old accessor and only ever holds plugins that
 * registered themselves the old way. A plugin attached with
 * registerPluginInstance — which is the only route available to one written
 * inside the app — does not appear there at all. It has to be asked for by
 * name through registerPlugin, which returns a proxy that forwards to the
 * native side.
 *
 * Both are tried because the fallback costs nothing and the failure mode is
 * silent: the app decides Health is unavailable and quietly offers the
 * Shortcut instructions instead, which looks exactly like nothing having
 * been built at all.
 */
let cached = null;
const plugin = () => {
  if (cached) return cached;
  const C = globalThis.Capacitor;
  if (!C?.isNativePlatform?.()) return null;
  cached = C.Plugins?.BasalHealth
    || (typeof C.registerPlugin === 'function' ? C.registerPlugin('BasalHealth') : null);
  return cached;
};

/* Only in the native shell. On the web this is all absent and the relay
   path stays exactly as it was. */
export const canReadHealth = () => !!(globalThis.Capacitor?.isNativePlatform?.() && plugin());

export async function healthAvailable() {
  const p = plugin();
  if (!p) return false;
  try { return !!(await p.isAvailable()).available; } catch { return false; }
}

/*
 * Ask once, then read.
 *
 * iOS never reports what was granted for reads — deliberately, so that a
 * refusal looks identical to having no data and an app cannot work out what
 * you declined to share. So there is nothing to check afterwards and nothing
 * worth storing beyond "we have asked": whether it worked is answered by
 * reading and seeing what arrives.
 */
export async function askForHealth() {
  const p = plugin();
  if (!p) return { ok: false, error: 'not running in the app' };
  try {
    const r = await p.requestAuthorization();
    commit(s => { s.settings.healthAsked = true; }, 'settings');
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

const dayKeyFor = d => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

/*
 * The last few days, not just today.
 *
 * Today alone would be enough to draw the rings, and wrong for everything
 * underneath them: the adaptive maintenance figure reads a 28-day window,
 * and a phone that was off, offline or simply unopened for a week would
 * leave holes in it that never fill. Seven days of backfill costs nothing —
 * HealthKit is local — and means missing a few days is not permanent.
 */
export async function syncHealthKit({ days = 7 } = {}) {
  const p = plugin();
  if (!p) return { ok: false, error: 'not running in the app' };

  const mode = healthSource();
  const prior = existingSource(get());
  const gapsOnly = mode === 'both' || (mode == null && prior === 'whoop');

  const rows = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    try {
      const row = await p.readDay({ date: dayKeyFor(d) });
      /* A day with nothing but its own date is a day HealthKit had no
         readings for. Sending it on would write an empty row over whatever
         the relay or a manual entry had already put there. */
      if (row && Object.keys(row).length > 1) rows.push(row);
    } catch {
      /* One bad day should not abandon the other six. */
    }
  }

  if (!rows.length) {
    return { ok: true, days: 0,
      note: 'Apple Health has nothing yet. Wear the watch for a day, or check '
          + 'Settings → Health → Data Access & Devices → Basal.' };
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  const added = absorbAppleRows(rows, { gapsOnly });
  commit(s => { s.settings.healthPulledAt = Date.now(); }, 'settings');

  return { ok: true, days: added, gapsOnly, native: true,
           from: rows[0].date, to: rows[rows.length - 1].date };
}

/*
 * On launch, quietly.
 *
 * Hourly rather than on every draw: HealthKit is fast but not free, and the
 * numbers it returns change on the scale of a walk, not a tap. Never asks
 * for permission on its own — being shown a system permission sheet you did
 * not ask for is how people learn to hit Don't Allow.
 */
export async function autoSyncHealthKit() {
  if (!canReadHealth()) return false;
  const s = get();
  if (!s.settings?.healthAsked) return false;

  const last = s.settings.healthPulledAt || 0;
  if (Date.now() - last < 60 * 60 * 1000) return false;

  const r = await syncHealthKit({ days: 3 });
  return !!(r.ok && r.days);
}
