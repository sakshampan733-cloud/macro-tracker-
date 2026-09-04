/*
 * A goal with a deadline.
 *
 * "Lose 3 kg in two months" is how this actually gets thought about, and
 * setting it that way round is more useful than picking a weekly rate in
 * the abstract — the rate falls out of the goal.
 *
 * The screen's job after that is to be honest. It compares the pace the
 * goal needs against the pace actually happening and says plainly whether
 * the deadline is going to be met, rather than moving the finish line.
 */

import {
  el, sheet, toast, kcal, g, icon, dateLabel, confirmSheet, explain, append,
} from '../ui.js';
import { get, commit, dayKey, weightSeries } from '../store.js';
import { goalStatus, goalFeasibility, trendWeight, macroTargets, bestTDEE } from '../nutrition.js';
import { healthBars } from '../charts.js';

const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);

const PRESETS = [
  { label: '1 month',  days: 30 },
  { label: '2 months', days: 60 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 182 },
];

export function goalTile(s, ctx) {
  const st = goalStatus(s, s.profile);

  if (!st) {
    return el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Goal')),
      el('div.tile', {},
        el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'No goal set'),
        explain('A weight and a date. The app works out the pace it needs, tells you whether that pace is sensible before you commit, and then reports honestly on whether it is happening.'),
        el('button.btn.primary.block', { style: { marginTop: '12px' },
          onclick: () => openGoalEditor(ctx) }, icon('bolt', 16), 'Set a goal')));
  }

  const pct = Math.round(st.progress * 100);
  const tone = st.reached ? 'good'
    : st.onPace == null ? 'info'
    : st.onPace >= 0.85 ? 'good'
    : st.onPace >= 0.4 ? 'info' : 'warn';
  const colour = { good: 'var(--good-ink)', warn: 'var(--warn)', info: 'var(--m-p)' }[tone];

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Goal')),
    el('div.tile.tile-field', {
      style: { '--field': `color-mix(in srgb, ${colour} 18%, transparent)` },
      role: 'button', tabindex: '0',
      onclick: () => openGoalDetail(ctx),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGoalDetail(ctx); } },
    },
      el('div.between', {},
        el('div', {},
          el('div.micro', {}, st.reached ? 'Reached' : `${st.daysLeft} days left`),
          el('div.num', { style: { fontSize: '25px', marginTop: '3px' } },
            `${st.current} → ${st.targetKg} kg`)),
        el('div', { style: { textAlign: 'right' } },
          el('div.micro', {}, 'Progress'),
          el('div.num', { style: { fontSize: '25px', marginTop: '3px', color: colour } }, pct + '%'))),

      el('div', { style: {
        height: '7px', borderRadius: '4px', background: 'var(--line)',
        overflow: 'hidden', marginTop: '13px',
      } },
        el('div', { style: {
          height: '100%', width: Math.max(2, pct) + '%', background: colour,
          borderRadius: '4px', transition: 'width .7s cubic-bezier(.22,1,.36,1)',
        } })),

      el('div.fine', { style: { marginTop: '10px' } }, verdictLine(st)),
    ));
}

function verdictLine(st) {
  if (st.reached) return `Target reached with ${st.daysLeft} days to spare.`;
  if (st.actualPerWeek == null) {
    return `Needs ${Math.abs(st.neededPerWeek).toFixed(2)} kg a week from here. Not enough weigh-ins yet to say whether that is happening.`;
  }
  const need = Math.abs(st.neededPerWeek);
  const act = st.actualPerWeek;
  const rightWay = Math.sign(act) === Math.sign(st.remaining || -1);

  if (!rightWay && Math.abs(act) > 0.05) {
    return `Moving the wrong way at ${Math.abs(act).toFixed(2)} kg a week, against ${need.toFixed(2)} needed. The deadline is not reachable on this trajectory.`;
  }
  if (st.onPace >= 0.85) {
    return `Moving ${Math.abs(act).toFixed(2)} kg a week against ${need.toFixed(2)} needed`
      + (st.projectedDate ? ` — on track to arrive around ${dateLabel(st.projectedDate)}.` : '.');
  }
  return `Moving ${Math.abs(act).toFixed(2)} kg a week but ${need.toFixed(2)} is needed`
    + (st.projectedDate
        ? ` — at this pace it lands around ${dateLabel(st.projectedDate)}, not ${dateLabel(st.byDate)}.`
        : '. Worth either easing the deadline or tightening the intake.');
}

/* ── Detail ─────────────────────────────────────────────────────────── */

export function openGoalDetail(ctx) {
  const s = get();
  const st = goalStatus(s, s.profile);
  if (!st) return openGoalEditor(ctx);

  const series = trendWeight(weightSeries()).filter(p => p.date >= st.startDate);
  const bars = series.slice(-60).map(p => ({
    v: p.trend, label: `${p.date}: ${p.trend.toFixed(1)} kg`,
  }));

  const sh = sheet({
    title: 'Goal',
    body: el('div', {},
      el('div.tile.tile-hero', {},
        el('div', { style: { textAlign: 'center' } },
          el('div.micro', {}, st.reached ? 'Reached' : 'Remaining'),
          el('div.readout-main', { style: { fontSize: '42px' } },
            `${st.remaining > 0 ? '+' : ''}${st.remaining.toFixed(1)}`,
            el('span.readout-pm', {}, ' kg')),
          el('div.fine', { style: { marginTop: '4px' } },
            `${st.startKg} kg on ${dateLabel(st.startDate)} → ${st.targetKg} kg by ${dateLabel(st.byDate)}`))),

      bars.length > 3 ? el('div.tile', {},
        el('div.micro', { style: { marginBottom: '8px' } }, 'Trend weight since you started'),
        healthBars(bars, { h: 140, colour: 'var(--accent)', unit: ' kg', dp: 1 })) : null,

      el('div.tile', {},
        ...[
          ['Pace needed', `${Math.abs(st.neededPerWeek).toFixed(2)} kg/week`],
          ['Pace actual', st.actualPerWeek == null ? 'not enough data'
             : `${Math.abs(st.actualPerWeek).toFixed(2)} kg/week`],
          ['Days elapsed', `${st.elapsed} of ${st.totalDays}`],
          ['Projected arrival', st.projectedDate ? dateLabel(st.projectedDate) : '—'],
        ].map(([k, v]) => el('div.between', {
          style: { padding: '8px 0', borderBottom: '1px solid var(--line)' },
        },
          el('span', { style: { fontSize: '13.5px', color: 'var(--text-2)' } }, k),
          el('span.num', { style: { fontSize: '13.5px' } }, v)))),

      el('div.note', {}, el('div.fine', {}, verdictLine(st))),
    ),
    foot: el('div.btn-row', {},
      el('button.btn.danger', {
        onclick: async () => {
          sh.close();
          if (await confirmSheet({
            title: 'Clear this goal?',
            message: 'Your weight history stays; only the goal is removed.',
            confirmLabel: 'Clear goal', danger: true,
          })) { commit(st2 => { delete st2.goal; }, 'goal'); ctx.refresh(); }
        },
      }, 'Clear'),
      el('button.btn.primary', {
        onclick: () => { sh.close(); openGoalEditor(ctx); },
      }, 'Edit goal')),
  });
  return sh;
}

/* ── Setting one ────────────────────────────────────────────────────── */

/*
 * Pace, expressed as a share of bodyweight so it scales with the person.
 *
 * These pick a DATE rather than being a separate setting. "How fast" and
 * "by when" are two ways of asking the same question, and the app used to
 * ask both in different places and then let only one of them touch the
 * calories.
 */
const PACES = [
  { id: 'slow',   label: 'Slow',   pct: 0.0035, hint: 'Gentle. Training and mood barely notice it.' },
  { id: 'steady', label: 'Steady', pct: 0.0065, hint: 'The usual answer. Fast enough to see, slow enough to keep.' },
  { id: 'fast',   label: 'Fast',   pct: 0.0100, hint: 'Aggressive. Hungry, and harder to hold on to.' },
];

export function openGoalEditor(ctx) {
  const s = get();
  const existing = s.goal;
  const startKg = weightSeries().slice(-1)[0]?.kg || s.profile.weightKg;

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultEnd = new Date(); defaultEnd.setDate(defaultEnd.getDate() + 60);

  let byDate = existing?.byDate || iso(defaultEnd);

  const targetInput = el('input.num-in', {
    type: 'number', inputmode: 'decimal', step: '0.5', min: '30',
    value: String(existing?.targetKg ?? +(startKg - 3).toFixed(1)),
    style: { fontSize: '24px', textAlign: 'center', padding: '12px' },
  });

  /*
   * A real date field, not three month-chips.
   *
   * People have actual dates — a wedding, a match, a holiday, a check-up —
   * and "2 months" was never the thing they were aiming at. The chips
   * survive as a way to fill this in quickly, but they write into it
   * rather than replacing it.
   */
  const dateInput = el('input.num-in', {
    type: 'date', value: byDate, min: iso(tomorrow),
    'aria-label': 'Target date',
    style: { padding: '11px', width: '100%' },
  });

  const preview = el('div');
  const paceRow = el('div.chips');

  const daysOut = () => {
    const d = new Date(dateInput.value + 'T12:00:00');
    if (isNaN(d)) return 60;
    return Math.max(1, Math.round((d - new Date()) / 86400000));
  };

  /* A pace chip sets the date that pace implies for the target you typed. */
  for (const p of PACES) {
    paceRow.append(el('button.chip', {
      type: 'button', dataset: { pace: p.id },
      onclick: () => {
        const target = +targetInput.value || startKg;
        const perWeek = startKg * p.pct;
        const weeks = Math.abs(target - startKg) / Math.max(0.01, perWeek);
        const end = new Date();
        end.setDate(end.getDate() + Math.max(7, Math.round(weeks * 7)));
        dateInput.value = iso(end);
        render();
      },
    }, p.label));
  }

  function render() {
    const target = +targetInput.value || startKg;
    const days = daysOut();
    const f = goalFeasibility(startKg, target, days);

    /* Which pace chip this date currently corresponds to. */
    const pct = Math.abs(f.perWeek) / startKg;
    let nearest = null, best = Infinity;
    for (const p of PACES) {
      const d = Math.abs(pct - p.pct);
      if (d < best) { best = d; nearest = p; }
    }
    [...paceRow.children].forEach(c =>
      c.setAttribute('aria-pressed', String(c.dataset.pace === nearest?.id && best < 0.002)));

    const tone = f.verdict === 'sensible' ? 'good'
      : f.verdict === 'very gentle' ? 'info'
      : f.verdict === 'aggressive' ? 'info' : 'warn';

    /*
     * What this goal does to the food, shown before it is saved.
     *
     * The whole complaint was that setting a goal changed nothing you
     * could see. So the calorie target the goal implies is computed right
     * here, from the same functions the rest of the app uses, and shown
     * next to the pace it comes from.
     */
    const profile = { ...s.profile, rate: f.perWeek };
    const tdee = bestTDEE(s, profile);
    const t = macroTargets(profile, tdee.kcal);
    const floored = t.basis?.floored;

    append(preview,
      el('div.tile', {},
        el('div.between', {},
          el('div', {},
            el('div.micro', {}, 'Pace this needs'),
            el('div.num', { style: { fontSize: '23px', marginTop: '3px' } },
              `${Math.abs(f.perWeek).toFixed(2)} kg/wk`)),
          el('div', { style: { textAlign: 'right' } },
            el('div.micro', {}, 'Which means eating'),
            el('div.num', { style: { fontSize: '23px', marginTop: '3px' } },
              `${kcal(t.kcal)}`),
            /* The everyday level, not today's figure. A red-recovery hold
               or a carry can move the day off this, and showing 1,852 here
               while Home says 2,144 would look like one of them was wrong. */
            el('div.micro', { style: { marginTop: '2px' } }, 'kcal on a normal day'))),

        el('div.fine', { style: { marginTop: '9px' } },
          `${dateLabel(dateInput.value)} is ${days} day${days === 1 ? '' : 's'} away. `
          + `Maintenance is ${kcal(tdee.kcal)}, so this is `
          + (Math.round(t.kcal) === Math.round(tdee.kcal)
            ? 'maintenance.'
            : `${kcal(Math.abs(t.kcal - tdee.kcal))} ${t.kcal < tdee.kcal ? 'under' : 'over'} it.`)),

        /* Two different things can floor a target: an over-ambitious date,
           or a maintenance figure that already sits close to resting burn.
           Saying "the date asks too much" in the second case contradicts a
           verdict of "sensible pace" three lines below it. */
        floored
          ? el('div.fine', { style: { marginTop: '5px', color: 'var(--caution)' } },
              `Held at ${t.basis.floor.kcal} kcal, your resting burn. `
              + (Math.abs(f.pctPerWeek) > 0.7
                ? 'This date needs a deficit deeper than the app will point anyone at, so the '
                  + 'weight will arrive later than the date says.'
                : `The pace itself is fine — it is that your maintenance (${kcal(tdee.kcal)}) is `
                  + 'close enough to your resting burn that there is not much room to cut. '
                  + 'Moving more opens it up; eating less does not.'))
          : null,

        el('div', { class: 'note ' + tone, style: { marginTop: '12px' } },
          el('div', {},
            el('b', {}, feasibilityHead(f)),
            el('div.fine', { style: { marginTop: '3px' } }, feasibilityBody(f, startKg))))),
    );
  }

  targetInput.addEventListener('input', render);
  dateInput.addEventListener('input', render);
  dateInput.addEventListener('change', render);
  render();

  const sh = sheet({
    title: existing ? 'Edit goal' : 'Set a goal',
    body: el('div', {},
      el('div.tile', {},
        el('div.between', {},
          el('div', {},
            el('div.micro', {}, 'Starting from'),
            el('div.num', { style: { fontSize: '23px', marginTop: '3px' } }, `${startKg} kg`)),
          el('div', { style: { textAlign: 'right', flex: '0 0 130px' } },
            el('div.micro', { style: { marginBottom: '5px' } }, 'Target'),
            targetInput))),

      el('div.section-label', {}, el('span.micro', {}, 'How fast')),
      paceRow,
      el('div.fine', { style: { marginTop: '6px' } },
        PACES.map(p => `${p.label}: ${p.hint}`).join(' ')),

      el('div.section-label', { style: { marginTop: '14px' } },
        el('span.micro', {}, 'By when')),
      dateInput,

      el('div', { style: { height: '14px' } }),
      preview,

      explain('The pace is worked out from where you are now and how long is left, so it '
        + 'updates itself: fall behind and it steepens, get ahead and it eases. Your calorie '
        + 'target follows it. It will not steepen without limit — past about 1% of bodyweight '
        + 'a week the app holds the pace and lets the date slip instead.',
        { style: { marginTop: '12px' } }),
    ),
    foot: el('div.btn-row', {},
      existing ? el('button.btn.ghost.grow', {
        onclick: async () => {
          if (!(await confirmSheet({
            title: 'Clear this goal?',
            message: 'Your calorie target goes back to the pace set in your details.',
            confirmLabel: 'Clear it', danger: true,
          }))) return;
          commit(st => { delete st.goal; }, 'goal');
          toast('Goal cleared.');
          sh.close();
          ctx.refresh();
        },
      }, 'Clear') : null,
      el('button.btn.primary.grow', {
        onclick: () => {
          const target = +targetInput.value;
          if (!(target > 30 && target < 400)) { toast('That is not a weight in kg.', 'err'); return; }
          if (Math.abs(target - startKg) < 0.3) { toast('Pick a target different from where you are.', 'err'); return; }
          const days = daysOut();
          if (days < 1) { toast('Pick a date in the future.', 'err'); return; }

          const f = goalFeasibility(startKg, target, days);
          commit(st => {
            st.goal = {
              startKg: +startKg.toFixed(1),
              targetKg: +target.toFixed(1),
              startDate: existing?.startDate || dayKey(),
              byDate: dateInput.value,
              createdAt: Date.now(),
            };
            /* The join. macroTargets reads profile.rate, so the goal writes
               it — and app.js recomputes it every launch from how far you
               still have to go. */
            st.profile.rate = f.perWeek;
            st.profile.goal = f.perWeek < 0 ? 'cut' : f.perWeek > 0 ? 'gain' : 'maintain';
          }, 'goal');
          toast(`Goal set. ${kcal(macroTargets({ ...get().profile }, bestTDEE(get(), get().profile).kcal).kcal)} kcal a day.`);
          sh.close();
          ctx.refresh();
        },
      }, existing ? 'Save goal' : 'Set goal')),
  });
  return sh;
}

export const feasibilityHead = f => ({
  'sensible': 'A sensible pace',
  'very gentle': 'Very gentle',
  'aggressive': 'Aggressive but doable',
  'too fast': 'Too fast',
  'mostly fat gain': 'Faster than muscle can be built',
}[f.verdict]);

function feasibilityBody(f, startKg) {
  const pct = f.pctPerWeek.toFixed(2);
  if (f.verdict === 'too fast') {
    return `That is ${pct}% of your bodyweight a week. Past about 1% the weight still comes off, but a growing share of it is muscle. `
      + (f.suggestedDays ? `Give it ${f.suggestedDays} days instead and the same target becomes a pace worth attempting.` : 'Give it longer.');
  }
  if (f.verdict === 'mostly fat gain') {
    return `Gaining ${pct}% of bodyweight a week is faster than muscle can actually be built, so most of the surplus becomes fat. A slower build keeps the ratio in your favour.`;
  }
  if (f.verdict === 'very gentle') {
    return `${pct}% of bodyweight a week. Comfortably slow — this will barely be noticeable week to week, which is fine if you want it that way.`;
  }
  if (f.verdict === 'aggressive') {
    return `${pct}% of bodyweight a week. Achievable, but it will need the logging to be tight and it will feel like a deficit.`;
  }
  return `${pct}% of bodyweight a week, which is the range where the loss stays mostly fat and training quality holds up.`;
}
