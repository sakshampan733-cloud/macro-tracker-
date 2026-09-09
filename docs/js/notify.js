/*
 * Notifications that iOS fires, not the app.
 *
 * reminders.js was written under a real constraint and says so at the top:
 * a web page cannot schedule anything for a moment it will not be running
 * at, so the honest version was to catch up when you next opened the app.
 * That constraint belonged to the browser, not to the idea, and the native
 * shell removes it — iOS will fire these with Basal closed and the phone
 * locked.
 *
 * Worth being clear about what this costs, because it is the part people
 * assume: nothing. Local notifications are scheduled on the device by the
 * device. No paid developer account, no push certificate, no server, and
 * nothing about your medication or your training leaves the phone. The
 * $99 account buys remote push, which would mean a backend holding your
 * schedule — the exact thing this app refuses to have.
 *
 * The rule everything here follows: a notification you would have ignored
 * should not have been sent. So every one of these is either a time the
 * person set themselves, or a condition the app can show actually went
 * unmet. Nothing fires "just because it is 9am".
 */

import { get, medications, dosesFor, doseKey, dayKey, sessionFor, totals } from './store.js';

let cached = null;
const plugin = () => {
  if (cached) return cached;
  const C = globalThis.Capacitor;
  if (!C?.isNativePlatform?.()) return null;
  cached = C.Plugins?.LocalNotifications
    || (typeof C.registerPlugin === 'function' ? C.registerPlugin('LocalNotifications') : null);
  return cached;
};

export const canNotify = () => !!(globalThis.Capacitor?.isNativePlatform?.() && plugin());

/*
 * Permission, asked once and only when asked for.
 *
 * Never on launch. A permission sheet somebody did not go looking for is
 * how you teach them to hit Don't Allow, and iOS only lets you ask once —
 * after a refusal the only route back is the Settings app, which nobody
 * takes. So this is called from the Notifications screen, by a person who
 * has just switched something on.
 */
export async function askForNotifications() {
  const p = plugin();
  if (!p) return { ok: false, error: 'not running in the app' };
  try {
    const r = await p.requestPermissions();
    return { ok: r.display === 'granted', display: r.display };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function notifyPermission() {
  const p = plugin();
  if (!p) return 'unavailable';
  try { return (await p.checkPermissions()).display; } catch { return 'unknown'; }
}

/*
 * Stable numeric ids.
 *
 * The plugin keys notifications by integer, and rescheduling depends on a
 * given reminder landing on the same id every time — otherwise cancelling
 * yesterday's 9pm dose leaves it pending forever and you accumulate
 * duplicates. So the id is derived from what the reminder *is* rather than
 * from when it was made.
 */
function idFor(tag) {
  let h = 2166136261;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  /* Positive, and clear of the small hand-assigned ids below. */
  return (Math.abs(h) % 2000000) + 1000;
}

const hhmm = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const hour = +m[1], minute = +m[2];
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
};

/* Today at hh:mm, or tomorrow if that moment has already gone. */
function nextAt(time, now = new Date()) {
  const t = hhmm(time);
  if (!t) return null;
  const d = new Date(now);
  d.setHours(t.hour, t.minute, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

function addMinutes(date, mins) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}

/*
 * Build the whole schedule from current state.
 *
 * Deliberately a full rebuild rather than a diff. The schedule is small —
 * a handful of entries — and a diff would have to reason about which of
 * yesterday's notifications are still wanted, which is exactly where this
 * kind of code rots into firing things nobody asked for.
 */
export function planned(now = new Date()) {
  const s = get();
  const set = s.settings || {};
  const out = [];
  const key = dayKey(now);

  /* ── Medication ────────────────────────────────────────────────────
   * One per prescription per scheduled time, repeating daily. The times
   * are the ones already entered against each medication — the screen has
   * always said "the app reminds you at them", which until now it did not.
   *
   * Wording is a statement that a dose is due, never an instruction to take
   * it. The schedule came from a prescriber; the app's job is to say the
   * moment arrived and record what happened.
   *
   * No clock time in the text. You are reading this because the time came —
   * repeating "the 21:00 dose" back at 21:00 is the notification explaining
   * its own trigger, which is the app's concern and not yours. The name of
   * the medication is the part you need.
   */
  if (set.medReminder) {
    const taken = dosesFor(key);
    for (const med of medications()) {
      for (const time of med.times || []) {
        if (!hhmm(time)) continue;
        const label = med.nickname || med.name || 'Medication';
        /* Already marked for today? Then today's has nothing to say — but
           it still needs scheduling for tomorrow, so push it a day on
           rather than dropping it. */
        const doneToday = !!taken[doseKey(med.id, time)];
        let at = nextAt(time, now);
        if (doneToday && at && at.toDateString() === now.toDateString()) {
          at = addMinutes(at, 24 * 60);
        }
        if (!at) continue;
        out.push({
          id: idFor('med:' + med.id + '@' + time),
          title: label,
          body: 'This dose is due.',
          at,
        });
      }
    }
  }

  /* ── Training ──────────────────────────────────────────────────────
   * Two moments, both from times the person set: one when the session was
   * meant to start, one when it was meant to have finished. The second is
   * the one that does the work — it is the only point at which "did you
   * train?" is a real question rather than a nag.
   */
  const trainAt = set.trainAt;
  const trainMins = Number(set.trainMins) > 0 ? Number(set.trainMins) : 60;
  if (set.workoutReminder && hhmm(trainAt)) {
    const trained = !!sessionFor(key);
    const start = nextAt(trainAt, now);

    /* Only nudge the start if today's session has not already happened. */
    if (start && !(trained && start.toDateString() === now.toDateString())) {
      out.push({
        id: idFor('train:go'),
        title: 'Training',
        body: 'Time to train.',
        at: start,
      });
    }

    const check = start ? addMinutes(start, trainMins) : null;
    if (check && !(trained && check.toDateString() === now.toDateString())) {
      out.push({
        id: idFor('train:check'),
        title: 'Did you train?',
        body: 'Nothing logged for today yet.',
        at: check,
      });
    }
  }

  /* ── Water ─────────────────────────────────────────────────────────
   * Conditional, and the condition is checked at the moment the schedule
   * is built — which is the moment the app was last open. That is sound
   * for this one: the only way to log water is in the app, so if it is
   * behind when the app closes, it is still behind when this fires.
   */
  if (set.waterReminder && hhmm(set.waterAt || '20:00')) {
    const target = s.targets?.waterMl || 0;
    const drunk = (() => { try { return totals(key).water || 0; } catch { return 0; } })();
    if (!target || drunk < target * 0.75) {
      const at = nextAt(set.waterAt || '20:00', now);
      if (at) out.push({
        id: idFor('water'),
        title: 'Water',
        body: target
          ? `${Math.round(drunk)} of ${Math.round(target)} ml logged today.`
          : 'Nothing logged today.',
        at,
      });
    }
  }

  return out;
}

/*
 * Push the plan onto iOS.
 *
 * Cancel-then-schedule, every time. Anything conditional that has since
 * been satisfied simply does not come back, which is how a logged glass of
 * water silently removes tonight's reminder instead of firing it anyway.
 */
export async function syncSchedule() {
  const p = plugin();
  if (!p) return { ok: false };
  const set = get().settings || {};
  if (!set.notifyOn) { await clearAll(); return { ok: true, off: true }; }

  try {
    if ((await p.checkPermissions()).display !== 'granted') return { ok: false, denied: true };
  } catch { return { ok: false }; }

  const list = planned();
  try {
    await clearAll();
    if (!list.length) return { ok: true, count: 0 };
    await p.schedule({
      notifications: list.map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.at, allowWhileIdle: true },
      })),
    });
    return { ok: true, count: list.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function clearAll() {
  const p = plugin();
  if (!p) return;
  try {
    const pend = await p.getPending();
    if (pend?.notifications?.length) await p.cancel({ notifications: pend.notifications });
  } catch { /* nothing pending, or the plugin is unhappy; either way move on */ }
}

/* What is actually queued, for the Notifications screen to show. Somebody
   who has switched things on deserves to see that something was scheduled,
   rather than trusting it and finding out at 9pm that it was not. */
export async function pendingList() {
  const p = plugin();
  if (!p) return [];
  try {
    const r = await p.getPending();
    return (r.notifications || []).map(n => ({ id: n.id, title: n.title, body: n.body }));
  } catch {
    return [];
  }
}

/*
 * Prove it, rather than asking somebody to wait until 9pm.
 *
 * "No notification arrived" has at least four causes that look identical
 * from the outside: permission never granted, the master switch off, no
 * times entered, or a genuine scheduling failure. Waiting for a real
 * reminder to find out which costs a day per attempt. This fires one
 * immediately and reports exactly what happened.
 */
export async function testNotification() {
  const p = plugin();
  if (!p) return { ok: false, why: 'Not running in the installed app.' };

  let perm = 'unknown';
  try { perm = (await p.checkPermissions()).display; } catch { /* below */ }
  if (perm !== 'granted') {
    return { ok: false, perm,
      why: perm === 'denied'
        ? 'iOS is blocking notifications for Basal. Open iOS Settings, find Basal, and switch Allow Notifications on.'
        : 'Notifications have not been allowed yet. Turn the switch above on first.' };
  }

  try {
    await p.schedule({
      notifications: [{
        id: 999,
        title: 'Basal',
        body: 'Notifications are working.',
        schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
      }],
    });
    return { ok: true, perm };
  } catch (e) {
    return { ok: false, perm, why: e.message || String(e) };
  }
}
