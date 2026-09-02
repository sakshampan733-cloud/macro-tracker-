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

import { get, dayKey, shiftDay, doseLog, sessionFor, wasNotified, markNotified, peekDay } from './store.js';
import { rowsFor, healthSource, bandName } from './applehealth.js';

/*
 * "Already sent" is a fact about the day, not about this page.
 *
 * It used to be a Set here, wiped by every reload, so the same reminder
 * fired again on every launch. It lives in the store now — see
 * wasNotified / markNotified — and once a day means once a day.
 */

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
 * When a weigh-in would actually change something.
 *
 * The first attempt at this asked every morning, which is a nag rather
 * than a feature: somebody weighing daily does not need telling, and
 * somebody who is not gets the same message every day until they start
 * ignoring the app entirely.
 *
 * The useful question is not "has it been a day" but "is the absence of a
 * weight now costing something", and the app can answer that precisely,
 * because it knows what it is unable to compute without one. Maintenance
 * is back-calculated from weigh-ins and needs four in the window before it
 * will say anything at all; past that, each one narrows the ± it reports.
 * And the trend is a ten-day average, so a week's gap leaves it describing
 * a body from last week.
 *
 * So this fires on those thresholds and says which one was crossed. If you
 * weigh most days it never fires, which is correct — there is nothing to
 * tell you.
 */
export function weighInDue(now = new Date()) {
  const s = get();
  if (!s.profile) return null;
  if (s.settings?.weighReminder === false) return null;
  const key = dayKey();
  if (peekDay(key).weight) return null;
  if (s.settings?.weighAsked === key) return null;

  const days = Object.entries(s.days || {})
    .filter(([, d]) => d.weight > 0)
    .map(([date]) => date)
    .sort();
  const last = days[days.length - 1] || null;
  const since = last
    ? Math.round((new Date(key + 'T12:00:00') - new Date(last + 'T12:00:00')) / 86400000)
    : null;

  /* Weigh-ins inside the window maintenance is calculated over. */
  const from = shiftDay(key, -27);
  const inWindow = days.filter(d => d >= from).length;

  /* Never weighed. Nothing else in the app can start without this one. */
  if (!last) {
    return { reason: 'first', since: null, inWindow: 0,
      line: 'Your first weigh-in is what starts the trend and lets the app work out your '
          + 'real maintenance calories. Nothing else can be calculated without it.' };
  }

  /*
   * Days you logged food and the app could do nothing with them.
   *
   * This is the real cost, and it is the one worth naming. Intake on its
   * own says what you ate; it takes a weight to turn that into whether it
   * is working. Every logged day since the last weigh-in is a day of good
   * data the app is holding and cannot answer the question with — so the
   * count of those, not the calendar, is what should trigger asking.
   */
  const loggedSince = Object.entries(s.days || {})
    .filter(([d, day]) => d > last && d <= key && (day.entries || []).length >= 2)
    .length;

  if (loggedSince >= 5) {
    return { reason: 'unmatched', since, inWindow, loggedSince,
      line: `You have logged ${loggedSince} days of food since your last weigh-in. The app `
          + 'can say what you ate, but it takes a weight to say whether it is working — '
          + 'that is the whole comparison.' };
  }

  /* Not enough for a maintenance figure at all. */
  if (inWindow < 4 && since >= 2) {
    return { reason: 'short', since, inWindow,
      line: `Your maintenance figure needs four weigh-ins in a month and has ${inWindow}. `
          + `Last one was ${since} days ago — one more moves this along.` };
  }

  /* The trend is a ten-day average; a week without a reading makes it a
     description of last week. */
  if (since >= 7) {
    return { reason: 'stale', since, inWindow,
      line: `It has been ${since} days. Your trend weight is a ten-day average, so right `
          + 'now it is describing where you were rather than where you are.' };
  }

  /* Enough to compute, thin enough that the error bar is wider than it
     needs to be. Asked once at five days rather than every morning. */
  if (inWindow < 10 && since >= 5) {
    return { reason: 'thin', since, inWindow,
      line: `${inWindow} weigh-ins this month, and ${since} days since the last. Each one `
          + 'narrows the ± on your maintenance calories — this is the cheapest accuracy '
          + 'in the app.' };
  }

  return null;
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
     * Training, once a day at most, and never while you are looking at it.
     *
     * Fires on whichever comes first: the hour you said you train, or the
     * band reporting a hard day.
     *
     * A system alert about the screen already in front of you is the
     * definition of noise — the card on Home is saying it, and saying it
     * twice is worse than once. The check comes before the record, not
     * after: marking it sent while the app was open would mean the
     * notification never arrived once the app was backgrounded, which is
     * the only moment it is actually worth anything.
     */
    const stampW = `workout@${key}`;
    if (document.visibilityState !== 'visible' && !wasNotified(stampW)) {
      const seen = detectedWorkout(key);
      if (seen || workoutHourDue(now)) {
        markNotified(stampW);
        await show('Did you train today?',
          seen ? `${seen.band} recorded ${seen.what}. Tap to log it.`
               : 'Tap to log your session.',
          stampW);
      }
    }

    /*
     * A weigh-in, when one would change something.
     *
     * No notification for the "thin" case — a wider error bar is worth a
     * card on screen and not worth an alert. The two that genuinely stop
     * the app working get one.
     */
    const due = weighInDue(now);
    const stampWeigh = `weigh@${key}`;
    if (due && due.reason !== 'thin'
        && document.visibilityState !== 'visible' && !wasNotified(stampWeigh)) {
      markNotified(stampWeigh);
      await show('Worth weighing in', due.line, stampWeigh);
    }

    if (!get().medications?.length) return;

    for (const d of dueNow(key, now)) {
      const stamp = `${d.med.id}@${d.time}@${key}`;
      /* Same order, same reason. */
      if (document.visibilityState === 'visible') continue;
      if (wasNotified(stamp)) continue;
      markNotified(stamp);
      const name = d.med.nickname || d.med.name;
      await show(name, `${d.time}${d.med.mg ? ` · ${d.med.mg} ${d.med.unit}` : ''}`, stamp);
    }
  };

  tick();
  const id = setInterval(tick, 60 * 1000);

  /* Leaving the app is the moment worth checking now. Coming back is
     handled by the cards on screen, which say the same thing without a
     system alert on top of them. */
  const onWake = () => { if (document.visibilityState === 'hidden') tick(); };
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
