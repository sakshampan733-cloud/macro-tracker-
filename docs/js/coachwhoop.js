/*
 * What Whoop should be telling you about food.
 *
 * The strap already knows the two things that matter most for what you
 * eat next: how hard today actually was, and how well you recovered from
 * yesterday. Until now that only moved the daily calorie target quietly
 * in the background — the number changed and nothing said why.
 *
 * Everything here refuses to speak unless Whoop has actually said
 * something. No strap data, no advice: a fabricated "you trained hard
 * today" on a rest day would destroy the credibility of every true one.
 *
 * Note on strain: Whoop's day strain is cumulative and logarithmic, so a
 * mid-afternoon reading is not a finished day. It is compared against
 * your own recent average at the same hour rather than against a fixed
 * threshold, because a 14 is enormous for one person and a Tuesday for
 * another.
 */

import { dayKey, peekDay, totals, byMeal, entryMacros, frequentFoods, get } from './store.js';
import { BY_ID, dietAllows } from './data/foods.js';

const HARD = 1.18;      // today's burn against your own average
const EASY = 0.92;

/* ── Reading the day ─────────────────────────────────────────────────── */

function strainPicture(store, key) {
  const rows = store.whoop?.rows || {};
  const today = rows[key];
  if (!today) return null;

  const past = Object.entries(rows).sort()
    .filter(([d]) => d < key)
    .slice(-28)
    .map(([, r]) => r);

  const burns = past.map(r => r.kcal).filter(v => v > 0);
  const strains = past.map(r => r.strain).filter(v => v > 0);
  if (burns.length < 7) return null;

  const meanBurn = burns.reduce((a, b) => a + b, 0) / burns.length;
  const meanStrain = strains.length >= 7
    ? strains.reduce((a, b) => a + b, 0) / strains.length : null;

  const burn = today.kcal > 0 ? today.kcal : null;
  const ratio = burn && meanBurn ? burn / meanBurn : null;

  return {
    burn, meanBurn: Math.round(meanBurn), ratio,
    strain: today.strain ?? null,
    meanStrain,
    strainHigh: meanStrain != null && today.strain != null && today.strain > meanStrain * 1.15,
    recovery: today.recovery ?? null,
    sleepH: today.sleepH ?? null,
    extra: ratio ? Math.round((ratio - 1) * meanBurn) : null,
  };
}

/*
 * When did you last eat, and how long is left in the day.
 * Used for "now" rather than "today", which is the whole point.
 */
function timing(key, now) {
  const day = peekDay(key);
  const entries = (day?.entries || []).filter(e => e.ts);
  const last = entries.length ? Math.max(...entries.map(e => e.ts)) : null;
  const sinceH = last ? (now.getTime() - last) / 3600000 : null;
  return { lastAt: last, sinceH, hour: now.getHours() + now.getMinutes() / 60 };
}

/* ── Picking something to actually eat ───────────────────────────────── */

/*
 * A recommendation you cannot act on is just a lecture. This scores the
 * foods you already eat against the gap that is left, so the suggestion
 * is always something in your kitchen rather than a generic "have some
 * lean protein".
 */
export function suggestFoods(gap, { want = 'protein', limit = 3 } = {}) {
  /* Suggestions come from what you already eat, but somebody who has just
     switched to vegetarian does not want last month's chicken offered
     back to them. */
  const diet = get().settings?.diet;
  const pool = frequentFoods(40).filter(f => {
    const ref = BY_ID[String(f.ref || f.id || '').replace(/^off:|^my:|^dish:/, '')];
    return !ref || dietAllows(ref, diet);
  });
  if (!pool.length) return [];

  const scored = pool.map(f => {
    const per = f.per100 || {};
    const kcal = per.kcal || 1;
    const pDens = (per.p || 0) * 4 / kcal;      // share of energy from protein
    const cDens = (per.c || 0) * 4 / kcal;
    let score;
    if (want === 'protein') score = pDens * 2 - (per.f || 0) / 100;
    else if (want === 'carb') score = cDens * 2 - (per.f || 0) / 100;
    else score = pDens + cDens;

    /* Nothing that would blow the remaining calories on its own. */
    const typical = f.grams || 100;
    const wouldCost = (kcal * typical) / 100;
    if (gap.kcal > 0 && wouldCost > gap.kcal * 1.35) score -= 1.2;

    return { food: f, score, wouldCost: Math.round(wouldCost), typical: Math.round(typical) };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ── The advice ──────────────────────────────────────────────────────── */

/*
 * Where you are in your own day.
 *
 * Clock time is nearly useless on its own — 8am is two hours into the day
 * for one person and pre-dawn for another, and the same person differs by
 * two hours between a Tuesday and a Sunday. Whoop knows when you actually
 * woke, so everything here is measured from that instead.
 */
function dayShape(store, key, now) {
  const rows = store.whoop?.rows || {};
  const today = rows[key];

  /* A hand-set schedule is the fallback for anyone without a strap. It is
     a worse measurement than a watch and a far better one than none — and
     without it every wake-relative rule below simply never fires, which is
     how the coach ended up silent for people wearing nothing. */
  const sched = store.settings?.sleepGoal;
  const wakeHour = today?.wakeHour ?? (() => {
    const past = Object.entries(rows).sort().slice(-14)
      .map(([, r]) => r.wakeHour).filter(h => h != null);
    if (past.length >= 3) return past.reduce((a, b) => a + b, 0) / past.length;
    return sched?.wake ?? null;
  })();

  /* Their own bedtime, not a rule of thumb: wake hour minus however long
     they actually slept, averaged over the fortnight. */
  const sleeps = Object.entries(rows).sort().slice(-14)
    .map(([, r]) => r.sleepH).filter(v => v > 0);
  const typicalSleep = sleeps.length
    ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length
    : (sched ? ((sched.wake - sched.bed) + 24) % 24 : 7.5);

  const hour = now.getHours() + now.getMinutes() / 60;
  const awake = wakeHour == null ? null
    : (hour >= wakeHour ? hour - wakeHour : hour + 24 - wakeHour);

  /* Bed is a wake time away from tomorrow, minus a night's sleep. */
  const bedHour = wakeHour == null ? null : (wakeHour + 24 - typicalSleep) % 24;
  const toBed = bedHour == null ? null
    : (bedHour >= hour ? bedHour - hour : bedHour + 24 - hour);

  return { hour, wakeHour, awake, bedHour, toBed, typicalSleep };
}

function fmtClock(h) {
  if (h == null) return '';
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

/*
 * Returns scored cards, highest urgency first. The caller shows as many
 * as it has room for — usually one.
 */
export function whoopAdvice(store, targets, key = dayKey(), now = new Date()) {
  const w = strainPicture(store, key);
  const row = store.whoop?.rows?.[key];
  /* A schedule is enough to reason about the clock, even with no strap:
     the wake-relative rules only need to know when the day started. */
  if (!w && !row && !store.settings?.sleepGoal) return [];

  const t = totals(key);
  const tm = timing(key, now);
  const d = dayShape(store, key, now);
  const out = [];
  const add = (urgency, tone, headline, body, action = null) =>
    out.push({ urgency, tone, headline, body, action, source: 'whoop' });

  const left = {
    kcal: Math.round((targets.kcal || 0) - (t.kcal || 0)),
    p: Math.round((targets.p || 0) - (t.p || 0)),
    c: Math.round((targets.c || 0) - (t.c || 0)),
  };
  const ate = (t.kcal || 0) > 50;

  /* ── you have just woken up ───────────────────────────────────────── */
  if (d.awake != null && d.awake < 2 && !ate) {
    const rec = row?.recovery;
    const slept = row?.sleepH;
    const bits = [];
    if (slept != null) bits.push(`${slept.toFixed(1)} h of sleep`);
    if (rec != null) bits.push(`${Math.round(rec)}% recovery`);

    add(94, rec != null && rec < 34 ? 'warn' : 'good',
      `Awake since ${fmtClock(d.wakeHour)}`,
      (bits.length ? bits.join(', ') + '. ' : '')
      + (rec != null && rec < 34
        ? 'On a red morning the first meal matters more than usual — protein and carbohydrate together, and do not skip it to save calories.'
        : 'Something with protein in the next hour or so sets up the rest of the day; the longer the first meal is delayed the harder the evening gets.'),
      { kind: 'foods', label: 'Quick first meal', picks: suggestFoods(left, { want: 'protein' }) });
  }

  /* ── a hard session, and the food to match it ─────────────────────── */
  if (w && w.ratio && w.ratio >= HARD) {
    const extra = w.extra;
    if (left.kcal > 120) {
      const picks = suggestFoods(left, { want: left.p > 25 ? 'protein' : 'carb' });
      add(88, 'good',
        `Hard day — ${w.burn} kcal burned against your usual ${w.meanBurn}`,
        `That is about ${extra} kcal above an average day, and your target has already moved up to match. `
        + `You have ${left.kcal} kcal left`
        + (left.p > 15 ? ` and ${left.p} g of protein still to find` : '')
        + `. Eat it rather than banking it — training hard and then under-eating is how a good session turns into a bad week.`,
        picks.length ? { kind: 'foods', label: 'Good options right now', picks } : null);
    } else {
      add(60, 'good', `Hard day — ${w.burn} kcal burned`,
        `About ${extra} kcal above your average, and you have already eaten to the adjusted target. Nothing more needed.`);
    }
  }

  /* ── the post-session window ──────────────────────────────────────── */
  if (w && w.strainHigh && tm.sinceH != null && tm.sinceH > 1.5 && left.p > 20
      && d.awake != null && d.awake > 1) {
    const picks = suggestFoods(left, { want: 'protein' });
    add(84, 'warn',
      'Strain is high and it has been a while since you ate',
      `${tm.sinceH.toFixed(1)} hours since your last entry on a day your body is working harder than usual. `
      + `${left.p} g of protein still to go — spreading it across the rest of the day beats a single large hit at dinner, `
      + `because muscle protein synthesis responds to each dose rather than to the daily total.`,
      picks.length ? { kind: 'foods', label: 'Protein you already eat', picks } : null);
  }

  /* ── recovery reframes the deficit ────────────────────────────────── */
  if (row?.recovery != null && d.toBed != null && d.toBed > 4) {
    if (row.recovery < 34 && left.kcal > 200) {
      add(80, 'warn',
        `Recovery ${Math.round(row.recovery)}% — do not run a deficit today`,
        `Red recovery with ${left.kcal} kcal still available. Eat to maintenance and take the deficit tomorrow. `
        + `Under-eating on a red day is the reliable way to turn one poor night into a poor week.`,
        left.c > 40 ? { kind: 'foods', label: 'Carbohydrate helps here',
                        picks: suggestFoods(left, { want: 'carb' }) } : null);
    } else if (row.recovery >= 67 && d.awake != null && d.awake < 8) {
      add(44, 'good',
        `Recovery ${Math.round(row.recovery)}% — good day to train`,
        `Put most of today's carbohydrate around the session rather than spreading it evenly. `
        + (left.c > 0 ? `You have ${left.c} g of carbohydrate left to place.` : ''));
    }
  }

  /* ── water, paced against how long you have been up ───────────────── */
  if (targets.water > 0 && d.awake != null && d.awake > 2) {
    /* Spread across waking hours rather than the clock: someone up at
       five is four hours further into their day at nine than someone who
       woke at nine, and the same glass count means different things. */
    const wakingHours = Math.max(8, 24 - d.typicalSleep);
    const expected = targets.water * Math.min(1, d.awake / wakingHours);
    const behind = expected - (t.water || 0);
    if (behind > 500) {
      add(58, 'info',
        `Water is ${(behind / 1000).toFixed(1)} L behind`,
        `${d.awake.toFixed(0)} hours awake and ${((t.water || 0) / 1000).toFixed(1)} L in, against `
        + `${(targets.water / 1000).toFixed(1)} L for the day. Catching up in one go mostly leaves the body; `
        + `spread it across the afternoon instead.`);
    }
  }

  /* ── the evening is running out ───────────────────────────────────── */
  if (d.toBed != null && d.toBed < 3.5 && d.toBed > 0) {
    if (left.p > 25) {
      add(76, 'warn',
        `About ${d.toBed.toFixed(1)} h before you normally sleep`,
        `${left.p} g of protein still to find and not much evening left. A slower protein now — dairy, `
        + `casein, eggs — is the one that is still being used while you sleep.`,
        { kind: 'foods', label: 'Something slow', picks: suggestFoods(left, { want: 'protein' }) });
    } else if (d.toBed < 1.5 && ate) {
      add(50, 'info',
        `Bed in about ${d.toBed.toFixed(1)} h`,
        `Eating close to sleep costs you sleep quality more than it costs you fat — Whoop usually sees it as `
        + `a lower recovery the next morning rather than as anything on the scale.`);
    }
  }

  /* ── an easy day, spent as if it were hard ────────────────────────── */
  if (w && w.ratio && w.ratio <= EASY && left.kcal < -100) {
    add(66, 'warn',
      `Quiet day — ${w.burn} kcal against your usual ${w.meanBurn}`,
      `You burned about ${Math.abs(w.extra)} kcal less than average and are ${Math.abs(left.kcal)} kcal over the adjusted target. `
      + `One day does not matter; the pattern does, and rest days are where most surpluses are actually built.`);
  }

  /* ── short sleep changes what to reach for ────────────────────────── */
  if (row?.sleepH != null && row.sleepH < 6 && d.awake != null && d.awake < 10 && left.kcal > 200) {
    add(52, 'warn',
      `${row.sleepH.toFixed(1)} h of sleep — appetite will lie to you today`,
      'Short sleep raises ghrelin and blunts leptin, so hunger runs ahead of need and reaches for fast carbohydrate. '
      + 'Anchor each meal on protein and the drift usually does not happen.',
      { kind: 'foods', label: 'Protein first today', picks: suggestFoods(left, { want: 'protein' }) });
  }

  /*
   * Nothing at all yet.
   *
   * The gap rule below measures from your last meal, so a day with no
   * meals had nothing to measure from and said nothing — silent on
   * precisely the day most worth speaking up about. This measures from
   * waking instead.
   */
  if (!ate && d.awake != null && d.awake >= 5 && d.toBed != null && d.toBed > 1) {
    add(82, 'warn',
      `${d.awake.toFixed(0)} hours awake, nothing logged`,
      `Either today has not been logged or it has not been eaten. If it is the second, `
      + `${left.kcal} kcal in the ${d.toBed.toFixed(0)} hours before bed is a lot to ask of one evening, `
      + `and it is usually the protein target that gives way.`,
      { kind: 'foods', label: 'Something now', picks: suggestFoods(left, { want: 'protein' }) });
  }

  /* ── a long gap, regardless of strain ─────────────────────────────── */
  if (tm.sinceH != null && tm.sinceH > 5 && d.awake != null && d.awake > 3
      && d.toBed != null && d.toBed > 2 && left.kcal > 300) {
    add(46, 'info',
      `${tm.sinceH.toFixed(0)} hours since you last ate`,
      `${left.kcal} kcal still to go and the day is shortening. Long gaps are not harmful in themselves, `
      + `but they tend to be repaid in one large evening meal, which is where the protein target usually gets missed.`);
  }

  return out.sort((a, b) => b.urgency - a.urgency);
}

/* The single most useful thing Whoop has to say right now, or nothing. */
export function topWhoopAdvice(store, targets, key = dayKey(), now = new Date()) {
  const all = whoopAdvice(store, targets, key, now);
  return all.length ? all[0] : null;
}
