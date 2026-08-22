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
import { goalStatus, goalFeasibility, trendWeight } from '../nutrition.js';
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
  const colour = { good: 'var(--good)', warn: 'var(--warn)', info: 'var(--m-p)' }[tone];

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

export function openGoalEditor(ctx) {
  const s = get();
  const existing = s.goal;
  const startKg = existing?.startKg
    ?? (weightSeries().slice(-1)[0]?.kg || s.profile.weightKg);

  let days = existing
    ? Math.max(7, Math.round((new Date(existing.byDate) - new Date(existing.startDate)) / 86400000))
    : 60;

  const targetInput = el('input.num-in', {
    type: 'number', inputmode: 'decimal', step: '0.5', min: '30',
    value: String(existing?.targetKg ?? +(startKg - 3).toFixed(1)),
    style: { fontSize: '24px', textAlign: 'center', padding: '12px' },
  });

  const preview = el('div');
  const presetRow = el('div.chips');

  const syncPresets = () => {
    [...presetRow.children].forEach(c =>
      c.setAttribute('aria-pressed', String(+c.dataset.days === days)));
  };

  for (const p of PRESETS) {
    presetRow.append(el('button.chip', {
      type: 'button', dataset: { days: String(p.days) },
      onclick: () => { days = p.days; syncPresets(); render(); },
    }, p.label));
  }

  function render() {
    const target = +targetInput.value || startKg;
    const f = goalFeasibility(startKg, target, days);
    const end = new Date(); end.setDate(end.getDate() + days);

    const tone = f.verdict === 'sensible' ? 'good'
      : f.verdict === 'very gentle' ? 'info'
      : f.verdict === 'aggressive' ? 'info' : 'warn';

    preview.replaceChildren(
      el('div.tile', {},
        el('div.between', {},
          el('div', {},
            el('div.micro', {}, 'Pace this needs'),
            el('div.num', { style: { fontSize: '23px', marginTop: '3px' } },
              `${Math.abs(f.perWeek).toFixed(2)} kg/wk`)),
          el('div', { style: { textAlign: 'right' } },
            el('div.micro', {}, 'By'),
            el('div.num', { style: { fontSize: '15px', marginTop: '5px' } }, iso(end)))),
        el('div', { class: 'note ' + tone, style: { marginTop: '12px' } },
          el('div', {},
            el('b', {}, feasibilityHead(f)),
            el('div.fine', { style: { marginTop: '3px' } }, feasibilityBody(f, startKg))))),
    );
  }

  targetInput.addEventListener('input', render);
  syncPresets();
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

      el('div.section-label', {}, el('span.micro', {}, 'By when')),
      presetRow,

      el('div', { style: { height: '14px' } }),
      preview,
    ),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        const target = +targetInput.value;
        if (!(target > 30 && target < 400)) { toast('That is not a weight in kg.', 'err'); return; }
        if (Math.abs(target - startKg) < 0.3) { toast('Pick a target different from where you are.', 'err'); return; }
        const end = new Date(); end.setDate(end.getDate() + days);
        commit(st => {
          st.goal = {
            startKg: +startKg.toFixed(1),
            targetKg: +target.toFixed(1),
            startDate: existing?.startDate || dayKey(),
            byDate: iso(end),
            createdAt: Date.now(),
          };
        }, 'goal');
        toast('Goal set.');
        sh.close();
        ctx.refresh();
      },
    }, existing ? 'Save goal' : 'Set goal'),
  });
  return sh;
}

const feasibilityHead = f => ({
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
