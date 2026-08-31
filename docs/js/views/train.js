/*
 * Training.
 *
 * Replaces the Plan tab, which was advice you had already read.
 *
 * The shape of this screen comes from one correction: people do not train
 * to a calendar. The plan is a rotation that advances when you train, so
 * doing Wednesday's session on Thursday is not a miss and a stray extra —
 * it is Thursday. Nothing here is ever late, and rest needs no declaring,
 * because a rest day is simply a day without a session.
 *
 * What the app owes you in return for that freedom is an honest account of
 * what you actually did: how often, what has not come round in a while,
 * and whether the effort you wrote down matches the effort your strap saw.
 */

import { el, clear, icon, sheet, toast, append, confirmSheet } from '../ui.js';
import { haptic } from '../feedback.js';
import {
  get, dayKey, shiftDay, trainState, trainTypes, typeById, saveType, removeType,
  rotation, setRotation, sessionFor, logSession, removeSession,
  sessions, nextUp, trainStats, trainGrid,
} from '../store.js';
import {
  GROUPS, GROUP_LABEL, coverage, sessionLoad, loadMismatch,
} from '../data/workouts.js';
import { rowsFor, healthSource, bandName } from '../applehealth.js';

export function renderTrain(root, ctx) {
  const s = get();
  const key = ctx.date || dayKey();
  clear(root);
  root.classList.add('stagger');

  append(root,
    el('div.between', { style: { marginBottom: '14px' } },
      el('h1', {}, 'Train'),
      el('button.btn.sm.ghost', { onclick: () => openRotation(ctx) }, 'My split')),
    todayCard(s, key, ctx),
    historyTile(ctx),
    coverageTile(ctx),
  );
}

/* ── One card, not two ──────────────────────────────────────────────── */

/*
 * "Did you train?" and "your strap noticed something" were two tiles
 * asking the same question a centimetre apart. They are one question, and
 * what the band saw is context for answering it rather than a separate
 * matter — so it is a line inside this card, never its own card.
 */
function todayCard(s, key, ctx) {
  const done = sessionFor(key);
  const rot = rotation();
  const suggestion = nextUp();
  const band = bandNotice(s, key);

  if (done) {
    const t = typeById(done.type);
    const load = sessionLoad(done);
    const mism = loadMismatch(load);
    return el('div.tile.train-done', {},
      el('div.between', {},
        el('div.flex', {}, icon('check', 18), el('h3', {}, t?.name || 'Session')),
        el('button.btn.sm.ghost', { onclick: () => openLogger(key, ctx, done) }, 'Edit')),
      el('div.fine', { style: { marginTop: '6px' } },
        [done.sets ? `${done.sets} hard sets` : null,
         done.minutes ? `${done.minutes} min` : null,
         done.strain != null ? `strain ${done.strain.toFixed(1)}` : null,
         done.source === 'manual' ? null : `confirmed from ${done.source === 'apple' ? 'Apple Health' : 'Whoop'}`,
        ].filter(Boolean).join(' · ')),
      done.note ? el('div.fine', { style: { marginTop: '3px' } }, done.note) : null,
      mism ? el('div.note.info', { style: { marginTop: '10px' } }, el('div', {},
        mism === 'sets-high'
          ? 'You logged a lot of work, but your day was an easy one by the strap. '
            + 'Either the sets were lighter than they felt, or the session was short '
            + 'enough not to move the day.'
          : 'Your strap saw a hard day and the log has very little in it. Worth adding '
            + 'the rest before you forget it — this is the number the coverage below reads.'))
        : null);
  }

  if (!rot.length) {
    return el('div.tile', {},
      el('h3', {}, 'What is your split?'),
      el('div.fine', { style: { margin: '6px 0 12px' } },
        'List the sessions you rotate through — back and biceps, chest and triceps, '
        + 'whatever yours is. No days attached: it moves on when you train, so taking '
        + 'a rest day never puts you behind.'),
      band ? el('div.fine', { style: { marginBottom: '12px' } }, band.line) : null,
      el('div.btn-row', {},
        el('button.btn.primary.grow', { onclick: () => openRotation(ctx) }, 'Set my split'),
        el('button.btn.ghost', { onclick: () => openLogger(key, ctx) }, 'Just log it')));
  }

  const t = typeById(suggestion);
  return el('div.tile.train-today', {},
    el('div.micro', {}, 'Next up'),
    el('h2', { style: { margin: '2px 0 4px' } }, t?.name || 'Anything'),
    el('div.fine', {}, groupLine(t)),
    band ? el('div.note.info', { style: { marginTop: '10px' } },
      el('div', {}, band.line)) : null,
    el('div.btn-row', { style: { marginTop: '13px' } },
      el('button.btn.primary.grow', {
        onclick: () => openLogger(key, ctx, { type: suggestion, ...(band?.data || {}) }),
      }, band ? `Yes — ${t?.name || 'log it'}` : `Log ${t?.name || 'session'}`),
      el('button.btn.ghost', {
        onclick: () => openLogger(key, ctx, { ...(band?.data || {}) }),
      }, 'Something else')));
}

/* What the strap saw today, as a sentence — never as a verdict. */
function bandNotice(s, key) {
  const mode = healthSource();
  if (!mode) return null;
  const row = rowsFor(s, mode === 'apple' ? 'apple' : 'all')?.[key];
  if (!row) return null;
  const strain = row.strain, mins = row.exerciseMin;
  if (!((strain != null && strain >= 10) || (mins != null && mins >= 20))) return null;
  const what = [
    mins != null ? `${Math.round(mins)} minutes of exercise` : null,
    strain != null ? `a day strain of ${strain.toFixed(1)}` : null,
  ].filter(Boolean).join(' and ');
  return {
    line: `${bandName()} recorded ${what} today. It cannot tell what the session was, `
        + 'so nothing has been written down.',
    data: { minutes: mins != null ? Math.round(mins) : null, strain: strain ?? null,
            source: mode === 'apple' ? 'apple' : 'whoop' },
  };
}

const groupLine = t => !t ? 'Log whatever you did.'
  : t.cardio || !t.groups?.length ? 'Cardio — tracked, but it does not count towards muscle coverage.'
  : t.groups.map(g => GROUP_LABEL[g] || g).join(' · ');

/* ── Four weeks, and a year behind it ───────────────────────────────── */

function historyTile(ctx) {
  const grid = trainGrid(28);
  const st = trainStats(28);
  const trained = grid.filter(d => d.session).length;

  return el('div.tile.tappable', {
    role: 'button', tabIndex: 0,
    onclick: () => openCalendar(ctx),
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCalendar(ctx); } },
  },
    el('div.between', { style: { marginBottom: '10px' } },
      el('h3', {}, 'Last four weeks', icon('chevron', 13)),
      el('span.micro', {}, `${trained} session${trained === 1 ? '' : 's'}`)),

    el('div.adh-grid', {}, ...grid.map(d => el('i.adh'
      + (d.session ? '.is-done' : '') + (d.today ? '.is-today' : ''), {
      title: d.session ? `${d.key} — ${typeById(d.session.type)?.name || 'trained'}`
                       : `${d.key} — rest`,
    }))),

    el('div.fine', { style: { marginTop: '10px' } },
      trained
        ? `${st.perWeek} a week. `
          + (st.daysSince === 0 ? 'Trained today.'
            : `Last session ${st.daysSince} day${st.daysSince === 1 ? '' : 's'} ago.`)
          + (st.longestGap >= 5 ? ` Longest break was ${st.longestGap} days.` : '')
        : 'Nothing logged yet. Tap for the full calendar.'));
}

/*
 * The calendar, one tap in rather than always on screen.
 *
 * A month grid is the right shape for "what did I do on the 14th" and the
 * wrong shape for "am I training enough", which is the question the tab
 * itself has to answer at a glance. So the squares stay on the tab and
 * this holds the detail.
 */
function openCalendar(ctx) {
  let offset = 0;
  const body = el('div');

  const draw = () => {
    clear(body);
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;           /* Monday-first */

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(el('i.cal-pad'));
    let trained = 0;
    for (let d = 1; d <= daysIn; d++) {
      const key = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sess = sessionFor(key);
      const future = key > dayKey();
      if (sess) trained++;
      cells.push(el('button.cal-day'
          + (sess ? '.is-done' : '') + (key === dayKey() ? '.is-today' : '')
          + (future ? '.is-future' : ''), {
        disabled: future,
        title: sess ? typeById(sess.type)?.name || 'trained' : key,
        onclick: () => { sh.close(); openLogger(key, ctx, sess || undefined); },
      },
        el('span.cal-n', {}, String(d)),
        sess ? el('span.cal-tag', {}, (typeById(sess.type)?.name || '·').slice(0, 8)) : null));
    }

    body.append(
      el('div.between', { style: { marginBottom: '10px' } },
        el('button.btn.sm.ghost', { onclick: () => { offset--; draw(); } }, '‹'),
        el('h3', {}, label),
        el('button.btn.sm.ghost', {
          disabled: offset >= 0,
          onclick: () => { if (offset < 0) { offset++; draw(); } },
        }, '›')),
      el('div.cal-head', {}, ...['M', 'T', 'W', 'T', 'F', 'S', 'S']
        .map(d => el('span.micro', {}, d))),
      el('div.cal-grid', {}, ...cells),
      el('div.fine', { style: { marginTop: '10px' } },
        `${trained} session${trained === 1 ? '' : 's'} this month. Tap any day to log or edit it.`));
  };
  draw();
  const sh = sheet({ title: 'Training calendar', body });
  return sh;
}

/* ── What has not come round lately ─────────────────────────────────── */

function coverageTile(ctx) {
  const recent = sessions(14);
  if (!recent.length) return null;
  const c = coverage(recent, trainTypes(), 14);

  const lines = [];
  if (c.untrained.length)
    lines.push(el('div.note.warn', {}, el('div', {},
      el('b', {}, `${cap(listOf(c.untrained.map(g => GROUP_LABEL[g])))} not trained in a fortnight.`),
      ' Not a rule you have broken — a rotation drifts, and this is the drift.')));
  else if (c.thin.length)
    lines.push(el('div.note.info', {}, el('div', {},
      `${cap(listOf(c.thin.map(g => GROUP_LABEL[g])))} came round once in two weeks. `
      + 'Once holds what you have; twice is where growth reliably starts.')));
  else
    lines.push(el('div.note', {}, el('div', {},
      `Every group has come round at least twice in the last fortnight, across `
      + `${c.total} session${c.total === 1 ? '' : 's'}. Nothing is drifting.`)));

  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, 'Last fortnight'),
      el('span.micro', {}, `${c.total} session${c.total === 1 ? '' : 's'}`)),
    el('div.bal-rows', {},
      ...GROUPS.map(g => el('div.bal-row', {},
        el('span.bal-name', {}, GROUP_LABEL[g]),
        el('span.bal-pips', {}, ...Array.from({ length: Math.max(3, c.hits[g]) }, (_, i) =>
          el('i' + (i < c.hits[g] ? '.on' : '')))),
        el('span.micro', {}, c.hits[g] === 0 ? 'none' : `${c.hits[g]}×`)))),
    c.cardio ? el('div.fine', { style: { marginBottom: '10px' } },
      `Plus ${c.cardio} cardio session${c.cardio === 1 ? '' : 's'}, which do not count towards muscle coverage.`) : null,
    ...lines);
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const listOf = a => a.length === 1 ? a[0]
  : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ── The split ──────────────────────────────────────────────────────── */

function openRotation(ctx) {
  const body = el('div');
  const draw = () => {
    clear(body);
    const rot = rotation();
    if (!rot.length) {
      body.append(el('div.fine', { style: { marginBottom: '12px' } },
        'Nothing in your rotation yet.'));
    }
    rot.forEach((id, i) => {
      const t = typeById(id);
      body.append(el('div.row', {},
        el('span.rot-n', {}, String(i + 1)),
        el('span.grow', {},
          el('div.title', {}, t?.name || 'Deleted workout'),
          el('div.sub', {}, groupLine(t))),
        el('button.btn.sm.ghost', {
          disabled: i === 0, 'aria-label': 'Move up',
          onclick: () => { const n = rot.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]];
            setRotation(n); draw(); ctx.refresh(); },
        }, '↑'),
        el('button.btn.sm.ghost', {
          'aria-label': 'Remove from rotation',
          onclick: () => { setRotation(rot.filter((_, j) => j !== i)); draw(); ctx.refresh(); },
        }, '×')));
    });
    body.append(
      el('div.btn-row', { style: { marginTop: '12px' } },
        el('button.btn.ghost.grow', {
          onclick: () => openTypePicker(id => {
            setRotation([...rotation(), id]); draw(); ctx.refresh();
          }, ctx, draw),
        }, icon('plus', 15), 'Add to rotation')));
  };
  draw();
  const sh = sheet({
    title: 'My split',
    body: el('div', {},
      el('div.fine', { style: { marginBottom: '12px' } },
        'The order you cycle through. It advances when you train, not when the date '
        + 'changes — skip a day, take a week off, and the next one up is still the next '
        + 'one up.'),
      body),
  });
  return sh;
}

function openTypePicker(onPick, ctx, refreshParent) {
  const list = el('div');
  const draw = () => {
    clear(list);
    for (const t of trainTypes()) {
      list.append(el('div.row', {},
        el('button.grow', { class: 'row-main', onclick: () => { onPick(t.id); haptic('tap'); sh.close(); } },
          el('div.title', {}, t.name),
          el('div.sub', {}, groupLine(t))),
        el('button.btn.sm.ghost', {
          'aria-label': `Edit ${t.name}`,
          onclick: () => openTypeEditor(t, () => { draw(); refreshParent?.(); ctx.refresh(); }),
        }, icon('edit', 14))));
    }
  };
  draw();
  const sh = sheet({
    title: 'Choose a workout',
    body: el('div', {}, list,
      el('button.btn.ghost', { style: { marginTop: '12px', width: '100%' },
        onclick: () => openTypeEditor(null, () => { draw(); refreshParent?.(); ctx.refresh(); }),
      }, icon('plus', 15), 'Build a new one')),
  });
  return sh;
}

/*
 * Building a workout.
 *
 * A name and the groups it covers, and nothing else is required — the
 * groups are the only part the app reasons about, and asking for more
 * before you can log anything is how a training tab goes unused.
 */
function openTypeEditor(existing, after) {
  const state = {
    name: existing?.name || '',
    groups: new Set(existing?.groups || []),
    cardio: !!existing?.cardio,
  };
  const nameIn = el('input', { type: 'text', placeholder: 'Chest & Triceps', value: state.name });
  const chips = el('div.chip-wrap');
  const drawChips = () => {
    clear(chips);
    for (const g of GROUPS) {
      chips.append(el('button.chip' + (state.groups.has(g) ? '.is-on' : ''), {
        disabled: state.cardio,
        onclick: () => { state.groups.has(g) ? state.groups.delete(g) : state.groups.add(g);
          drawChips(); },
      }, GROUP_LABEL[g]));
    }
    chips.append(el('button.chip' + (state.cardio ? '.is-on' : ''), {
      onclick: () => { state.cardio = !state.cardio; if (state.cardio) state.groups.clear(); drawChips(); },
    }, 'Cardio'));
  };
  drawChips();

  const sh = sheet({
    title: existing ? 'Edit workout' : 'New workout',
    body: el('div', {},
      nameIn,
      el('div.section-label', { style: { marginTop: '14px' } },
        el('span.micro', {}, 'What it trains')),
      chips,
      el('div.fine', {}, 'Pick every group the session covers. Cardio is tracked but does '
        + 'not count towards muscle coverage — it is not a muscle group.')),
    foot: el('div.btn-row', {},
      existing && !existing.id.startsWith('p-') ? el('button.btn.ghost', {
        onclick: () => confirmSheet({
          title: `Delete ${existing.name}?`,
          body: 'Sessions you already logged with it are kept.',
          confirm: 'Delete',
          onConfirm: () => { removeType(existing.id); sh.close(); after(); },
        }),
      }, 'Delete') : null,
      el('button.btn.primary.grow', {
        onclick: () => {
          const name = nameIn.value.trim();
          if (!name) { toast('Give it a name.', 'err'); return; }
          if (!state.cardio && !state.groups.size) { toast('Pick at least one group.', 'err'); return; }
          saveType({ id: existing?.id, name, groups: [...state.groups], cardio: state.cardio });
          haptic('success'); sh.close(); after();
        },
      }, 'Save')),
  });
  return sh;
}

/* ── Logging one session ────────────────────────────────────────────── */

function openLogger(key, ctx, prefill = {}) {
  const existing = sessionFor(key);
  const state = {
    type: prefill.type || existing?.type || nextUp() || trainTypes()[0]?.id,
    detail: !!existing?.exercises?.length,
    exercises: (existing?.exercises || []).slice(),
  };

  const typeRow = el('div.chip-wrap');
  const groupsLine = el('div.fine');
  const drawTypes = () => {
    clear(typeRow);
    for (const t of trainTypes()) {
      typeRow.append(el('button.chip' + (state.type === t.id ? '.is-on' : ''), {
        onclick: () => { state.type = t.id; drawTypes(); },
      }, t.name));
    }
    groupsLine.textContent = groupLine(typeById(state.type));
  };
  drawTypes();

  const setsIn = el('input.num-in', { type: 'number', inputmode: 'numeric', min: '0', max: '100',
    placeholder: 'hard sets', value: existing?.sets ?? '' });
  const minsIn = el('input.num-in', { type: 'number', inputmode: 'numeric', min: '0', max: '600',
    placeholder: 'minutes', value: prefill.minutes ?? existing?.minutes ?? '' });
  const noteIn = el('input', { type: 'text', placeholder: 'Note (optional)', value: existing?.note || '' });

  /*
   * The exercise list is folded away on purpose.
   *
   * Hard sets is the number that drives everything the app says about
   * load, and it takes three seconds. Exercises, reps and weights give a
   * fuller picture to the few who will enter them every single time, and
   * nothing at all from everyone else — so they are here for whoever
   * wants them and never in the way of logging.
   */
  const exWrap = el('div.ex-list');
  const drawEx = () => {
    clear(exWrap);
    state.exercises.forEach((ex, i) => {
      exWrap.append(el('div.ex-row', {},
        el('input', { type: 'text', placeholder: 'Exercise', value: ex.name || '',
          oninput: e => { state.exercises[i].name = e.target.value; } }),
        el('input.num-in', { type: 'number', inputmode: 'numeric', placeholder: 'sets',
          value: ex.sets ?? '', oninput: e => { state.exercises[i].sets = +e.target.value || null; } }),
        el('input.num-in', { type: 'text', inputmode: 'decimal', placeholder: 'kg × reps',
          value: ex.detail || '', oninput: e => { state.exercises[i].detail = e.target.value; } }),
        el('button.btn.sm.ghost', { 'aria-label': 'Remove',
          onclick: () => { state.exercises.splice(i, 1); drawEx(); } }, '×')));
    });
    exWrap.append(el('button.btn.sm.ghost', {
      onclick: () => { state.exercises.push({ name: '', sets: null, detail: '' }); drawEx(); },
    }, icon('plus', 14), 'Add exercise'));
  };
  drawEx();

  const detailBlock = el('div', { style: { display: state.detail ? 'block' : 'none' } },
    el('div.section-label', { style: { marginTop: '14px' } },
      el('span.micro', {}, 'Exercises')),
    exWrap);

  const sh = sheet({
    title: key === dayKey() ? 'Log today' : `Log ${key}`,
    body: el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'What was it')),
      typeRow,
      groupsLine,
      el('div.section-label', { style: { marginTop: '14px' } },
        el('span.micro', {}, 'How much')),
      el('div.flex', { style: { gap: '8px' } }, setsIn, minsIn),
      el('div.fine', { style: { marginTop: '5px' } },
        'Hard sets is the one that matters — sets taken close to failure. Leave it blank '
        + 'if you would rather not count.'),
      el('div', { style: { height: '12px' } }),
      noteIn,
      el('button.btn.sm.ghost', { style: { marginTop: '12px' },
        onclick: e => {
          state.detail = !state.detail;
          detailBlock.style.display = state.detail ? 'block' : 'none';
          e.currentTarget.textContent = state.detail ? 'Hide exercises' : 'Add exercises';
        },
      }, state.detail ? 'Hide exercises' : 'Add exercises'),
      detailBlock),
    foot: el('div.btn-row', {},
      existing ? el('button.btn.ghost', {
        onclick: () => confirmSheet({
          title: 'Remove this session?',
          body: 'The day goes back to being a rest day.',
          confirm: 'Remove',
          onConfirm: () => { removeSession(key); sh.close(); toast('Removed.'); ctx.refresh(); },
        }),
      }, 'Remove') : null,
      el('button.btn.primary.grow', {
        onclick: () => {
          const kept = state.exercises.filter(e => (e.name || '').trim());
          const setsFromEx = kept.reduce((a, e) => a + (e.sets || 0), 0);
          logSession(key, {
            type: state.type,
            sets: setsIn.value ? +setsIn.value : (setsFromEx || null),
            minutes: minsIn.value ? +minsIn.value : null,
            strain: prefill.strain ?? existing?.strain ?? null,
            note: noteIn.value.trim(),
            exercises: kept,
            source: prefill.source || existing?.source || 'manual',
          });
          haptic('success');
          toast(`${typeById(state.type)?.name || 'Session'} logged.`);
          sh.close();
          ctx.refresh();
        },
      }, existing ? 'Save' : 'Log it')),
  });
  return sh;
}
