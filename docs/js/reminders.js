/*
 * Medication reminders.
 *
 * A web app cannot schedule a notification for a time it will not be
 * running at — there is no background scheduler on iOS, and pretending
 * otherwise would produce a reminder feature that silently does nothing.
 * So this does the two things that genuinely work:
 *
 *   1. While the app is open, it fires at the scheduled minute.
 *   2. When the app is opened at any point after a dose fell due and was
 *      not marked, it says so on the spot.
 *
 * The second is the one that carries the feature. People open a tracking
 * app several times a day, and "you have not marked the 9 pm one" at 9:40
 * is worth as much as a push at 9:00 — and unlike a push, it is honest
 * about what the platform can do.
 *
 * The tone throughout is a statement of fact: the dose was due, it is not
 * marked. Never an instruction to take it.
 */

import { get, dayKey, doseLog, sessionFor } from './store.js';
import { rowsFor, healthSource, bandName } from './applehealth.js';

const FIRED = new Set();          /* medId@time@day, to fire once per day */

export function permissionState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function askPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); }
  catch { return Notification.permission; }
}

async function show(title, body, tag) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, { body, tag, icon: './icon-192.png', badge: './icon-192.png' });
    } else {
      new Notification(title, { body, tag });
    }
    return true;
  } catch { return false; }
}


/*
 * A workout the band noticed, on a day with nothing logged.
 *
 * The fixed hour is a guess about when you usually finish. This is the
 * other half: your strap already knows the day was hard, and there is no
 * reason to wait for a clock when the evidence has arrived. Deliberately
 * conservative — a genuinely hard day, not a brisk walk — because an app
 * that asks "did you train?" after a long commute stops being asked back.
 */
export function detectedWorkout(key = dayKey()) {
  if (key !== dayKey()) return null;
  if (sessionFor(key)) return null;
  const s = get();
  if (s.settings?.workoutAsked === key) return null;
  const mode = healthSource();
  if (!mode) return null;
  const row = rowsFor(s, mode === 'apple' ? 'apple' : 'all')?.[key];
  if (!row) return null;

  const strain = row.strain, mins = row.exerciseMin;
  const bigStrain = strain != null && strain >= 10;
  const bigMins = mins != null && mins >= 20;
  if (!bigStrain && !bigMins) return null;
  /* Name only what actually crossed the line. Reporting "7 minutes of
     exercise and a strain of 15.4" reads as though seven minutes were the
     evidence, when the strain was doing all the work. */
  return {
    strain, minutes: mins,
    band: bandName(),
    what: [bigMins ? `${Math.round(mins)} minutes of exercise` : null,
           bigStrain ? `a day strain of ${strain.toFixed(1)}` : null]
          .filter(Boolean).join(' and '),
    source: mode === 'apple' ? 'apple' : 'whoop',
  };
}

/* Is the hour you said you train past, with nothing logged? */
export function workoutHourDue(now = new Date()) {
  const s = get();
  const at = s.settings?.workoutHour;
  if (at == null) return false;
  const key = dayKey();
  if (sessionFor(key) || s.settings?.workoutAsked === key) return false;
  return now.getHours() + now.getMinutes() / 60 >= at;
}

/*
 * Doses that fell due earlier today and are still unmarked. `graceMin`
 * keeps it quiet for the half hour after a dose time, which is the window
 * in which somebody is simply in the middle of taking it.
 */
export function overdueDoses(key = dayKey(), now = new Date(), graceMin = 30) {
  if (key !== dayKey()) return [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return doseLog(key).filter(d => {
    if (d.taken) return false;
    const [hh, mm] = d.time.split(':').map(Number);
    return nowMin > hh * 60 + mm + graceMin;
  });
}

/* Doses due within the next few minutes — the live case. */
function dueNow(key, now, windowMin = 1) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return doseLog(key).filter(d => {
    if (d.taken) return false;
    const [hh, mm] = d.time.split(':').map(Number);
    const due = hh * 60 + mm;
    return nowMin >= due && nowMin <= due + windowMin;
  });
}

/*
 * Start the ticker. Once a minute is cheap and is the only resolution that
 * makes "at 21:00" mean 21:00.
 */
export function startReminders() {
  if (typeof window === 'undefined') return () => {};

  const tick = async () => {
    const key = dayKey();
    const now = new Date();

    /*
     * Training, once a day at most.
     *
     * Fires on whichever comes first: the hour you said you train, or the
     * band reporting a hard day. Same honesty as the doses — while the app
     * is open, or the next time it is opened after the moment passed.
     */
    const stampW = `workout@${key}`;
    if (!FIRED.has(stampW)) {
      const seen = detectedWorkout(key);
      if (seen || workoutHourDue(now)) {
        FIRED.add(stampW);
        await show('Did you train today?',
          seen ? `${seen.band} recorded ${seen.what}. Tap to log it.`
               : 'Tap to log your session.',
          stampW);
      }
    }

    if (!get().medications?.length) return;

    for (const d of dueNow(key, now)) {
      const stamp = `${d.med.id}@${d.time}@${key}`;
      if (FIRED.has(stamp)) continue;
      FIRED.add(stamp);
      const name = d.med.nickname || d.med.name;
      await show(name, `${d.time}${d.med.mg ? ` · ${d.med.mg} ${d.med.unit}` : ''}`, stamp);
    }
  };

  tick();
  const id = setInterval(tick, 60 * 1000);

  /* Coming back to the app is the other moment worth checking: the tab may
     have been asleep across several dose times. */
  const onWake = () => { if (document.visibilityState === 'visible') tick(); };
  document.addEventListener('visibilitychange', onWake);

  return () => { clearInterval(id); document.removeEventListener('visibilitychange', onWake); };
}

/*
 * A line for the coach card, when something is outstanding. Phrased as an
 * observation — the app is reporting its own records, not prescribing.
 */
export function overdueNote(key = dayKey(), now = new Date()) {
  const late = overdueDoses(key, now);
  if (!late.length) return null;

  const names = late.map(d => `${d.med.nickname || d.med.name} at ${d.time}`);
  const list = names.length === 1 ? names[0]
    : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

  return {
    urgency: 70,
    tone: 'warn',
    source: 'meds',
    headline: late.length === 1 ? 'One dose unmarked' : `${late.length} doses unmarked`,
    body: `${list} ${names.length === 1 ? 'is' : 'are'} not marked as taken today. `
        + 'Tap the circle on the Medication tile if you have already taken it.',
  };
}
