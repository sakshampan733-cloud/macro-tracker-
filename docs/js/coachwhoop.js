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
  const pool = frequentFoods(40);
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
 * Returns scored cards, highest urgency first. The caller shows as many
 * as it has room for — usually one.
 */
export function whoopAdvice(store, targets, key = dayKey(), now = new Date()) {
  const w = strainPicture(store, key);
  if (!w) return [];                       // no strap data: say nothing

  const t = totals(key);
  const tm = timing(key, now);
  const h = tm.hour;
  const out = [];
  const add = (urgency, tone, headline, body, action = null) =>
    out.push({ urgency, tone, headline, body, action, source: 'whoop' });

  const left = {
    kcal: Math.round((targets.kcal || 0) - (t.kcal || 0)),
    p: Math.round((targets.p || 0) - (t.p || 0)),
    c: Math.round((targets.c || 0) - (t.c || 0)),
  };

  /* ── a hard day, and the food to match it ── */
  if (w.ratio && w.ratio >= HARD) {
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
      add(60, 'good',
        `Hard day — ${w.burn} kcal burned`,
        `About ${extra} kcal above your average, and you have already eaten to the adjusted target. Nothing more needed.`);
    }
  }

  /* ── the post-session window ── */
  if (w.strainHigh && tm.sinceH != null && tm.sinceH > 1.5 && left.p > 20 && h > 8 && h < 22) {
    const picks = suggestFoods(left, { want: 'protein' });
    add(84, 'warn',
      'Strain is high and it has been a while since you ate',
      `${tm.sinceH.toFixed(1)} hours since your last entry on a day your body is working harder than usual. `
      + `${left.p} g of protein still to go — spreading it across the rest of the day beats a single large hit at dinner, `
      + `because muscle protein synthesis responds to each dose rather than to the daily total.`,
      picks.length ? { kind: 'foods', label: 'Protein you already eat', picks } : null);
  }

  /* ── recovery reframes the deficit ── */
  if (w.recovery != null && h < 20) {
    if (w.recovery < 34 && left.kcal > 200) {
      add(80, 'warn',
        `Recovery ${Math.round(w.recovery)}% — do not run a deficit today`,
        `Red recovery with ${left.kcal} kcal still available. Eat to maintenance and take the deficit tomorrow. `
        + `Under-eating on a red day is the reliable way to turn one poor night into a poor week.`,
        left.c > 40 ? { kind: 'foods', label: 'Carbohydrate helps here',
                        picks: suggestFoods(left, { want: 'carb' }) } : null);
    } else if (w.recovery >= 67 && h >= 6 && h < 16) {
      add(44, 'good',
        `Recovery ${Math.round(w.recovery)}% — good day to train`,
        `Put most of today's carbohydrate around the session rather than spreading it evenly. `
        + (left.c > 0 ? `You have ${left.c} g of carbohydrate left to place.` : ''));
    }
  }

  /* ── an easy day, spent as if it were hard ── */
  if (w.ratio && w.ratio <= EASY && left.kcal < -100) {
    add(66, 'warn',
      `Quiet day — ${w.burn} kcal against your usual ${w.meanBurn}`,
      `You burned about ${Math.abs(w.extra)} kcal less than average and are ${Math.abs(left.kcal)} kcal over the adjusted target. `
      + `One day does not matter; the pattern does, and rest days are where most surpluses are actually built.`);
  }

  /* ── short sleep changes what to reach for ── */
  if (w.sleepH != null && w.sleepH < 6 && h < 15 && left.kcal > 200) {
    add(52, 'warn',
      `${w.sleepH.toFixed(1)} h of sleep — appetite will lie to you today`,
      'Short sleep raises ghrelin and blunts leptin, so hunger runs ahead of need and reaches for fast carbohydrate. '
      + 'Anchor each meal on protein and the drift usually does not happen.',
      { kind: 'foods', label: 'Protein first today', picks: suggestFoods(left, { want: 'protein' }) });
  }

  return out.sort((a, b) => b.urgency - a.urgency);
}

/* The single most useful thing Whoop has to say right now, or nothing. */
export function topWhoopAdvice(store, targets, key = dayKey(), now = new Date()) {
  const all = whoopAdvice(store, targets, key, now);
  return all.length ? all[0] : null;
}
