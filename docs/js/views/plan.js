/*
 * The plan.
 *
 * What to eat next, when to eat it, and why today is different from
 * yesterday. Everything here is derived from your own numbers.
 */

import { el, clear, icon, kcal, grams, g, hourLabel, toast, empty } from '../ui.js';
import { get, totals, dayKey, addEntry, macrosFor, mealForNow } from '../store.js';
import { suggest, schedule, mealBudget, currentMeal } from '../coach.js';
import { dayTargets } from './today.js';
import { openPortion } from './portion.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

export function renderPlan(root, ctx) {
  const s = get();
  const key = dayKey();
  const t = totals(key);
  const targets = dayTargets(s, key);
  const now = new Date();

  clear(root);

  const result = suggest(s, targets, t, now, { limit: 5 });
  const sched = schedule(s, targets, key);

  root.append(
    el('h1', { style: { marginBottom: '4px' } }, 'Plan'),
    el('div.micro', { style: { marginBottom: '16px' } },
      `${MEAL_LABELS[result.meal]} · ${hourLabel(now.getHours() + now.getMinutes() / 60)}`),

    ...sched.notes.map(n => el('div', { class: 'note ' + n.tone }, el('div', {}, n.text))),

    budgetTile(result, t, targets),
    ideasTile(result, ctx),
    scheduleTile(sched, targets),
  );
}

function budgetTile(result, t, targets) {
  const b = result.budget;
  const left = result.left;

  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, `Room for ${MEAL_LABELS[result.meal].toLowerCase()}`),
      el('span.micro', {}, `${Math.round((result.share || 0) * 100)}% of today's remainder`)),

    el('div.readout', {},
      el('div', {},
        el('div.micro', {}, 'This meal'),
        el('div.readout-main', { style: { fontSize: '34px' } }, kcal(b.kcal))),
      el('div.readout-side', {},
        el('div.micro', {}, 'Left today'),
        el('div.v', {}, kcal(left.kcal) + ' kcal'))),

    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '14px' } },
      target('Protein', b.p, left.p, 'var(--m-p)'),
      target('Carbs', b.c, left.c, 'var(--m-c)'),
      target('Fat', b.f, left.f, 'var(--m-f)')),
  );
}

const target = (name, meal, day, hue) =>
  el('div', {},
    el('div.micro', { style: { color: hue } }, name),
    el('div.num', { style: { fontSize: '16px', marginTop: '2px' } }, `${Math.round(meal)} g`),
    el('div.micro', { style: { marginTop: '1px' } }, `${Math.round(day)} left`));

function ideasTile(result, ctx) {
  if (result.note) {
    return el('div.tile', {}, el('div.dim', { style: { fontSize: '14px' } }, result.note));
  }
  if (!result.ideas.length) {
    return el('div.tile', {}, empty('Nothing to suggest yet',
      'Log a few meals first. The suggestions are built from foods you actually eat.'));
  }

  const wrap = el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Combinations that fit')));

  for (const idea of result.ideas) {
    const m = idea.macros;
    wrap.append(el('div.idea', {},
      el('div.idea-items', {},
        ...idea.items.map(i => el('div.idea-item', {},
          el('span.nm', {}, i.food.name),
          el('span.qt', {}, i.label)))),
      el('div.idea-macros', {},
        el('span', {}, el('b', {}, kcal(m.kcal)), ' kcal'),
        el('span', { style: { color: 'var(--m-p-ink)' } }, el('b', {}, Math.round(m.p)), ' P'),
        el('span', { style: { color: 'var(--m-c-ink)' } }, el('b', {}, Math.round(m.c)), ' C'),
        el('span', { style: { color: 'var(--m-f-ink)' } }, el('b', {}, Math.round(m.f)), ' F'),
        el('button.btn.sm', {
          style: { marginLeft: 'auto' },
          onclick: () => {
            for (const i of idea.items) {
              addEntry(dayKey(), {
                name: i.food.name, brand: i.food.brand, ref: i.food.id,
                per100: i.food.per100, serv: i.food.serv,
                grams: i.g, method: 'portion', grade: i.food.grade,
                meal: result.meal,
              });
            }
            toast(`Logged ${idea.items.length} item${idea.items.length > 1 ? 's' : ''}.`);
            ctx.go('today');
          },
        }, idea.items.length > 1 ? 'Log both' : 'Log it')),
    ));
  }
  return wrap;
}

function scheduleTile(sched, targets) {
  const now = new Date().getHours() + new Date().getMinutes() / 60;

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'How to spread the day')),
    el('div.tile.flush', {},
      ...sched.plan.map(p => {
        const past = p.at < now;
        return el('div.row', { style: past ? { opacity: '.45' } : {} },
          el('span.time.num', {}, hourLabel(p.at)),
          el('span.grow', {},
            el('div.title', {}, MEAL_LABELS[p.meal]),
            el('div.sub', {}, `${p.p} g protein · ${p.c} g carbs · ${p.f} g fat`)),
          el('span.kcal', {}, kcal(p.kcal)));
      })),
    el('div.note', {},
      el('div', {},
        (sched.knowWake
          ? `Timed from your actual wake at ${hourLabel(sched.wake)}. `
          : `Timed from a 07:00 wake — import Whoop and these shift to when you really get up. `)
        + `Protein is split into four roughly equal doses of about ${Math.round(targets.p / 4)} g. `
        + `Spreading it beats loading one meal, and that gap matters more the deeper the deficit gets.`)),
  );
}
