/*
 * Home.
 *
 * One job: log food, and show the three numbers that decide what to log
 * next. Everything that explains, qualifies or analyses lives one tab
 * across, because none of it changes what you tap.
 *
 * The layout is fixed rather than flowing: the readout occupies the top,
 * the grid fills the rest, and neither grows with the size of your log.
 * Adding your fourth meal of the day should not be further down the page
 * than adding your first.
 */

import { el, clear, icon, kcal, toast, sheet, confirmSheet, append, explain, dateLabel } from '../ui.js';
import { CARRY_WINDOW } from '../carry.js';
import { flyToTotals, haptic } from '../feedback.js';
import { weightUnit, kgToLb, lbToKg } from '../units.js';
import { EFFORT } from '../data/exercises.js';
import { openMealLogger } from './meallog.js';
import { openMealBuilder } from './meal.js';
import { whoopAdvice } from '../coachwhoop.js';
import { overdueNote, detectedWorkout, workoutHourDue, weighInDue } from '../reminders.js';
import { caffeineNote } from './supplements.js';
import { bandName } from '../applehealth.js';
import {
  get, weightSeries, setWeight, totals, dayKey, sessionFor, nextUp, typeById, logSession, trainState, dayPending, openDay, startNewDay, keepDayOpen, rolloverAsked, shiftDay, MEALS, removeEntry, entryMacros, frequentFoods,
  recentFoods, mealsList, mealTotals, groupedEntries,
  favouriteFoods, toggleFavourite, isFavourite, toggleHidden, deleteFood, deleteMeal,
  scannedFoods, builtFoods, addWater, undoWater, peekDay, dismissNote, noteDismissed,
  commit, noteActiveDay,
} from '../store.js';
import { dayTargets } from './today.js';
import { openPortion } from './portion.js';
import { openScanner, openQuickAdd, openBuilder } from './add.js';
import { openBuilder as openDrinkBuilder } from './starbucks.js';
import { openRestaurant, restaurantCell } from './restaurant.js';
import { searchRestaurants, searchDrinks, brandOf } from '../data/restaurants.js';
import { searchLocal, searchMeals, toItem } from '../search.js';
import { defaultBuild, buildMacros } from '../data/starbucks.js';
import { searchProducts, resolveBarcode, validEAN } from '../off.js';
import { openDish } from './dish.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

export function renderHome(root, ctx) {
  const s = get();
  const key = ctx.date || dayKey();
  const t = totals(key);
  const targets = dayTargets(s, key);

  clear(root);
  /* append() filters nulls; Element.append stringifies them, which is how
     a literal "null" ended up sitting under the readout whenever Whoop
     had nothing to say. */
  append(root,
    whatsNew(ctx),
    rolloverCard(key, ctx),
    weighAsk(key, ctx),
    workoutAsk(key, ctx),
    header(key, ctx),
    readout(t, targets, ctx),
    carryCard(targets),
    coachCard(s, targets, key, ctx),
    actions(ctx),
    waterStrip(key, targets),
    picker(s, ctx, key),
    logSection(key, ctx),
  );
}

/*
 * What changed, once.
 *
 * An update that alters how the whole app looks needs to say so, or the
 * next person to open it thinks something broke. But a banner that keeps
 * coming back is worse than no banner: it teaches people to dismiss the
 * top of the screen without reading it, which is exactly where the genuine
 * warnings live — the weigh-in ask, the rollover, the coach.
 *
 * So it is keyed by id rather than by version. Closing it writes the id
 * and it never returns, and a future note gets a new id rather than
 * resurrecting this one. Nothing here is a nag: no counter, no "remind me
 * later", one close button that means closed.
 */
const NEWS_ID = 'paper-skin';
const NEWS = {
  title: 'A new look, if you want it',
  body: 'Light is a warmer, rounder version of the whole app — every screen, '
      + 'chart and number exactly as they were, drawn differently. There is '
      + 'also a floating plus that opens the food search from any screen.',
  cta: 'Try it',
};

function whatsNew(ctx) {
  if (get().settings?.seenNews === NEWS_ID) return null;

  const dismiss = () => {
    commit(st => {
      st.settings = st.settings || {};
      st.settings.seenNews = NEWS_ID;
    }, 'settings');
    ctx.refresh();
  };

  return el('div.tile.news', {},
    el('div.between', {},
      el('span.micro', {}, "What\u2019s new"),
      el('button.x-btn', { 'aria-label': 'Dismiss', onclick: dismiss }, icon('x', 15))),
    el('h3', { style: { marginTop: '8px' } }, NEWS.title),
    el('div.fine', { style: { marginTop: '6px' } }, NEWS.body),
    el('div.btn-row', { style: { marginTop: '12px' } },
      el('button.btn.sm.primary', {
        onclick: () => {
          commit(st => { st.settings.theme = 'paper'; }, 'settings');
          dismiss();
          toast('Light is on. Settings \u2192 Appearance to change back.');
        },
      }, NEWS.cta),
      el('button.btn.sm', { onclick: dismiss }, 'Not now')));
}

/*
 * The header.
 *
 * The wordmark bar was a logo, a spacer and a gear — three things none of
 * which you need while logging lunch, taking the most valuable strip of
 * the screen to tell you which app you already knew you had opened.
 *
 * This says what day it is and lets you change it, which matters because
 * Home could not reach yesterday at all: you had to go to Detail to log
 * something you forgot. The greeting is there because the top of a home
 * screen reading as a blank shelf was the actual complaint, and a line
 * that changes through the day makes it feel occupied rather than
 * decorated.
 */
/*
 * "It is tomorrow. Are you finished with today?"
 *
 * The clock rolls at midnight; people do not. Someone eating at half one
 * in the morning is still on Friday, and an app that has already moved to
 * Saturday files that meal on a day that has not happened — leaving
 * Friday short and Saturday long, both wrong, with nothing on screen to
 * explain why.
 *
 * So the day moves when you say it moves. This is the asking, and it sits
 * above everything on the screen you log from, because someone opening
 * the app after midnight needs to know which day they are adding to
 * before they read a single number.
 */
/*
 * "Did you train?", at the hour you usually do.
 *
 * Logging a workout meant opening a tab, which is a lot of intent for a
 * yes. Most days the answer is one word and the app already knows which
 * session was next, so it can ask on the screen you are already on and be
 * done in a tap.
 *
 * It appears only after the hour you said you train, only on the day you
 * are actually logging, and never once something is already recorded. An
 * unanswered question sitting there all day is a nag; this one has a
 * dismiss that lasts until tomorrow.
 */
/*
 * "Worth weighing in" — when it would actually change something.
 *
 * Not a daily prompt. It appears when the app can point at something it
 * cannot compute, or is computing worse, for want of a weight — and it
 * says which, because "weigh yourself" is an instruction and "your
 * maintenance figure needs four readings and has two" is a reason.
 *
 * Somebody weighing most mornings never sees it. That is the whole design:
 * a reminder that fires when nothing is wrong teaches you to ignore it.
 */
function weighAsk(key, ctx) {
  if (key !== dayKey()) return null;
  const due = weighInDue();
  if (!due) return null;

  const s = get();
  const wu = weightUnit(s);
  const toDisp = kg => (wu === 'lb' ? kgToLb(kg) : kg);
  const fromDisp = v => (wu === 'lb' ? lbToKg(v) : v);
  const last = weightSeries().slice(-1)[0];

  const input = el('input.num-in', {
    type: 'number', inputmode: 'decimal', step: '0.1', min: '20',
    placeholder: last ? toDisp(last.kg).toFixed(1) : wu,
  });

  const save = () => {
    const kg = fromDisp(+input.value);
    if (!(kg > 20 && kg < 400)) { toast(`That does not look like a weight in ${wu}.`, 'err'); return; }
    setWeight(key, kg);
    haptic('success');
    toast('Logged.');
    ctx.refresh();
  };

  /* Comparability still matters, so it is said — but as a note on how to
     take the reading, not as a reason to wait for tomorrow. */
  const hour = new Date().getHours();
  const note = hour >= 4 && hour < 11
    ? 'Now is a good time — before eating or drinking is the reading that compares.'
    : 'Take it first thing tomorrow if you can. Morning readings are the comparable ones; '
      + 'evening runs a kilo or two higher and by a different amount each day.';

  return el('div.tile.ask-card', {},
    el('div.flex', {}, icon('body', 17), el('h3', {}, 'Worth weighing in')),
    el('div.fine', { style: { marginTop: '5px' } }, due.line),
    el('div.fine', { style: { marginTop: '5px' } }, note),
    el('div.flex', { style: { marginTop: '12px', gap: '8px' } },
      input,
      el('button.btn.confirm', { style: { flex: 'none' }, onclick: save }, 'Log'),
      el('button.btn.ghost', { style: { flex: 'none' },
        onclick: () => { commit(st => { st.settings.weighAsked = key; }, 'settings');
          haptic('tap'); ctx.refresh(); },
      }, 'Later')));
}


function workoutAsk(key, ctx) {
  const s = get();
  if (key !== dayKey()) return null;
  if (sessionFor(key)) return null;
  if (s.settings?.workoutAsked === key) return null;

  /*
   * Two ways in, whichever happens first.
   *
   * The hour you set is a guess about when you usually finish. The band is
   * evidence that it already happened — and when the strap has recorded a
   * hard day there is no reason to sit waiting for a clock. Either one
   * opens the card; the strap's version says what it saw, because "did you
   * train?" out of nowhere is a worse question than "your Whoop recorded
   * 47 minutes — was that your session?"
   */
  const seen = detectedWorkout(key);
  if (!seen && !workoutHourDue()) return null;

  const rot = trainState().rotation || [];
  const next = rot.length ? nextUp() : null;
  const t = next ? typeById(next) : null;

  return el('div.tile.ask-card', {},
    el('div.flex', {}, icon('barbell', 17), el('h3', {}, 'Did you train today?')),
    seen
      ? el('div.fine', { style: { marginTop: '5px' } },
          `${seen.band} recorded ${seen.what} today. It cannot tell what the session was, `
          + 'so nothing has been written down.')
      : null,
    t ? el('div.fine', { style: { marginTop: '5px' } }, `${t.name} is next in your rotation.`) : null,
    el('div.btn-row', { style: { marginTop: '12px' } },
      t ? el('button.btn.confirm.grow', {
        onclick: () => openEffortAsk(key, next, ctx, seen),
      }, `Yes — ${t.name}`) : null,
      el('button.btn.ghost' + (t ? '' : '.grow'), {
        onclick: () => ctx.go('train', {}),
      }, t ? 'Something else' : 'Log it'),
      el('button.btn.ghost', {
        'aria-label': 'Not today',
        onclick: () => { commit(st => { st.settings.workoutAsked = key; }, 'settings');
          haptic('tap'); ctx.refresh(); },
      }, 'No')));
}

/*
 * One more tap, because it is the one thing worth asking for.
 *
 * How a session felt is the only part of it no strap and no set count can
 * supply, and asking here costs a second while the session is still fresh
 * — far better than the honest alternative, which is never being asked.
 */
function openEffortAsk(key, typeId, ctx, seen = null) {
  const sh = sheet({
    title: typeById(typeId)?.name || 'Session',
    body: el('div', {},
      el('div.fine', { style: { marginBottom: '12px' } }, 'How did it go?'),
      el('div', {}, ...EFFORT.map(e => el('button.row', {
        onclick: () => {
          logSession(key, { type: typeId, effort: e.id,
            /* Keep the strap's own numbers on the session — they are the
               half of the intensity reading you cannot supply. */
            minutes: seen?.minutes ?? typeById(typeId)?.minutes ?? null,
            strain: seen?.strain ?? null,
            sets: (typeById(typeId)?.plan || []).reduce((a, x) => a + (x.sets || 0), 0) || null,
            source: seen?.source || 'manual' });
          haptic('success'); sh.close(); toast('Logged.'); ctx.refresh();
        },
      },
        el('span.grow', {},
          el('div.title', {}, e.label),
          el('div.sub', {}, e.note)),
        icon('chevron', 14)))),
      el('button.btn.ghost', { style: { marginTop: '12px', width: '100%' },
        onclick: () => {
          logSession(key, { type: typeId,
            minutes: seen?.minutes ?? typeById(typeId)?.minutes ?? null,
            strain: seen?.strain ?? null,
            sets: (typeById(typeId)?.plan || []).reduce((a, x) => a + (x.sets || 0), 0) || null,
            source: seen?.source || 'manual' });
          haptic('success'); sh.close(); toast('Logged.'); ctx.refresh();
        },
      }, 'Skip — just log it')),
  });
  return sh;
}

function rolloverCard(key, ctx) {
  if (!dayPending() || key !== openDay() || rolloverAsked()) return null;

  const nice = d => new Date(d + 'T12:00:00')
    .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const weekday = d => new Date(d + 'T12:00:00')
    .toLocaleDateString(undefined, { weekday: 'long' });

  return el('div.tile.rollover', {},
    el('div.rollover-head', {}, icon('moon', 17),
      el('h3', {}, `It is ${nice(dayKey())} now`)),
    el('div.fine', {},
      `You are still logging ${nice(key)}. Anything you add goes on that day `
      + 'until you finish it.'),
    el('div.btn-row', { style: { marginTop: '12px' } },
      el('button.btn.ghost.grow', {
        onclick: () => {
          /* Written down rather than merely tolerated, so it stops asking
             for the rest of the night. */
          keepDayOpen(key);
          haptic('tap');
          ctx.refresh();
        },
      }, 'Not done yet'),
      el('button.btn.primary.grow', {
        onclick: () => {
          startNewDay();
          haptic('success');
          ctx.go('home', { date: dayKey() });
        },
      }, `Start ${weekday(dayKey())}`)));
}

function header(key, ctx) {
  const today = dayKey();
  const isToday = key === today;
  const d = new Date(key + 'T12:00:00');

  const label = isToday
    ? 'Today'
    : (key === shiftDay(today, -1) ? 'Yesterday'
      : d.toLocaleDateString(undefined, { weekday: 'long' }));

  const sub = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

  const step = n => {
    const next = shiftDay(key, n);
    if (next > today) return;
    /* Walking forward onto today settles the "not done yet" question, so
       the next launch does not drag you back to yesterday. */
    noteActiveDay(next);
    ctx.go('home', { date: next });
  };

  return el('div.home-head', {},
    el('div.hh-top', {},
      el('span.hh-greet', {}, greeting(), recoveryNote(key)),
      el('button.x-btn', {
        'aria-label': 'Settings',
        onclick: () => ctx.go('settings'),
      }, icon('gear', 17))),

    el('div.hh-date', {},
      el('button.hh-arrow', { 'aria-label': 'Previous day', onclick: () => step(-1) },
        icon('chevron-left', 18)),
      el('div.hh-when', {},
        el('div.hh-day', {}, label),
        el('div.hh-sub', {}, sub)),
      el('button.hh-arrow' + (isToday ? '.is-off' : ''), {
        'aria-label': 'Next day', disabled: isToday, onclick: () => step(1),
      }, icon('chevron', 18))),

    isToday ? null : el('button.btn.sm.hh-back', {
      onclick: () => ctx.go('home', { date: today }),
    }, 'Back to today'));
}

/*
 * One strap figure beside the greeting, chosen by the hour.
 *
 * A fixed metric is wrong two thirds of the day. What you want to know
 * changes: in the morning it is how the night went, by the middle of the
 * day it is what you have to spend, and by the evening it is what you
 * actually did with it.
 *
 * Strain is the clearest case — it accumulates as the day goes on, so a
 * strain figure at eight in the morning is a number about nothing. Sleep
 * is the opposite: settled the moment you wake and stale by dinner.
 *
 * If the hour's own metric is missing the others stand in, because a true
 * figure of a different kind beats an empty greeting — the label always
 * says which one you are looking at.
 */
const STRAP_METRICS = {
  sleep: {
    read: r => (r.sleepH != null && Number.isFinite(r.sleepH)) ? r.sleepH : null,
    text: v => `slept ${v.toFixed(1)}h`,
    colour: (v, r) => {
      const p = r.sleepPerf;
      if (p == null) return 'var(--text-2)';
      return p >= 85 ? 'var(--good-ink)' : p >= 70 ? 'var(--caution)' : 'var(--warn)';
    },
  },
  recovery: {
    read: r => (r.recovery != null && Number.isFinite(r.recovery)) ? r.recovery : null,
    text: v => `recovery ${Math.round(v)}%`,
    colour: v => v >= 67 ? 'var(--good-ink)' : v >= 34 ? 'var(--caution)' : 'var(--warn)',
  },
  strain: {
    read: r => (r.strain != null && Number.isFinite(r.strain)) ? r.strain : null,
    text: v => `strain ${v.toFixed(1)}`,
    colour: () => 'var(--m-p)',
  },
};

/* Which one the hour calls for, then the others as fallbacks. */
function strapOrder(hour) {
  if (hour < 11) return ['sleep', 'recovery', 'strain'];
  if (hour < 18) return ['recovery', 'strain', 'sleep'];
  return ['strain', 'recovery', 'sleep'];
}

function recoveryNote(key, now = new Date()) {
  const row = get().whoop?.rows?.[key];
  if (!row) return null;

  /* On a past day the hour you happen to be reading it makes no odds —
     the day is over, so show what it came to. */
  const past = key !== dayKey();
  const order = past ? ['strain', 'recovery', 'sleep'] : strapOrder(now.getHours());

  for (const name of order) {
    const m = STRAP_METRICS[name];
    const v = m.read(row);
    if (v == null) continue;
    return el('span.hh-rec', { style: { color: m.colour(v, row) } },
      ' \u00b7 ' + m.text(v));
  }
  return null;
}

/* Enough of a nod to the time of day to feel present, without pretending
   to know anything about how it is going. */
function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Late one';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

/*
 * The readout.
 *
 * Calories left is the headline because it is the number that ends the
 * day; the three macros sit under it as cups you can read at a glance.
 * The whole block is one button into the detail tab — there is nothing
 * here you can tap and get something other than "explain this".
 */
function readout(t, targets, ctx) {
  const left = Math.max(0, Math.round((targets.kcal || 0) - (t.kcal || 0)));
  const over = (t.kcal || 0) > (targets.kcal || 0);

  /*
   * A cup that is merely full and a cup that is overflowing have to look
   * different. Clamping the fill at 100% made 215 g of carbs against a
   * 203 g target indistinguishable from hitting it exactly, which is the
   * one thing this readout exists to tell you.
   */
  const cup = (name, have, want, colour) => {
    const ratio = want ? have / want : 0;
    const over = ratio > 1.02;
    const pct = Math.min(1, ratio);
    return el('div.cup' + (over ? '.is-over' : ''), {},
      el('div.cup-bar', {},
        el('i', { style: { height: (pct * 100).toFixed(1) + '%', background: over ? 'var(--warn)' : colour } }),
        over ? el('span.cup-over', {}, '+' + Math.round(have - want)) : null),
      el('div.cup-n', {}, Math.round(have) + ' g'),
      el('div.cup-l', {}, name),
      el('div.cup-t', {}, over ? 'over ' + Math.round(want || 0) : 'of ' + Math.round(want || 0)));
  };

  return el('button.tile.tile-hero.readout-block', {
    onclick: () => ctx.go('detail'),
    'aria-label': 'Open the full breakdown',
  },
    el('div.readout-top', {},
      el('div', {},
        el('div.micro', {}, over ? 'Over by' : 'Calories left'),
        el('div.readout-main', {},
          over ? Math.round((t.kcal || 0) - (targets.kcal || 0)) : left)),
      el('div.readout-side', {},
        el('div.micro', {}, 'Eaten'),
        el('div.v', {}, kcal(t.kcal || 0)),
        el('div.micro', { style: { marginTop: '4px' } }, 'of ' + Math.round(targets.kcal || 0)))),

    el('div.cups', {},
      cup('Protein', t.p || 0, targets.p, 'var(--m-p)'),
      cup('Carbs', t.c || 0, targets.c, 'var(--m-c)'),
      cup('Fat', t.f || 0, targets.f, 'var(--m-f)')),

    el('div.readout-more', {}, 'Full breakdown', icon('chevron', 14)),
  );
}

/*
 * Why today's number is not the usual number.
 *
 * An adjusted target that does not say why is worse than no adjustment —
 * the person sees an unfamiliar figure, cannot account for it, and stops
 * trusting every other figure on the screen with it. So the arithmetic is
 * shown: where it came from, what was left out, and what was trimmed.
 *
 * The days it declined to count are named too. Somebody who under-ate on
 * Tuesday and sees nothing carried should be told it was because Tuesday
 * was half-logged, not left to conclude the feature is broken.
 */
function carryCard(targets) {
  const c = targets.carry;
  if (!c?.applied) return null;

  const up = c.applied > 0;
  const amount = Math.abs(Math.round(c.applied));
  /* dateLabel already capitalises properly — lowercasing it turned
     "Tue 1 Sept" into "tue 1 sept". */
  const from = c.counted
    .filter(d => Math.abs(d.delta) >= 25)
    .map(d => `${dateLabel(d.date)} ${d.delta < 0 ? 'under' : 'over'} by ${Math.abs(Math.round(d.delta))}`);

  return el('div.tile', {},
    el('div.between', {},
      el('div.micro', {}, up ? 'Carried forward' : 'Carried back'),
      el('div.micro', { style: { color: up ? 'var(--good-ink)' : 'var(--warn)' } },
        (up ? '+' : '−') + amount + ' kcal')),

    el('div.fine', { style: { marginTop: '6px' } },
      from.length
        ? `${from.join(', ')}. Today's target moved to ${Math.round(targets.kcal)}.`
        : `Today's target moved to ${Math.round(targets.kcal)}.`),

    c.capped
      ? el('div.fine', { style: { marginTop: '4px' } },
          `Trimmed to the ${c.cap} kcal cap — the full gap was ${Math.abs(Math.round(c.raw))}.`)
      : null,

    c.floored
      ? el('div.fine', { style: { marginTop: '4px' } },
          `Held at your floor of ${c.floor.kcal}; the carry would have gone under it.`)
      : null,

    c.skipped.length
      ? el('div.fine', { style: { marginTop: '4px' } },
          'Not counted: ' + c.skipped
            .map(d => `${dateLabel(d.date)} (${d.why})`).join(', ') + '.')
      : null,

    explain(`Energy balance is cumulative, so this is real — but only for calories, and only `
      + `over ${CARRY_WINDOW} days. Protein is not stored and cannot be repaid, so it is never carried.`,
      { style: { marginTop: '8px' } }));
}

/*
 * Four things you actually start from.
 *
 * "Make a meal" was reachable only from a tab that no longer exists, which
 * made the single most common action — combining ingredients you already
 * have into a dish you eat weekly — effectively undiscoverable. It gets a
 * button. The Indian dish estimator moved behind "Food", where it belongs:
 * it is a way of describing one thing you ate, not a way of building.
 */
/*
 * What Whoop has to say, on the screen where you log.
 *
 * This used to live only on Detail, which is the tab you open to read
 * rather than the one you open to eat — so the strap's influence on the
 * day was invisible at exactly the moment it mattered. It shows one card
 * at a time, and nothing at all when there is no strap data or nothing
 * worth saying.
 */
function coachCard(store, targets, key, ctx) {
  /*
   * The card restates itself on a timer.
   *
   * Its advice is a function of the clock — how long you have been awake,
   * how long since you ate, how much evening is left — so a card rendered
   * at breakfast is wrong by lunchtime. Redrawing only this element keeps
   * it true without rebuilding the screen, which is what made the app
   * jump back to the top every time anything changed.
   */
  const host = el('div.coach-host');
  let timer = null;

  const paint = ({ first = false } = {}) => {
    /* The connectivity check is how the timer learns the screen is gone.
       It must not run on the first paint, because the host is built here
       and attached by the caller a moment later — guarding that pass made
       the card return empty every time and stop its own timer. */
    if (!first && !host.isConnected) { clearInterval(timer); return; }
    const next = buildCoach(get(), dayTargets(get(), key), key, ctx);
    host.replaceChildren();
    if (next) host.append(next);
  };

  /* Dismissing one note should reveal the next, not blank the slot and
     not rebuild the screen. */
  ctx.repaintCoach = () => paint();

  paint({ first: true });
  if (key === dayKey()) timer = setInterval(paint, 4 * 60 * 1000);
  return host;
}

/*
 * A note's identity is its headline.
 *
 * The rules have no ids of their own, and adding them would fix the
 * wording of every rule forever. The headline is stable while the advice
 * is the same advice, and changes when the numbers in it change — which
 * is the moment the note has become new information again.
 */
const noteId = a => String(a.headline || '').slice(0, 80);

/*
 * Swipe a note away.
 *
 * Pointer events rather than touch, so it works with a trackpad too, and
 * a movement threshold before capture so a vertical scroll that starts on
 * the card still scrolls. Under 90px it springs back — the distance is
 * the confirmation, since there is no undo dialog for something this
 * small.
 */
function makeDismissible(card, done) {
  let x0 = null, y0 = null, dx = 0, active = false;

  card.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; active = false;
  });

  card.addEventListener('pointermove', e => {
    if (x0 == null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    /* Claim the gesture only once it is clearly sideways. */
    if (!active && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my)) {
      active = true;
      card.setPointerCapture?.(e.pointerId);
      card.style.transition = 'none';
    }
    if (!active) return;
    dx = mx;
    card.style.transform = `translateX(${dx}px)`;
    card.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 260));
  });

  const release = () => {
    if (x0 == null) return;
    const gone = Math.abs(dx) > 90;
    card.style.transition = '';
    if (gone) {
      card.style.transform = `translateX(${dx > 0 ? 500 : -500}px)`;
      card.style.opacity = '0';
      done();
    } else {
      card.style.transform = '';
      card.style.opacity = '';
    }
    x0 = y0 = null; dx = 0; active = false;
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}

function buildCoach(store, targets, key, ctx) {
  let all = [];
  try { all = whoopAdvice(store, targets, key) || []; }
  catch { all = []; }

  /* An unmarked dose outranks most nutrition advice, so it joins the same
     queue rather than getting a card of its own — and it is dismissible
     like anything else, because you may simply have taken it. */
  try {
    const meds = overdueNote(key);
    if (meds) all = [meds, ...all];
  } catch { /* medication is optional; never let it break the card */ }

  /* Caffeine has no widget on Home — this note is the whole of its
     presence there, which is why it has to earn its place by only
     appearing when the answer changes something. */
  try {
    const caff = caffeineNote(key);
    if (caff) all = [...all, caff];
  } catch { /* likewise */ }

  all.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));

  if (!all.length) return null;

  /* Skip the ones already read and swiped away today. */
  const advice = all.find(a => !noteDismissed(key, noteId(a)));
  if (!advice) return null;

  const id = noteId(advice);
  const card = el('div.tile.coach-card.no-swipe.' + (advice.tone === 'warn' ? 'is-warn' : 'is-good'), {},
    el('div.coach-top', {},
      el('span.coach-tag', {}, advice.source === 'meds' ? 'MEDS'
        : advice.source === 'caffeine' ? 'CAFFEINE'
        : bandName().toUpperCase()),
      el('div.coach-head', {}, advice.headline),
      /* Swipe is the gesture, but a gesture nobody can see is a secret.
         The button does the same thing and announces that it is possible. */
      el('button.coach-x', {
        'aria-label': 'Dismiss this note',
        onclick: e => { e.stopPropagation(); dismiss(); },
      }, '\u00D7')),
    el('div.coach-body', {}, advice.body));

  const dismiss = () => {
    card.classList.add('is-going');
    haptic('tap');
    setTimeout(() => { dismissNote(key, id); ctx.repaintCoach?.(); }, 190);
  };
  makeDismissible(card, dismiss);

  /* Named foods, tappable — a recommendation you cannot act on is a lecture. */
  if (advice.action && advice.action.kind === 'foods' && advice.action.picks.length) {
    const row = el('div.coach-picks');
    for (const p of advice.action.picks) {
      row.append(el('button.coach-pick', {
        onclick: () => openPortion(toItem(p.food), { dateKey: key, onSaved: ctx.refresh }),
      },
        el('span.cp-name', {}, p.food.n || p.food.name),
        el('span.cp-meta', {}, `${p.typical} g · ${p.wouldCost} kcal`)));
    }
    card.append(
      el('div.coach-action-label', {}, advice.action.label),
      row);
  }
  return card;
}

function actions(ctx) {
  return el('div.home-actions', {},
    el('button.chip', { onclick: () => openScanner(ctx) }, icon('scan', 17), 'Scan'),
    el('button.chip', { onclick: () => openMealBuilder({ onSaved: ctx.refresh }) },
      icon('pot', 17), 'Meal'),
    el('button.chip', { onclick: () => openBuilder({ onSaved: ctx.refresh }) }, icon('plus', 17), 'Food'),
    el('button.chip', { onclick: () => openQuickAdd(ctx) }, icon('bolt', 17), 'Quick'),
  );
}

/*
 * Search and grid share one region: typing replaces the grid rather than
 * pushing it down the page, so the results appear where your eye already
 * is and the screen never gets taller than it started.
 */
/*
 * Water, on the screen where logging happens.
 *
 * It lived in Detail, which meant a glass of water — the single most
 * frequent thing anyone logs — was the one thing you had to leave Home to
 * record. This is the same model as the Detail tile, drawn as a strip
 * rather than a card, and it repaints only itself: rebuilding the screen
 * on every glass was an earlier complaint and the scroll position going
 * with it is what made it feel like the app had restarted.
 */
function waterStrip(key, targets) {
  const s = get();
  const goal = targets.water || 3000;
  const glassMl = s.settings.glassMl || 250;
  const glasses = Math.min(Math.ceil(goal / glassMl), 14);

  const grid = el('div.water-grid.water-strip');
  const readoutEl = el('span.num', { style: { fontSize: '12.5px' } });

  const repaint = () => {
    const water = (peekDay(key)?.water || []).reduce((a, w) => a + (w.ml || w || 0), 0);
    const full = Math.floor(water / glassMl);
    const partial = (water % glassMl) / glassMl;

    grid.replaceChildren();
    for (let i = 0; i < glasses; i++) {
      const cls = i < full ? 'glass full' : (i === full && partial > 0.05 ? 'glass part' : 'glass');
      const node = el('div', { class: cls, 'aria-hidden': 'true' });
      if (i === full && partial > 0.05) node.style.setProperty('--lvl', Math.round(partial * 100) + '%');
      grid.append(node);
    }
    readoutEl.textContent = `${(water / 1000).toFixed(2)} / ${(goal / 1000).toFixed(1)} L`;
  };
  repaint();

  const add = ml => { addWater(key, ml); haptic('tap'); repaint(); };

  /* A target that moved should say what moved it, or it looks arbitrary. */
  const why = targets.suppShift?.waterMl
    ? `+${targets.suppShift.waterMl} ml for ${targets.suppShift.reasons.join(' and ').toLowerCase()}`
    : null;

  return el('div.tile.water-tile', {},
    el('div.between', { style: { marginBottom: '9px' } },
      el('div.flex', { style: { gap: '7px' } }, icon('drop', 15), el('span.micro', {}, 'Water')),
      readoutEl),
    why ? el('div.fine', { style: { marginTop: '-3px', marginBottom: '8px' } }, why) : null,
    grid,
    el('div.btn-row', { style: { marginTop: '10px' } },
      el('button.btn.sm', { onclick: () => add(glassMl) }, `+ ${glassMl}`),
      el('button.btn.sm', { onclick: () => add(500) }, '+ 500'),
      el('button.btn.sm.ghost', {
        onclick: () => { undoWater(key); haptic('tap'); repaint(); },
        'aria-label': 'Undo last water entry',
      }, 'Undo')));
}

function picker(s, ctx, key) {
  const grid = el('div');
  const wrap = el('div', {});

  /*
   * Local results are instant; the packaged-product lookup waits for you to
   * stop typing. Firing a request per keystroke meant "lays" launched three
   * overlapping searches that raced each other, and the loser frequently
   * won — which is why a query with 22 000 matches rendered as "nothing
   * matches". It also rate-limits the API for no benefit.
   */
  let debounce;
  const search = el('input', {
    type: 'search', placeholder: 'Search foods',
    autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
    oninput: e => {
      const q = e.target.value;
      clearTimeout(debounce);
      drawLocal(q);
      debounce = setTimeout(() => drawRemote(q), 320);
    },
  });

  function cells(items) {
    const g = el('div.food-grid');
    for (const f of items) {
      const per = f.per100 || {};
      const ref = f.id || f.ref || f.n;
      /*
       * A visible button rather than a long press.
       *
       * Press-and-hold on a web page triggers the OS text-selection
       * callout before any JavaScript sees it, so on an iPhone holding a
       * tile selected half the screen instead of opening a menu. There is
       * no reliable way to have both, and a control you can see is better
       * than a gesture you have to be told about anyway.
       */
      const cell = el('div.food-cell.cell-wrap' + (isFavourite(ref) ? '.is-fav' : ''), {},
        el('button.cell-main', {
          onclick: () => openPortion(f, { dateKey: key, onSaved: ctx.refresh }),
        },
          el('span.fc-name', {}, f.n),
          el('span.fc-kcal', {}, `${Math.round(per.kcal || 0)} · ${Math.round(per.p || 0)}P`)),
        el('button.cell-more', {
          'aria-label': `More for ${f.n}`,
          onclick: e => { e.stopPropagation(); openFoodActions(f, ref, ctx); },
        }, '\u22EF'));
      g.append(cell);
    }
    return g;
  }

  let seq = 0;
  const remote = el('div');

  /* Whatever we already hold, drawn on the keystroke. */
  function drawLocal(q) {
    q = (q || '').trim();
    seq++;                       // any in-flight remote result is now stale
    clear(remote);
    if (q.length >= 2) {
      clear(grid);

      /* Meals first. A saved meal is the thing you are most likely to be
         reaching for by name — "fried rice" should find the dish you built,
         not just the rice in it — and it was the one thing search could not
         see. */
      const meals = searchMeals(q);
      if (meals.length) {
        grid.append(label('Your meals'));
        const mg = el('div.food-grid');
        for (const m of meals) {
          const mt = mealTotals(m);
          mg.append(el('div.food-cell.is-meal.cell-wrap', {},
            el('button.cell-main', {
              onclick: () => openMealLogger(m, { dateKey: key, onSaved: ctx.refresh }),
            },
              el('span.fc-name', {}, m.name),
              el('span.fc-kcal', {}, `${Math.round(mt.kcal || 0)} · ${m.items.length} items`)),
            el('button.cell-more', {
              'aria-label': `More for ${m.name}`,
              onclick: e => { e.stopPropagation(); openMealActions(m, ctx); },
            }, '\u22EF')));
        }
        grid.append(mg);
      }

      /* Then the places. Typing "KFC" should hand you KFC, not eleven
         separate KFC items you have to read through — and typing a dish
         you half remember still lands on the counter that sells it,
         because the aliases carry the dish names too. */
      const places = searchRestaurants(q, s.settings?.diet);
      if (places.length) {
        grid.append(label('Places'));
        const pg = el('div.rest-list');
        for (const b of places.slice(0, 4)) pg.append(restaurantCell(b, ctx));
        grid.append(pg);
      }

      const hits = searchLocal(q);
      if (hits.length) {
        if (meals.length || places.length) grid.append(label('Foods'));
        grid.append(cells(hits.slice(0, 24).map(toItem)));
      }

      /* Starbucks drinks are built rather than stored, so they are not in
         the food library and need their own pass to stay findable by
         name — "mocha" has to work from the main box. */
      const drinks = searchDrinks(q);
      if (drinks.length) {
        grid.append(label('Starbucks'));
        const dg = el('div.food-grid');
        for (const d of drinks.slice(0, 8)) {
          const m = buildMacros(defaultBuild(d.id, 'grande'));
          dg.append(el('button.food-cell', {
            onclick: () => openDrinkBuilder(d.id, key, ctx),
          },
            el('span.fc-name', {}, d.name),
            el('span.fc-kcal', {}, `${m.kcal} kcal · ${m.caffeine} mg`)));
        }
        grid.append(dg);
      }

      grid.append(remote);
      return;
    }
    drawShortcuts();
  }

  /* The network half, once you have stopped typing. */
  async function drawRemote(q) {
    q = (q || '').trim();
    if (q.length < 2) return;
    const mine = ++seq;

    /* A typed barcode is the fallback for a scuffed or badly lit packet,
       so it has to land in the same place a scan does. */
    const digits = q.replace(/\s/g, '');
    if (validEAN(digits)) {
      remote.replaceChildren(el('div.grid-empty', {}, `Looking up ${digits}…`));
      const food = await resolveBarcode(digits);
      if (mine !== seq) return;
      clear(grid);
      grid.append(remote);
      /* Found-but-empty is its own case. The entry exists, so "no entry
         for that barcode" would be a lie, and showing it as a tappable
         cell would log it as zero calories. */
      remote.replaceChildren(
        food.found && food.complete
          ? cells([toItem(food)])
          : el('div.grid-empty', {},
              food.found
                ? `${food.n} is in the database, but with no nutrition on it.`
                : 'No entry for that barcode.',
              el('button.btn.sm', { style: { marginTop: '10px' },
                onclick: () => openBuilder({
                  food: food.found ? food : null,
                  barcode: digits, onSaved: ctx.refresh,
                }) },
                'Enter it from the packet')));
      return;
    }

    const localCount = searchLocal(q).length;
    remote.replaceChildren(el('div.grid-empty', {}, 'Checking packaged products…'));
    const r = await searchProducts(q);
    if (mine !== seq) return;

    if (r.products && r.products.length) {
      remote.replaceChildren(label('Packaged'), cells(r.products.map(toItem).slice(0, 18)));
    } else if (!localCount) {
      remote.replaceChildren(el('div.grid-empty', {},
        r.offline ? 'Packaged search is unreachable right now.' : `Nothing matches “${q}”.`,
        el('button.btn.sm', { style: { marginTop: '10px' },
          onclick: () => openBuilder({ name: q, onSaved: ctx.refresh }) }, 'Build it')));
    } else {
      remote.replaceChildren();
    }
  }

  function drawShortcuts() {
    clear(grid);

    const meals = mealsList();
    if (meals.length) {
      const buildMeals = () => {
      const g = el('div.food-grid');
      for (const m of meals.slice(0, 6)) {
        const mt = mealTotals(m);
        g.append(el('div.food-cell.is-meal.cell-wrap', {},
          el('button.cell-main', {
            /* Opens rather than logs: you almost never eat exactly the
               portion you saved, and assuming you did was wrong. */
            onclick: () => openMealLogger(m, { dateKey: key, onSaved: ctx.refresh }),
          },
            el('span.fc-name', {}, m.name),
            el('span.fc-kcal', {}, `${Math.round(mt.kcal || 0)} · ${m.items.length} items`)),
          el('button.cell-more', {
            'aria-label': `More for ${m.name}`,
            onclick: e => { e.stopPropagation(); openMealActions(m, ctx); },
          }, '\u22EF')));
      }
        return g;
      };
      grid.append(section('Your meals', meals.length, buildMeals, true));
    }

    const favs = favouriteFoods().map(toItem);
    if (favs.length) grid.append(section('Favourites', favs.length, () => cells(favs), true));

    /*
     * Your own foods, split by where they came from.
     *
     * "Most eaten" and "Recent" are computed from the log, so a food you
     * saved but have not eaten yet appears in neither — which is exactly
     * the food you are most likely to be hunting for, having just scanned
     * it. These rows are the library itself, and separating scanned from
     * hand-entered matters because you remember which one a thing was.
     */
    const scanned = scannedFoods(12).map(toItem);
    if (scanned.length) grid.append(section('Scanned', scanned.length, () => cells(scanned), false));

    const built = builtFoods(12).map(toItem);
    if (built.length) grid.append(section('Added by hand', built.length, () => cells(built), false));

    const freq = frequentFoods(18).map(toItem);
    if (freq.length) grid.append(section('Most eaten', freq.length, () => cells(freq), true));

    const recent = recentFoods(12).map(toItem);
    if (recent.length) grid.append(section('Recent', recent.length, () => cells(recent), false));

    if (!meals.length && !freq.length && !recent.length && !scanned.length && !built.length) {
      grid.append(el('div.grid-empty', {},
        'Scan something or build a food, and it lands here for good.'));
    }
  }

  const label = text => el('div.section-label', {}, el('span.micro', {}, text));

  /*
   * A foldable section.
   *
   * Most eaten, Recent, Scanned and Added by hand are each up to a dozen
   * cells, and stacked they pushed everything else three screens down —
   * the shortcut rows were costing more scrolling than they saved. Folded
   * they are one line each, the count is on the header so you know whether
   * opening it is worth it, and the choice is remembered per section
   * because which rows matter differs by person.
   */
  function section(title, count, buildBody, defaultOpen) {
    const saved = get().settings?.homeSections?.[title];
    let open = saved == null ? defaultOpen : saved;

    const caret = el('span.sec-caret', {}, open ? '\u25BE' : '\u25B8');
    const body = el('div');

    const paint = () => {
      caret.textContent = open ? '\u25BE' : '\u25B8';
      head.setAttribute('aria-expanded', String(open));
      clear(body);
      if (open) body.append(buildBody());
    };

    const head = el('button.sec-head', {
      'aria-expanded': String(open),
      onclick: () => {
        open = !open;
        commit(st => {
          st.settings.homeSections = st.settings.homeSections || {};
          st.settings.homeSections[title] = open;
        }, 'settings');
        haptic('tap');
        paint();
      },
    },
      el('span.micro', {}, title),
      el('span.sec-count', {}, String(count)),
      caret);

    paint();
    return el('div.home-sec', {}, head, body);
  }

  wrap.append(el('div.field.home-search', {}, icon('search', 16), search), grid);
  drawShortcuts();
  return wrap;
}

/*
 * The log, with a heading.
 *
 * Without one it sat flush against the bottom of the food grid — two
 * translucent panels sharing a single edge, which with blur and rounded
 * corners reads as one crashing into the other rather than as two
 * sections. A label separates them and says what the panel is.
 */
function logSection(key, ctx) {
  const log = miniLog(key, ctx);
  if (!log) return null;
  log.classList.add('home-log');
  return el('div.home-log-wrap', {},
    el('div.section-label', {}, el('span.micro', {}, 'Logged today')),
    log);
}

/*
 * The log.
 *
 * A meal you cooked is one thing you ate, so it is one line — the five
 * ingredients that went into it scattered through the list told you what
 * the app stored, not what you had. Tapping the line opens the parts.
 */
export function miniLog(key, ctx) {
  const rows = groupedEntries(key);
  if (!rows.length) return null;

  const bySitting = new Map(MEALS.map(m => [m, []]));
  for (const r of rows) {
    const sitting = r.kind === 'meal' ? r.meal : r.entry.meal;
    (bySitting.get(sitting) || bySitting.get('snack')).push(r);
  }

  const wrap = el('div.tile.flush');
  for (const m of MEALS) {
    const list = bySitting.get(m) || [];
    if (!list.length) continue;
    wrap.append(el('div.mini-head', {}, MEAL_LABELS[m]));

    for (const r of list) {
      if (r.kind === 'entry') {
        const mm = entryMacros(r.entry);
        wrap.append(entryRow(r.entry.name, mm.kcal, () => {
          removeEntry(key, r.entry.id); toast('Removed.'); ctx.refresh();
        }, () => openEntryDetail(r.entry, key, ctx)));
        continue;
      }

      const total = r.items.reduce((a, e) => a + (entryMacros(e).kcal || 0), 0);
      wrap.append(entryRow(r.name, total, () => {
        for (const e of r.items) removeEntry(key, e.id);
        toast(`${r.name} removed.`); ctx.refresh();
      }, () => openMealGroup(r, key, ctx), r.items.length));
    }
  }
  return wrap;
}

function entryRow(name, kcalValue, onRemove, onOpen, count = 0) {
  return el('div.mini-row', {},
    el('button.grow.mini-open', { onclick: onOpen },
      el('span', {}, name),
      count ? el('span.mini-count', {}, `${count} items`) : null,
      icon('chevron', 13)),
    el('span.num', {}, kcal(kcalValue)),
    el('button.mini-x', { 'aria-label': 'Remove ' + name, onclick: onRemove }, '\u00d7'));
}

/* What actually went on the plate, and the chance to correct it. */
function openMealGroup(group, key, ctx) {
  const body = el('div');
  const list = el('div.tile.flush');
  for (const e of group.items) {
    const mm = entryMacros(e);
    list.append(el('div.mini-row', {},
      el('button.grow.mini-open', { onclick: () => { sh.close(); openEntryDetail(e, key, ctx); } },
        el('span', {}, e.name),
        el('span.mini-count', {}, `${Math.round(e.grams)} g`),
        icon('chevron', 13)),
      el('span.num', {}, kcal(mm.kcal)),
      el('button.mini-x', {
        'aria-label': 'Remove ' + e.name,
        onclick: () => {
          removeEntry(key, e.id);
          toast('Removed.');
          sh.close(); ctx.refresh();
        },
      }, '\u00d7')));
  }

  const t = group.items.reduce((a, e) => {
    const m = entryMacros(e);
    a.kcal += m.kcal || 0; a.p += m.p || 0; a.c += m.c || 0; a.f += m.f || 0;
    return a;
  }, { kcal: 0, p: 0, c: 0, f: 0 });

  body.append(
    el('div.tile.tile-hero', {},
      el('div.readout', {},
        el('div', {},
          el('div.micro', {}, MEAL_LABELS[group.meal] || 'Logged'),
          el('div.readout-main', { style: { fontSize: '34px' } }, Math.round(t.kcal))),
        el('div.readout-side', {},
          el('div.micro', {}, 'P · C · F'),
          el('div.v', {}, `${Math.round(t.p)} · ${Math.round(t.c)} · ${Math.round(t.f)}`)))),
    el('div.section-label', {}, el('span.micro', {}, 'What went in')),
    list,
    el('div.fine', { style: { marginTop: '8px' } },
      'Tap an ingredient to change how much of it you had.'));

  const sh = sheet({ title: group.name, body });
  return sh;
}

function openEntryDetail(entry, key, ctx) {
  openPortion({ n: entry.name, brand: entry.brand, per100: entry.per100, serv: entry.serv,
                barcode: entry.barcode, id: entry.ref },
    { dateKey: key, entry, onSaved: ctx.refresh });
}

function openFoodActions(food, ref, ctx) {
  const fav = isFavourite(ref);
  const s = get();
  const isMine = !!(s.library && s.library[ref]);

  const sh = sheet({
    title: food.n,
    body: el('div', {},
      el('div.tile.flush', {},
        action(fav ? 'Remove from favourites' : 'Add to favourites', 'star', () => {
          toggleFavourite(ref);
          toast(fav ? 'Removed from favourites.' : 'Added to favourites.');
          sh.close(); ctx.refresh();
        }),
        action('Hide from suggestions', 'eye', () => {
          toggleHidden(ref);
          toast('Hidden. Your log is unchanged.');
          sh.close(); ctx.refresh();
        }),
        isMine ? action('Delete this food', 'trash', async () => {
          if (!(await confirmSheet({
            title: 'Delete ' + food.n + '?',
            message: 'It goes from your library. Days you already logged it on keep their numbers.',
            confirmLabel: 'Delete', danger: true,
          }))) return;
          deleteFood(ref);
          toast('Deleted.');
          sh.close(); ctx.refresh();
        }, true) : null),
      el('div.fine', { style: { marginTop: '10px' } },
        'Hiding only stops this being suggested. Nothing you have already logged changes.')),
  });
  return sh;
}

const action = (label, ic, onclick, danger = false) =>
  el('button.row' + (danger ? '.is-danger' : ''), { onclick },
    icon(ic, 17), el('span.grow', {}, label), icon('chevron', 14));

/*
 * The meal's own actions.
 *
 * Editing one used to be reachable only from a route with no tab, so
 * changing an ingredient — swapping the paneer in your fried rice — had
 * no path from the screen you actually use.
 */
function openMealActions(meal, ctx) {
  const sh = sheet({
    title: meal.name,
    body: el('div', {},
      el('div.tile.flush', {},
        action('Edit ingredients', 'edit', () => {
          sh.close();
          openMealBuilder({ meal, onSaved: ctx.refresh });
        }),
        action('Delete this meal', 'trash', async () => {
          if (!(await confirmSheet({
            title: 'Delete ' + meal.name + '?',
            message: 'The saved recipe goes. Days you already logged it on keep their entries.',
            confirmLabel: 'Delete', danger: true,
          }))) return;
          deleteMeal(meal.id);
          toast('Deleted.');
          sh.close(); ctx.refresh();
        }, true)),
      el('div.fine', { style: { marginTop: '10px' } },
        'Editing changes the recipe from now on. Meals you have already logged keep the amounts they were logged with.')),
  });
  return sh;
}
