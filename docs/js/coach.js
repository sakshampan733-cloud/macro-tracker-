/*
 * What to eat next.
 *
 * Not a diet plan. It takes what's left of today's targets, the meal you're
 * actually in, and how hard your body worked, then proposes combinations
 * from foods you already eat. Your own library outranks the reference
 * database, because a specific eater wants their own food back.
 */

import { get, MEALS, macrosFor, frequentFoods, dayKey } from './store.js';
import { FOODS } from './data/foods.js';
import { remaining } from './nutrition.js';

/* Protein is capped per sitting because absorption and satiety both flatten
   out; the rest is spread across the meals you have left. */
const MEAL_SHARE = {
  breakfast: 0.25,
  lunch:     0.35,
  snack:     0.12,
  dinner:    0.28,
};

const MEAL_WINDOWS = {
  breakfast: [6, 11],
  lunch:     [11, 16],
  snack:     [16, 18.5],
  dinner:    [18.5, 23],
};

export function currentMeal(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  for (const m of MEALS) {
    const [a, b] = MEAL_WINDOWS[m];
    if (h >= a && h < b) return m;
  }
  return h < 6 ? 'breakfast' : 'dinner';
}

export function mealsLeft(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  return MEALS.filter(m => MEAL_WINDOWS[m][1] > h);
}

/*
 * The budget for the meal in front of you.
 *
 * Splitting what's left evenly across remaining meals is wrong late in the
 * day — at 9pm with one meal to go, that meal gets all of it. So the share
 * is renormalised over the meals that are actually still ahead.
 */
export function mealBudget(targets, totals, now = new Date()) {
  const left = remaining(targets, totals);
  const ahead = mealsLeft(now);

  // Past the last meal window — late at night. Everything still owed for the
  // day belongs to this sitting, so the budget is simply what is left.
  // (This branch previously omitted `left`, which crashed the Plan screen
  // after 23:00 and at no other time.)
  if (!ahead.length) {
    return { meal: 'dinner', budget: left, left, share: 1, ahead: [] };
  }

  const meal = currentMeal(now);
  const totalShare = ahead.reduce((a, m) => a + MEAL_SHARE[m], 0);
  const share = (MEAL_SHARE[meal] || MEAL_SHARE.dinner) / totalShare;

  const budget = {};
  for (const k of ['kcal', 'p', 'c', 'f', 'fib']) {
    budget[k] = Math.max(0, Math.round(left[k] * share));
  }
  return { meal, budget, share, ahead, left };
}

/* ── Candidate pool ─────────────────────────────────────────────────── */

function candidates(store) {
  const pool = [];
  const seen = new Set();

  const push = (f, weight, origin) => {
    const key = f.ref || f.id || f.n || f.name;
    if (seen.has(key)) return;
    seen.add(key);
    const per100 = f.per100;
    if (!per100 || !per100.kcal) return;
    const label = typeof f.n === 'string' ? f.n : f.name;
    if (!label) return;
    const serv = (f.serv && f.serv.length) ? f.serv : [['100 g', 100]];
    pool.push({
      id: f.id || f.ref || key,
      name: label,
      brand: f.brand || '',
      per100,
      grade: f.grade || 'C',
      grp: f.grp || '',
      diet: f.diet || 'veg',
      serv: serv.map(s => Array.isArray(s) ? { l: s[0], g: s[1] } : s),
      weight, origin,
    });
  };

  frequentFoods(40).forEach(f => push(f, 1.6, 'often'));
  Object.values(store.library).forEach(f => push(f, 1.4, 'yours'));
  FOODS.forEach(f => push(f, 1.0, 'reference'));
  return pool;
}

const DIET_OK = {
  all:   () => true,
  egg:   d => d !== 'meat',
  veg:   d => d === 'veg',
};

/* ── Scoring ────────────────────────────────────────────────────────── */

/*
 * How well does this portion fit what's left? Protein is weighted hardest
 * because it's the macro people actually miss; overshooting calories is
 * penalised much harder than undershooting, since you can always add.
 */
function fitScore(macros, budget) {
  const w = { p: 3.0, kcal: 1.0, f: 0.7, c: 0.5, fib: 0.4 };
  let score = 0;
  for (const k in w) {
    const target = budget[k] || 0;
    if (target <= 0) {
      score -= (macros[k] || 0) * w[k] * 0.004;
      continue;
    }
    const ratio = (macros[k] || 0) / target;
    const err = ratio <= 1 ? (1 - ratio) : (ratio - 1) * 2.4;
    score -= err * w[k];
  }
  return score;
}

/*
 * Plausible amounts of one food.
 *
 * Small units need larger multiples to be worth suggesting — nobody plans a
 * meal around one 15 g cube of paneer — while a 200 g plate does not need
 * doubling. Anything under 25 kcal is dropped: it cannot move a meal.
 */
function portionsOf(food) {
  const out = [];
  for (const s of food.serv.slice(0, 3)) {
    const mults = s.g < 25 ? [2, 4, 8] : s.g < 60 ? [1, 2, 3] : s.g < 160 ? [1, 1.5, 2] : [0.5, 1];
    for (const mult of mults) {
      const g = Math.round(s.g * mult);
      if (g > 700 || g < 5) continue;
      const macros = macrosFor(food.per100, g);
      if (macros.kcal < 25) continue;
      out.push({
        g,
        label: mult === 1 ? s.l : `${mult} × ${s.l}`,
        macros,
      });
    }
  }
  return out;
}

/*
 * Build meals by pairing a protein anchor with a complement, which is how
 * people actually eat and how you reliably hit a protein number. Singles
 * are offered too, for when there's only a small gap left.
 */
export function suggest(store, targets, totals, now = new Date(), opts = {}) {
  const { budget, meal, left, share, ahead } = mealBudget(targets, totals, now);
  const dietOk = DIET_OK[store.settings?.diet || 'all'] || DIET_OK.all;
  const pool = candidates(store).filter(f => dietOk(f.diet));

  if (budget.kcal < 60) {
    return { meal, budget, left, share, ahead, ideas: [],
             note: "You're within your numbers for now. Nothing needed." };
  }

  const scored = [];
  const proteinDense = pool
    .filter(f => f.per100.p >= 8 && f.per100.p * 4 / Math.max(1, f.per100.kcal) > 0.22)
    .slice(0, 60);
  const others = pool.slice(0, 90);

  // Single items.
  for (const f of others) {
    for (const p of portionsOf(f)) {
      if (p.macros.kcal > budget.kcal * 1.25) continue;
      scored.push({
        items: [{ food: f, ...p }],
        macros: p.macros,
        score: fitScore(p.macros, budget) + 0.10 * f.weight,
      });
    }
  }

  // Anchor plus complement.
  for (const a of proteinDense) {
    const aPortions = portionsOf(a).slice(0, 3);
    for (const ap of aPortions) {
      if (ap.macros.kcal > budget.kcal) continue;
      const restBudget = {};
      for (const k in budget) restBudget[k] = Math.max(0, budget[k] - (ap.macros[k] || 0));
      if (restBudget.kcal < 50) continue;

      for (const b of others) {
        if (b.id === a.id) continue;
        for (const bp of portionsOf(b).slice(0, 2)) {
          const total = {};
          for (const k of ['kcal', 'p', 'c', 'f', 'fib', 'sug', 'na']) {
            total[k] = (ap.macros[k] || 0) + (bp.macros[k] || 0);
          }
          if (total.kcal > budget.kcal * 1.2) continue;
          scored.push({
            items: [{ food: a, ...ap }, { food: b, ...bp }],
            macros: total,
            score: fitScore(total, budget) + 0.10 * (a.weight + b.weight) + 0.25,
          });
        }
      }
    }
  }

  scored.sort((x, y) => y.score - x.score);

  // Keep the list varied — five near-identical rice portions help nobody.
  const ideas = [];
  const used = new Set();
  for (const s of scored) {
    const sig = s.items.map(i => i.food.id).sort().join('|');
    const anchor = s.items[0].food.id;
    if (used.has(sig)) continue;
    if ([...used].filter(u => u.includes(anchor)).length >= 2) continue;
    used.add(sig);
    ideas.push(s);
    if (ideas.length >= (opts.limit || 6)) break;
  }

  return { meal, budget, left, share, ahead, ideas, note: null };
}

/* ── Timing ─────────────────────────────────────────────────────────── */

/*
 * A schedule built from when you actually woke up, not from generic clock
 * times. Protein is spread deliberately: four moderate doses beat one large
 * one for muscle retention, which matters most in a deficit.
 */
export function schedule(store, targets, date = dayKey()) {
  const w = store.whoop?.rows?.[date];
  const sleepH = w?.sleepH ?? null;
  const strain = w?.strain ?? null;
  const recovery = w?.recovery ?? null;

  // Whoop records when you actually woke. Fall back to a recent average
  // before settling for a generic 07:00.
  const wake = w?.wakeHour ?? averageWakeHour(store) ?? 7;
  const knowWake = w?.wakeHour != null || averageWakeHour(store) != null;
  const plan = [];
  const proteinPerMeal = Math.round(targets.p / 4);

  const slots = [
    { meal: 'breakfast', at: wake + 1,  share: MEAL_SHARE.breakfast },
    { meal: 'lunch',     at: wake + 5,  share: MEAL_SHARE.lunch },
    { meal: 'snack',     at: wake + 9,  share: MEAL_SHARE.snack },
    { meal: 'dinner',    at: wake + 12, share: MEAL_SHARE.dinner },
  ];

  for (const s of slots) {
    plan.push({
      meal: s.meal,
      at: s.at,
      kcal: Math.round(targets.kcal * s.share),
      p: proteinPerMeal,
      c: Math.round(targets.c * s.share),
      f: Math.round(targets.f * s.share),
    });
  }

  const notes = [];
  if (recovery != null && recovery < 34) {
    notes.push({
      tone: 'warn',
      text: `Recovery is ${Math.round(recovery)}%. Hold calories at maintenance today rather than pushing a deficit — under-eating on a red day is what turns one bad night into a bad week.`,
    });
  } else if (recovery != null && recovery >= 67) {
    notes.push({
      tone: 'good',
      text: `Recovery is ${Math.round(recovery)}%. Good day to train hard and put the carbohydrate around the session.`,
    });
  }
  if (sleepH != null && sleepH < 6) {
    notes.push({
      tone: 'warn',
      text: `${sleepH.toFixed(1)} h of sleep. Short sleep reliably raises appetite the next day — expect the hunger and hold the line on protein first.`,
    });
  }
  if (strain != null && strain >= 14) {
    notes.push({
      tone: 'info',
      text: `Strain ${strain.toFixed(1)}. Today's expenditure is well above your average, so the target has moved up to match.`,
    });
  }
  return { plan, notes, wake, knowWake, sleepH, strain, recovery };
}

function averageWakeHour(store, days = 14) {
  const hours = Object.entries(store.whoop?.rows || {})
    .sort()
    .slice(-days)
    .map(([, r]) => r.wakeHour)
    .filter(h => h != null);
  if (hours.length < 3) return null;
  return hours.reduce((a, b) => a + b, 0) / hours.length;
}
