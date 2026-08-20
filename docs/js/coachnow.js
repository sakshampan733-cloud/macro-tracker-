/*
 * What to do now.
 *
 * Everything else in this app looks backwards — the check-in, the report,
 * the correlations. All of it tells you how a period went once the period
 * is over. This is the only part that speaks while there is still time to
 * act, which is the difference between a log and a coach.
 *
 * It deliberately says one thing at a time. A screen of six warnings gets
 * ignored wholesale; one specific, currently-true sentence gets read. So
 * every rule scores itself for urgency and only the sharpest one shows,
 * with the rest available underneath if you go looking.
 */

import { totals, byMeal, dayKey, peekDay } from './store.js';
import { dayFactor } from './whoop.js';
import { leucineByMeal } from './data/quality.js';
import { entryMacros } from './store.js';

const MEAL_LABELS = { breakfast: 'breakfast', lunch: 'lunch', snack: 'a snack', dinner: 'dinner' };

/* How far through the eating day it is, 0 to 1, from wake to last sensible
   meal. Used to judge whether intake is on pace rather than just low. */
function dayProgress(now, wakeHour) {
  const h = now.getHours() + now.getMinutes() / 60;
  const start = wakeHour ?? 7;
  const end = 21.5;
  if (h <= start) return 0;
  if (h >= end) return 1;
  return (h - start) / (end - start);
}

function wakeHourFor(store, key) {
  const w = store.whoop?.rows?.[key];
  if (w?.wakeHour != null) return w.wakeHour;
  const rows = Object.entries(store.whoop?.rows || {}).sort().slice(-14);
  const hrs = rows.map(([, r]) => r.wakeHour).filter(h => h != null);
  if (hrs.length >= 3) return hrs.reduce((a, b) => a + b, 0) / hrs.length;
  return null;
}

/*
 * Bedtime, estimated from your own sleep rather than assumed.
 * Eating close to sleep is the one timing rule with a real mechanism behind
 * it — not for fat gain, which total intake decides, but for sleep quality,
 * and your recovery is downstream of that.
 */
function bedtimeFor(store, key) {
  const rows = Object.entries(store.whoop?.rows || {}).sort().slice(-14);
  const wakes = rows.map(([, r]) => r.wakeHour).filter(h => h != null);
  const sleeps = rows.map(([, r]) => r.sleepH).filter(h => h != null);
  if (wakes.length < 3 || sleeps.length < 3) return null;
  const wake = wakes.reduce((a, b) => a + b, 0) / wakes.length;
  const dur = sleeps.reduce((a, b) => a + b, 0) / sleeps.length;
  let bed = wake - dur;
  if (bed < 0) bed += 24;
  return bed;
}

export function nowAdvice(store, targets, key = dayKey(), now = new Date()) {
  const t = totals(key);
  const day = peekDay(key);
  const groups = byMeal(key);
  const entries = Object.values(groups).flat();
  const h = now.getHours() + now.getMinutes() / 60;
  const wake = wakeHourFor(store, key);
  const bed = bedtimeFor(store, key);
  const progress = dayProgress(now, wake);

  const out = [];
  const add = (urgency, tone, headline, body) => out.push({ urgency, tone, headline, body });

  const left = {
    kcal: targets.kcal - t.kcal,
    p: targets.p - t.p,
    f: targets.f - t.f,
  };

  /* ── Whoop, first, because it reframes everything else ── */
  const w = store.whoop?.rows?.[key];
  if (w && w.recovery != null && h < 20) {
    if (w.recovery < 34) {
      add(72, 'warn', `Recovery is ${Math.round(w.recovery)}% today`,
        'Hold at maintenance rather than pushing the deficit. Under-eating on a red day is what turns one bad night into a bad week — the deficit will still be there tomorrow.');
    } else if (w.recovery >= 67 && h < 17) {
      add(30, 'good', `Recovery is ${Math.round(w.recovery)}%`,
        'Good day to train hard. Put most of the carbohydrate around the session rather than spreading it thin.');
    }
  }
  if (w && w.sleepH != null && w.sleepH < 6 && h < 15) {
    add(58, 'info', `${w.sleepH.toFixed(1)} h of sleep last night`,
      'Short sleep reliably raises appetite the next day. Expect the hunger rather than being surprised by it, and hold the line on protein first.');
  }

  /* ── Protein pace: the one that actually costs you if missed ── */
  if (targets.p > 0 && progress > 0.35 && progress < 0.98) {
    const expected = targets.p * progress;
    const behind = expected - t.p;
    if (behind > targets.p * 0.18) {
      const hoursLeft = Math.max(0.5, 21.5 - h);
      add(66, 'warn', `Protein is ${Math.round(behind)} g behind pace`,
        `You are at ${Math.round(t.p)} g of ${targets.p} g with about ${hoursLeft.toFixed(0)} hours of eating left. `
        + `Leaving it all to dinner rarely works — the body uses protein better spread out, and a big evening dose does not make up for a thin day.`);
    }
  }

  /* ── Calories nearly gone with meals still to come ── */
  if (left.kcal < targets.kcal * 0.18 && h < 19 && t.kcal > 0) {
    add(64, left.kcal < 0 ? 'warn' : 'info',
      left.kcal < 0 ? `${Math.abs(Math.round(left.kcal))} kcal over, and it is only ${fmtHour(h)}`
                    : `Only ${Math.round(left.kcal)} kcal left before dinner`,
      left.kcal < 0
        ? 'Not a disaster — one day decides nothing. But a light dinner keeps the week intact rather than the day.'
        : 'Make dinner protein and vegetables rather than another carbohydrate-heavy plate, and it still fits.');
  }

  /* ── Eating close to sleep ── */
  if (bed != null) {
    const hoursToBed = ((bed - h) + 24) % 24;
    if (hoursToBed < 1.5 && hoursToBed > 0 && left.kcal > 250) {
      add(48, 'info', `You usually sleep in about ${hoursToBed.toFixed(1)} h`,
        'A large meal this close to sleep tends to cost sleep quality, and your recovery score is downstream of that. Keep it light, or accept the trade knowingly.');
    }
  }

  /* ── Long gap without food ── */
  if (entries.length) {
    const lastTs = Math.max(...entries.map(e => e.ts));
    const gap = (now - lastTs) / 3600000;
    if (gap > 6 && h > 11 && h < 22) {
      add(40, 'info', `${gap.toFixed(0)} hours since you last ate`,
        'Nothing wrong with a long gap in itself, but it usually ends in a bigger meal than intended. Worth eating something with protein in it before that happens.');
    }
  } else if (h > 11) {
    add(52, 'info', 'Nothing logged yet today',
      'The log only works if it is complete — a half-logged day makes every average in the app lean optimistic.');
  }

  /* ── Fat running high early ── */
  if (targets.f > 0 && t.f > targets.f * 0.85 && progress < 0.7 && left.kcal > 0) {
    add(44, 'info', `Fat is at ${Math.round(t.f)} g of ${targets.f} g already`,
      'Fat is the densest of the three, so the rest of the day gets tight fast. Lean protein and vegetables from here keeps it workable.');
  }

  /* ── Leucine: meals that actually triggered muscle building ── */
  const leu = leucineByMeal(groups, entryMacros);
  const done = Object.entries(leu).filter(([m, v]) => v.protein > 5 && v.classified);
  const missed = done.filter(([, v]) => !v.hit);
  if (missed.length >= 2 && h > 16) {
    add(36, 'info', `${missed.length} meals today did not trigger muscle building`,
      'A meal needs roughly 2.5 g of leucine to switch protein synthesis on — about 25–30 g of animal protein, or a scoop of whey. Under that it feeds you but does not build.');
  }

  /* ── Water ── */
  if (targets.water > 0 && progress > 0.5) {
    const expected = targets.water * progress;
    if (t.water < expected * 0.6) {
      add(28, 'info', `Water is at ${(t.water / 1000).toFixed(1)} of ${(targets.water / 1000).toFixed(1)} L`,
        'Behind pace for this time of day.');
    }
  }

  /* ── Nothing wrong ── */
  if (!out.length) {
    if (t.kcal === 0) {
      add(10, 'good', 'Nothing logged yet', 'Log the first thing you eat and the rest of the day follows.');
    } else {
      add(10, 'good', 'On pace', `${Math.round(t.p)} g protein and ${Math.round(t.kcal)} kcal in. Nothing needs attention right now.`);
    }
  }

  out.sort((a, b) => b.urgency - a.urgency);
  return { primary: out[0], rest: out.slice(1, 4), all: out };
}

function fmtHour(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
