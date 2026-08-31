/*
 * Training.
 *
 * This replaces the Plan tab, which was advice you had already read. The
 * question this screen answers instead is one that changes daily and that
 * nothing else in the app could answer: is the week you are training the
 * week you meant to train.
 *
 * Three things, in the order you need them. What today is meant to be.
 * What the last four weeks actually looked like. What the plan itself is
 * missing — because a schedule you set once in January can quietly have
 * no legs in it, and nothing will tell you.
 */

import { el, clear, icon, sheet, toast, append, confirmSheet } from '../ui.js';
import { haptic } from '../feedback.js';
import {
  get, dayKey, shiftDay, WEEKDAYS, weekdayOf, trainState, plannedFor,
  setPlanDay, sessionFor, logSession, removeSession, adherence,
} from '../store.js';
import { WORKOUTS, WORKOUT_LIST, weekBalance, QUALITIES } from '../data/workouts.js';
import { rowsFor, healthSource } from '../applehealth.js';

const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export function renderTrain(root, ctx) {
  const s = get();
  const key = ctx.date || dayKey();
  clear(root);
  root.classList.add('stagger');

  append(root,
    el('div.between', { style: { marginBottom: '14px' } },
      el('h1', {}, 'Train'),
      el('button.btn.sm.ghost', { onclick: () => openPlanEditor(ctx) }, 'Edit week')),
    todayCard(s, key, ctx),
    detectedCard(s, key, ctx),
    weekStrip(ctx),
    historyTile(),
    balanceTile(ctx),
  );
}

/* ── Today ──────────────────────────────────────────────────────────── */

function todayCard(s, key, ctx) {
  const planned = plannedFor(key);
  const done = sessionFor(key);
  const plan = trainState().plan || {};
  const hasPlan = Object.keys(plan).length > 0;

  if (!hasPlan) {
    return el('div.tile', {},
      el('h3', {}, 'No week set yet'),
      el('div.fine', { style: { margin: '6px 0 12px' } },
        'Tell the app what a normal week looks like — Monday push, Tuesday pull, '
        + 'whatever yours is. It can then tell you what today is for, and notice '
        + 'when a muscle group quietly drops out of your month.'),
      el('button.btn.primary', { onclick: () => openPlanEditor(ctx) }, 'Set my week'));
  }

  if (done) {
    const w = WORKOUTS[done.type];
    return el('div.tile.train-done', {},
      el('div.between', {},
        el('div.flex', {}, icon('check', 18), el('h3', {}, `${w?.name || done.type} — done`)),
        el('button.btn.sm.ghost', { onclick: () => openLogger(key, ctx, done) }, 'Edit')),
      el('div.fine', { style: { marginTop: '6px' } },
        [done.minutes ? `${done.minutes} min` : null,
         done.strain != null ? `strain ${done.strain.toFixed(1)}` : null,
         done.source === 'whoop' ? 'confirmed from Whoop'
           : done.source === 'apple' ? 'confirmed from Apple Health' : 'logged by hand',
        ].filter(Boolean).join(' · ')),
      done.note ? el('div.fine', { style: { marginTop: '4px' } }, done.note) : null);
  }

  if (planned === 'rest') {
    return el('div.tile', {},
      el('h3', {}, 'Rest day'),
      el('div.fine', { style: { marginTop: '6px' } },
        'On the plan, not an absence. Training is the stimulus; this is where the '
        + 'adaptation happens.'),
      el('button.btn.ghost', { style: { marginTop: '12px' },
        onclick: () => openLogger(key, ctx) }, 'I trained anyway'));
  }

  if (!planned) {
    return el('div.tile', {},
      el('h3', {}, 'Nothing planned today'),
      el('div.fine', { style: { marginTop: '6px' } }, 'Log a session if you did one.'),
      el('button.btn.ghost', { style: { marginTop: '12px' },
        onclick: () => openLogger(key, ctx) }, 'Log a session'));
  }

  const w = WORKOUTS[planned];
  return el('div.tile.train-today', {},
    el('div.micro', {}, 'Today'),
    el('h2', { style: { margin: '2px 0 6px' } }, w?.name || planned),
    w ? el('div.fine', {}, w.how) : null,
    el('div.btn-row', { style: { marginTop: '13px' } },
      el('button.btn.primary.grow', {
        onclick: () => openLogger(key, ctx, { type: planned }),
      }, 'Did it'),
      el('button.btn.ghost', {
        onclick: () => { logSession(key, { type: 'rest', skipped: true, source: 'manual' });
          haptic('tap'); toast('Marked as skipped.'); ctx.refresh(); },
      }, 'Skipped')));
}

/* ── What the band noticed ──────────────────────────────────────────── */

/*
 * Suggested, never assumed.
 *
 * A strap reports a hard hour; it cannot report that the hour was legs, or
 * that it was carrying furniture rather than training. Writing that into
 * the record unasked would turn the adherence history into fiction, which
 * is the one thing that would make this screen worth less than nothing.
 * So it offers what it saw and waits.
 */
function detectedCard(s, key, ctx) {
  if (sessionFor(key)) return null;
  const mode = healthSource();
  if (!mode) return null;

  const rows = rowsFor(s, mode === 'apple' ? 'apple' : 'all');
  const row = rows?.[key];
  if (!row) return null;

  const strain = row.strain;
  const mins = row.exerciseMin;
  const hard = (strain != null && strain >= 10) || (mins != null && mins >= 20);
  if (!hard) return null;

  const planned = plannedFor(key);
  const what = [
    mins != null ? `${Math.round(mins)} minutes of exercise` : null,
    strain != null ? `a day strain of ${strain.toFixed(1)}` : null,
  ].filter(Boolean).join(' and ');
  const band = mode === 'apple' ? 'Your Apple Watch' : 'Your Whoop';

  return el('div.tile.train-detect', {},
    el('div.flex', {}, icon('bolt', 16), el('h3', {}, 'Did you train today?')),
    el('div.fine', { style: { margin: '6px 0 12px' } },
      `${band} recorded ${what}. It cannot tell what the session was, so nothing `
      + 'has been written down.'),
    el('div.btn-row', {},
      planned && planned !== 'rest'
        ? el('button.btn.primary.grow', {
            onclick: () => { logSession(key, { type: planned, minutes: mins ? Math.round(mins) : null,
              strain, source: mode === 'apple' ? 'apple' : 'whoop' });
              haptic('success'); toast(`${WORKOUTS[planned]?.name} logged.`); ctx.refresh(); },
          }, `Yes — ${WORKOUTS[planned]?.name || planned}`)
        : null,
      el('button.btn.ghost.grow', {
        onclick: () => openLogger(key, ctx, { minutes: mins ? Math.round(mins) : null, strain,
          source: mode === 'apple' ? 'apple' : 'whoop' }),
      }, planned && planned !== 'rest' ? 'Something else' : 'Yes, log it')));
}

/* ── The week at a glance ───────────────────────────────────────────── */

function weekStrip(ctx) {
  const today = dayKey();
  const monday = shiftDay(today, -((new Date(today + 'T12:00:00').getDay() + 6) % 7));
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const key = shiftDay(monday, i);
    const wd = WEEKDAYS[i];
    const planned = trainState().plan?.[wd];
    const done = sessionFor(key);
    const future = key > today;
    const missed = planned && planned !== 'rest' && !done && !future && key !== today;
    cells.push(el('button.wk-cell'
        + (done && !done.skipped ? '.is-done' : '')
        + (missed || done?.skipped ? '.is-missed' : '')
        + (key === today ? '.is-today' : ''), {
      onclick: () => openLogger(key, ctx, done || (planned ? { type: planned } : undefined)),
      title: `${key} — ${planned ? WORKOUTS[planned]?.name || planned : 'nothing planned'}`,
    },
      el('span.wk-day', {}, DAY_LABEL[wd]),
      el('span.wk-what', {}, done && !done.skipped ? (WORKOUTS[done.type]?.name || '—')
        : planned === 'rest' ? 'Rest'
        : planned ? WORKOUTS[planned]?.name || planned : '—')));
  }
  return el('div.tile', {},
    el('div.tile-head', {}, el('h3', {}, 'This week')),
    el('div.wk-strip', {}, ...cells));
}

/* ── Four weeks of it ───────────────────────────────────────────────── */

function historyTile() {
  const days = adherence(28);
  const planned = days.filter(d => d.planned).length;
  const hit = days.filter(d => d.planned && d.done && !d.done.skipped).length;
  const missed = days.filter(d => d.missed).length;
  const extra = days.filter(d => d.extra && !d.done.skipped).length;

  if (!planned && !extra) {
    return el('div.tile', {},
      el('div.tile-head', {}, el('h3', {}, 'Last four weeks')),
      el('div.fine', {}, 'Nothing to compare yet. Set a week and log a session or two.'));
  }

  const pct = planned ? Math.round((hit / planned) * 100) : null;
  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, 'Last four weeks'),
      pct != null ? el('span.micro', {}, `${hit} of ${planned} sessions`) : null),

    el('div.adh-grid', {}, ...days.map(d => el('i.adh'
      + (d.done && !d.done.skipped ? '.is-done' : d.missed || d.done?.skipped ? '.is-missed'
        : d.rest ? '.is-rest' : '')
      + (d.today ? '.is-today' : ''), {
      title: `${d.key} — ${d.done && !d.done.skipped ? (WORKOUTS[d.done.type]?.name || 'trained')
        : d.missed ? 'missed ' + (WORKOUTS[d.planned]?.name || '') : d.rest ? 'rest' : 'nothing planned'}`,
    }))),

    el('div.fine', { style: { marginTop: '10px' } },
      pct != null
        ? `You did ${pct}% of what you planned.`
          + (missed ? ` ${missed} session${missed === 1 ? '' : 's'} missed.` : '')
          + (extra ? ` ${extra} session${extra === 1 ? '' : 's'} you had not planned.` : '')
        : `${extra} session${extra === 1 ? '' : 's'} logged, none of them planned.`));
}

/* ── What the plan itself is missing ────────────────────────────────── */

/*
 * A schedule set once can quietly have no legs in it, and nothing in a
 * training app usually says so — it will happily record perfect adherence
 * to a bad week. This reads the plan rather than the log, because that is
 * where the omission actually lives.
 */
function balanceTile(ctx) {
  const plan = trainState().plan || {};
  const ids = WEEKDAYS.map(d => plan[d]).filter(Boolean);
  if (!ids.length) return null;

  const b = weekBalance(ids);
  const lines = [];
  if (b.untrained.length)
    lines.push(el('div.note.warn', {}, el('div', {},
      el('b', {}, `Nothing in your week trains ${listOf(b.untrained)}.`),
      ' A week you follow perfectly still leaves that untrained — the plan is what '
      + 'needs changing, not your adherence.')));
  if (b.thin.length)
    lines.push(el('div.note.info', {}, el('div', {},
      `${cap(listOf(b.thin))} ${b.thin.length === 1 ? 'gets' : 'get'} one session a week. `
      + 'That holds what you have. Twice is where growth reliably starts.')));
  if (!lines.length)
    lines.push(el('div.note', {}, el('div', {},
      `Every group gets at least two sessions across ${b.sessions} training days. `
      + 'Nothing is being quietly skipped.')));

  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, 'What your week covers'),
      el('span.micro', {}, `${b.sessions} training day${b.sessions === 1 ? '' : 's'}`)),
    el('div.bal-rows', {},
      ...Object.entries(b.hits).filter(([g]) => g !== 'full body').map(([g, n]) =>
        el('div.bal-row', {},
          el('span.bal-name', {}, cap(g)),
          el('span.bal-pips', {}, ...Array.from({ length: Math.max(3, n) }, (_, i) =>
            el('i' + (i < n ? '.on' : '')))),
          el('span.micro', {}, n === 0 ? 'none' : `${n}×`)))),
    ...lines);
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const listOf = a => a.length === 1 ? a[0]
  : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ── Editing the week ───────────────────────────────────────────────── */

function openPlanEditor(ctx) {
  const body = el('div');
  const draw = () => {
    clear(body);
    const plan = trainState().plan || {};
    for (const wd of WEEKDAYS) {
      const cur = plan[wd];
      body.append(el('button.row', {
        onclick: () => openPicker(wd, () => { draw(); ctx.refresh(); }),
      },
        el('span.grow', {},
          el('div.title', {}, DAY_LABEL[wd]),
          el('div.sub', {}, cur ? (WORKOUTS[cur]?.name || cur) : 'nothing set')),
        icon('chevron', 14)));
    }
  };
  draw();
  return sheet({
    title: 'Your week',
    body: el('div', {},
      el('div.fine', { style: { marginBottom: '12px' } },
        'Set it once. Rest days count — putting them on the plan is what lets the app '
        + 'tell a day off from a missed session.'),
      body),
  });
}

function openPicker(weekday, after) {
  const s = sheet({
    title: DAY_LABEL[weekday],
    body: el('div', {},
      el('button.row', {
        onclick: () => { setPlanDay(weekday, null); s.close(); after(); },
      }, el('span.grow', {}, el('div.title', {}, 'Nothing set'))),
      ...WORKOUT_LIST.map(w => el('button.row', {
        onclick: () => { setPlanDay(weekday, w.id); haptic('tap'); s.close(); after(); },
      },
        el('span.grow', {},
          el('div.title', {}, w.name),
          el('div.sub', {}, w.quality ? QUALITIES[w.quality] : w.why)),
        icon('chevron', 14)))),
  });
  return s;
}

/* ── Logging one session ────────────────────────────────────────────── */

function openLogger(key, ctx, prefill = {}) {
  const existing = sessionFor(key);
  const state = {
    type: prefill.type || existing?.type || plannedFor(key) || 'fullbody',
    minutes: prefill.minutes ?? existing?.minutes ?? '',
    note: existing?.note || '',
  };

  const typeRow = el('div.chip-wrap');
  const drawTypes = () => {
    clear(typeRow);
    for (const w of WORKOUT_LIST) {
      typeRow.append(el('button.chip' + (state.type === w.id ? '.is-on' : ''), {
        onclick: () => { state.type = w.id; drawTypes(); drawWhy(); },
      }, w.name));
    }
  };
  const why = el('div.fine');
  const drawWhy = () => {
    const w = WORKOUTS[state.type];
    why.textContent = w ? w.why : '';
  };
  drawTypes(); drawWhy();

  const mins = el('input.num-in', {
    type: 'number', inputmode: 'numeric', min: '0', max: '600',
    placeholder: 'minutes', value: state.minutes,
  });
  const note = el('input', { type: 'text', placeholder: 'Note (optional)', value: state.note });

  const sh = sheet({
    title: key === dayKey() ? 'Log today' : `Log ${key}`,
    body: el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'What was it')),
      typeRow,
      why,
      el('div', { style: { height: '14px' } }),
      el('div.section-label', {}, el('span.micro', {}, 'How long')),
      mins,
      el('div', { style: { height: '12px' } }),
      note),
    foot: el('div.btn-row', {},
      existing ? el('button.btn.ghost', {
        onclick: () => confirmSheet({
          title: 'Remove this session?',
          body: 'The day goes back to whatever the plan says.',
          confirm: 'Remove',
          onConfirm: () => { removeSession(key); sh.close(); toast('Removed.'); ctx.refresh(); },
        }),
      }, 'Remove') : null,
      el('button.btn.primary.grow', {
        onclick: () => {
          logSession(key, {
            type: state.type,
            minutes: mins.value ? +mins.value : null,
            strain: prefill.strain ?? existing?.strain ?? null,
            note: note.value.trim(),
            source: prefill.source || existing?.source || 'manual',
            skipped: false,
          });
          haptic('success');
          toast(`${WORKOUTS[state.type]?.name} logged.`);
          sh.close();
          ctx.refresh();
        },
      }, existing ? 'Save' : 'Log it')),
  });
  return sh;
}
