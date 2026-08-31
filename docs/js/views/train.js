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
  GROUPS, GROUP_LABEL, coverage,
} from '../data/workouts.js';
import {
  EXERCISES, exerciseById, exercisesFor, setsByGroup, volumeBand, bandVerdict,
  EFFORT, effortById,
} from '../data/exercises.js';
import { rowsFor, healthSource, bandName, canMeasure } from '../applehealth.js';
import { strainBaseline, sessionIntensity, disagreement } from '../intensity.js';
import { appleChart } from '../charts.js';

export function renderTrain(root, ctx) {
  const s = get();
  const key = ctx.date || dayKey();
  clear(root);
  root.classList.add('stagger');

  append(root,
    el('div.between', { style: { marginBottom: '14px' } },
      el('h1', {}, 'Train'),
      el('button.btn.sm.ghost', { onclick: () => openRotation(ctx) }, 'My split')),
    /*
     * Training only.
     *
     * What the training is doing to the body — whether the weight is
     * responding, whether the whole picture holds together — moved to the
     * Body tab, where everything else about the body already lives. This
     * screen logs sessions and reports on the sessions themselves.
     */
    todayCard(s, key, ctx),
    recentTile(s, ctx),
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
    const base = strainBaseline(rowsFor(s, 'all'));
    const planned = (t?.plan || []).reduce((a, x) => a + (x.sets || 0), 0) || null;
    const inten = sessionIntensity(done, { baseline: base, plannedSets: planned });
    const dis = disagreement(inten);
    return el('div.tile.train-done', {},
      el('div.between', {},
        el('div.flex', {}, icon('check', 18), el('h3', {}, t?.name || 'Session')),
        el('button.btn.sm.ghost', { onclick: () => openLogger(key, ctx, done) }, 'Edit')),
      el('div.fine', { style: { marginTop: '6px' } },
        [done.sets ? `${done.sets} hard sets` : null,
         done.effort ? effortById(done.effort)?.label.toLowerCase() : null,
         done.minutes ? `${done.minutes} min` : null,
         done.strain != null ? `strain ${done.strain.toFixed(1)}` : null,
         done.source === 'manual' ? null : `confirmed from ${done.source === 'apple' ? 'Apple Health' : 'Whoop'}`,
        ].filter(Boolean).join(' · ')),
      done.note ? el('div.fine', { style: { marginTop: '3px' } }, done.note) : null,

      /* Today's reading, in the card for today, rather than only as one
         bar in a chart further down. */
      inten.score != null ? el('button.today-inten', {
        onclick: () => openSession(key, ctx),
      },
        el('div.between', {},
          el('span.micro', {}, 'How hard that was', icon('chevron', 11)),
          el('span.inten-label' + (inten.score >= 0.62 ? '.is-hard'
            : inten.score >= 0.4 ? '.is-mid' : '.is-easy'), {}, inten.label)),
        el('div.fine', { style: { marginTop: '4px' } },
          inten.parts.map(p => p.why).filter(Boolean).join(' · ')
          || `from ${inten.sources} source${inten.sources === 1 ? '' : 's'}`)) : null,

      dis ? el('div.note.info', { style: { marginTop: '10px' } }, el('div', {},
        dis.high === 'sets' && dis.low === 'strap'
          ? 'A lot of sets, but the day barely moved your strap compared with your usual. '
            + 'Either they were lighter than they felt, or the session was short enough '
            + 'not to register across the whole day.'
        : dis.high === 'strap' && dis.low === 'sets'
          ? 'Your strap saw a much bigger day than the log accounts for. Either there is '
            + 'work missing from it, or something outside the gym was hard today.'
        : dis.high === 'you' && dis.low === 'strap'
          ? 'It felt hard, and the day did not read as hard on your strap. A short, brutal '
            + 'session does that — the strap measures the whole day, not the hour.'
        : dis.high === 'strap' && dis.low === 'you'
          ? 'Your strap saw a heavy day and you rated it easy. Worth knowing which one you '
            + 'trust before you plan tomorrow.'
        : 'The sets and how it felt do not quite agree. Neither is wrong — they measure '
          + 'different things.'))
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
      /* A confirmation, not a call to action. Solid accent on "yes, I did
         the thing I already did" made the loudest element on the screen
         the least consequential one. */
      el('button.btn.confirm.grow', {
        onclick: () => openLogger(key, ctx, { type: suggestion, ...(band?.data || {}) }),
      }, band ? `Yes — ${t?.name || 'log it'}` : `Log ${t?.name || 'session'}`),
      el('button.btn.ghost', {
        /* "Something else" told you nothing about what would happen. This
           opens the same logger with no workout preselected, which is what
           you want when today was not the one that came up next. */
        onclick: () => openLogger(key, ctx, { ...(band?.data || {}), pick: true }),
      }, 'A different one')));
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

/* What a workout is, in one line: its groups, plus its plan if it has one. */
function planLine(t) {
  if (!t) return 'No longer in your library.';
  const plan = t.plan || [];
  if (!plan.length) return groupLine(t);
  const sets = plan.reduce((a, x) => a + (x.sets || 0), 0);
  return `${plan.length} exercise${plan.length === 1 ? '' : 's'} · ${sets} sets`;
}

const groupLine = t => !t ? 'Log whatever you did.'
  : t.cardio || !t.groups?.length ? 'Cardio — tracked, but it does not count towards muscle coverage.'
  : t.groups.map(g => GROUP_LABEL[g] || g).join(' · ');


/*
 * The last few sessions, said in words.
 *
 * This was a bar chart of a composite score, and the honest feedback on it
 * was that nobody could tell what the bars meant. That was fair: the
 * height was an invented number on no stated scale, so the only way to
 * read it was to trust it, and an unexplained number is exactly the kind
 * of thing this app is supposed to avoid.
 *
 * The underlying comparison is worth keeping — a session is hard or easy
 * relative to your own normal, not to a printed scale. So it is stated
 * instead of drawn: what you trained, how it felt, how much you did, and
 * where the strap put the day next to your usual. No axis to decode.
 */
function recentTile(s, ctx) {
  const list = sessions(56).slice(-8).reverse();
  if (!list.length) return null;

  const base = strainBaseline(rowsFor(s, 'all'));

  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, 'Recent sessions'),
      base ? el('span.micro', {}, `your usual strain ${base.mean}`) : null),

    el('div.sess-list', {}, ...list.map(sess => {
      const t = typeById(sess.type);
      const eff = sess.effort ? effortById(sess.effort) : null;
      const rel = (sess.strain != null && base)
        ? sess.strain - base.mean : null;
      return el('button.sess-row', {
        onclick: () => openSession(sess.date, ctx),
      },
        el('span.grow', {},
          el('div.title', {}, t?.name || 'Session'),
          el('div.sub', {},
            [dayLabel(sess.date),
             sess.sets ? `${sess.sets} sets` : null,
             sess.minutes ? `${sess.minutes} min` : null,
            ].filter(Boolean).join(' · '))),
        rel != null ? el('span.sess-strain' + (rel >= 1 ? '.is-up' : rel <= -1 ? '.is-down' : ''), {},
          `${rel >= 0 ? '+' : ''}${rel.toFixed(1)}`) : null,
        eff ? el('span.eff-tag.eff-' + eff.id, {}, eff.label) : null,
        icon('chevron', 13));
    })),

    el('div.fine', { style: { marginTop: '10px' } },
      base
        ? 'The number beside each is how that day\u2019s strain compared with your own '
          + `average of ${base.mean} — plus means harder than your normal day, minus means easier.`
        /* Strain is a Whoop score. Offering it to an Apple Watch owner as
           something they could unlock names a device they do not own and
           promises a number their hardware will never produce. */
        : canMeasure('strain')
          ? 'Rate how a session felt and it shows here. Once your strap has a few weeks '
            + 'of data, each day is also compared against your own average strain.'
          : 'Rate how a session felt and it shows here, alongside what you logged.'));
}

function dayLabel(key) {
  const today = dayKey();
  if (key === today) return 'Today';
  if (key === shiftDay(today, -1)) return 'Yesterday';
  return new Date(key + 'T12:00:00')
    .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}


/*
 * One session, opened.
 *
 * The composite intensity existed and was never shown as anything but a
 * word. That is the wrong way round: a single adjective is exactly the
 * part you cannot argue with, and the two things it was computed from —
 * what you said, and what the strap recorded against your own average —
 * are the interesting half. Both are drawn here, side by side, and the
 * curve underneath is every session before it on the same scale.
 *
 * The strap is the harder witness to fool, which is the point: you can
 * tell the app you pushed, and if the day never moved off your baseline
 * it will show you both readings and let you decide which you believe.
 */
function openSession(key, ctx) {
  const s = get();
  const sess = sessionFor(key);
  if (!sess) return openLogger(key, ctx);

  const t = typeById(sess.type);
  const base = strainBaseline(rowsFor(s, 'all'));
  const planned = (t?.plan || []).reduce((a, x) => a + (x.sets || 0), 0) || null;
  const inten = sessionIntensity(sess, { baseline: base, plannedSets: planned });
  const dis = disagreement(inten);

  /* `said` is the caption for a witness that exists but has nothing to
     explain — your own rating is a word, not a derivation. */
  const witness = (label, part, missing, said) => {
    if (!part) {
      return el('div.wit', {},
        el('div.micro', {}, label),
        el('div.wit-v.is-none', {}, '—'),
        el('div.fine', {}, missing));
    }
    return el('div.wit', {},
      el('div.micro', {}, label),
      el('div.wit-v', {}, Math.round(part.v * 100) + '%'),
      el('div.wit-bar', {}, el('i', { style: { width: Math.round(part.v * 100) + '%' } })),
      el('div.fine', {}, part.why || said || ''));
  };

  const you = inten.parts.find(p => p.from === 'you');
  const strap = inten.parts.find(p => p.from === 'strap');
  const sets = inten.parts.find(p => p.from === 'sets');

  /* Every scored session, so today has something to sit against. */
  const history = sessions(180)
    .map(x => {
      const ty = typeById(x.type);
      const pl = (ty?.plan || []).reduce((a, y) => a + (y.sets || 0), 0) || null;
      return { date: x.date, i: sessionIntensity(x, { baseline: base, plannedSets: pl }) };
    })
    .filter(x => x.i.score != null)
    .slice(-40);

  sheet({
    title: t?.name || 'Session',
    body: el('div.sess-detail', {},
      el('div.metric-hero', {},
        el('div', {},
          el('div.micro', {}, dayLabel(key)),
          el('div.metric-big', {}, Math.round((inten.score || 0) * 100),
            el('span.metric-unit', {}, 'intensity'))),
        el('div.metric-place', {},
          el('div.metric-pct' + (inten.score >= 0.62 ? '.is-hard'
            : inten.score >= 0.4 ? '.is-mid' : '.is-easy'), {}, inten.label),
          el('div.micro', {}, `from ${inten.sources} source${inten.sources === 1 ? '' : 's'}`))),

      el('div.wit-grid', {},
        witness('What you said', you, 'Not rated. Tap edit to add it.',
          effortById(sess.effort)?.label),
        witness('What your strap saw', strap,
          base ? 'No strain recorded for this day.'
               : 'Needs a few weeks of strap data to compare against.'),
        witness('What you logged', sets, 'No set count on this session.')),

      dis ? el('div.note.info', {}, el('div', {},
        dis.high === 'you' && dis.low === 'strap'
          ? 'You rated this harder than the day reads on your strap. A short, brutal '
            + 'session does exactly that — the strap measures the whole day, not the hour.'
        : dis.high === 'strap' && dis.low === 'you'
          ? 'Your strap saw a much bigger day than you rated it. Worth knowing which one '
            + 'you trust before you plan tomorrow.'
        : dis.high === 'sets' && dis.low === 'strap'
          ? 'A lot of sets, and the day barely moved against your usual. Either they were '
            + 'lighter than they felt, or the session was too short to register.'
        : 'The two readings do not agree. Neither is wrong — they measure different things.'))
        : null,

      history.length >= 2
        ? el('div', {},
            el('div.section-label', {}, el('span.micro', {}, `Last ${history.length} sessions`)),
            appleChart(history.map(h => ({ v: Math.round(h.i.score * 100), date: h.date,
              label: `${h.date}: ${h.i.label}` })),
              { colour: 'var(--ring-move)', h: 130, zero: true, unit: '', dp: 0 }))
        : el('div.fine', {}, 'Log a few more and a curve appears here.'),

      el('div.fine', {},
        base
          ? `Strain is read against your own average of ${base.mean} rather than a printed `
            + 'scale — a ten is a hard day for one person and a walk for another.'
          : 'Connect a strap and its reading joins this.')),
    foot: el('div.btn-row', {},
      el('button.btn.ghost.grow', { onclick: () => openLogger(key, ctx, sess) }, 'Edit session')),
  });
}


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
      /* The whole row opens the workout. Editing what a session consists
         of was previously reachable only by starting to add a second copy
         of it to the rotation, which is not a place anyone would look. */
      body.append(el('div.row', {},
        el('span.rot-n', {}, String(i + 1)),
        /* The chevron used to sit inside .title, which is clipped with an
           ellipsis — so the one thing signalling "this opens" was the
           first thing cut off, and the tap target was the text alone
           rather than the row. Both fixed: the button fills the row's
           height and carries its own chevron outside the clipping. */
        el('button.row-main.grow', {
          'aria-label': `Edit ${t?.name || 'workout'}`,
          onclick: () => t && openTypeEditor(t, () => { draw(); ctx.refresh(); }),
        },
          el('span.rm-text', {},
            el('div.title', {}, t?.name || 'Deleted workout'),
            el('div.sub', {}, planLine(t))),
          icon('chevron', 14)),
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
 * Building a workout, in as much detail as you want.
 *
 * Two levels, and the first one is complete on its own. A name and the
 * groups it covers is a whole workout, and for most people it always will
 * be. Below that, for anyone who wants to write down that chest day is
 * four sets of incline press, three of pec deck and three of cable fly,
 * the exercises and their sets — and once those exist the app can say
 * something about the amount of work, which it could never do from a name.
 */
function openTypeEditor(existing, after) {
  const state = {
    name: existing?.name || '',
    groups: new Set(existing?.groups || []),
    cardio: !!existing?.cardio,
    plan: (existing?.plan || []).map(p => ({ ...p })),
  };

  const nameIn = el('input', { type: 'text', placeholder: 'Chest & Triceps', value: state.name });
  /* How long this one usually takes, so logging it does not ask again. */
  const minsIn = el('input.num-in', { type: 'number', inputmode: 'numeric', min: '0', max: '400',
    placeholder: 'minutes', value: existing?.minutes ?? '' });
  const chips = el('div.chip-wrap');
  const planWrap = el('div.plan-list');
  const meter = el('div');

  const drawChips = () => {
    clear(chips);
    for (const g of GROUPS) {
      chips.append(el('button.chip' + (state.groups.has(g) ? '.is-on' : ''), {
        disabled: state.cardio,
        onclick: () => { state.groups.has(g) ? state.groups.delete(g) : state.groups.add(g);
          drawChips(); drawMeter(); },
      }, GROUP_LABEL[g]));
    }
    chips.append(el('button.chip' + (state.cardio ? '.is-on' : ''), {
      onclick: () => { state.cardio = !state.cardio;
        if (state.cardio) { state.groups.clear(); state.plan = []; }
        drawChips(); drawPlan(); drawMeter(); },
    }, 'Cardio'));
  };

  const drawPlan = () => {
    clear(planWrap);
    if (state.cardio) return;
    state.plan.forEach((item, i) => {
      const ex = exerciseById(item.exerciseId);
      planWrap.append(el('div.plan-row', {},
        el('span.grow', {},
          el('div.title', {}, ex?.name || 'Unknown'),
          el('div.sub', {}, [...(ex?.primary || []), ...(ex?.secondary || []).map(g => g + ' (some)')]
            .map(g => GROUP_LABEL[g.replace(' (some)', '')] + (g.includes('(some)') ? ' ·' : ''))
            .join(' · '))),
        el('div.stepper', {},
          el('button.btn.sm.ghost', { 'aria-label': 'Fewer sets',
            onclick: () => { item.sets = Math.max(1, (item.sets || 1) - 1); drawPlan(); drawMeter(); } }, '−'),
          el('span.stepper-val', {}, `${item.sets || 0} sets`),
          el('button.btn.sm.ghost', { 'aria-label': 'More sets',
            onclick: () => { item.sets = Math.min(20, (item.sets || 0) + 1); drawPlan(); drawMeter(); } }, '+')),
        el('button.btn.sm.ghost', { 'aria-label': 'Remove',
          onclick: () => { state.plan.splice(i, 1); drawPlan(); drawMeter(); } }, '×')));
    });
    planWrap.append(el('button.btn.sm.ghost', { style: { marginTop: '4px' },
      onclick: () => openExercisePicker([...state.groups], id => {
        if (!state.plan.some(p => p.exerciseId === id)) state.plan.push({ exerciseId: id, sets: 3 });
        drawPlan(); drawMeter();
      }),
    }, icon('plus', 14), 'Add exercise'));
  };

  /*
   * The meter.
   *
   * Sets per muscle in this session, and what that comes to across a week
   * at the rate this workout actually comes round in the rotation — which
   * is the number the evidence is about. A session in isolation says very
   * little; six sets of chest is thin once a week and plenty three times.
   */
  const drawMeter = () => {
    clear(meter);
    if (state.cardio || !state.plan.length) return;

    const s = get();
    const rot = rotation();
    const rotLen = Math.max(1, rot.length);
    const st = trainStats(28);
    /*
     * How often this workout comes round, from what actually happened
     * rather than from the plan — someone training twice a week on a
     * four-workout rotation sees each one every fortnight.
     *
     * With no history there is nothing to measure, and the old fallback
     * assumed one session a week in total, which told a brand-new user
     * that a perfectly normal chest day was a quarter of the work they
     * needed. Four sessions a week is the neutral assumption, and the
     * caption says it is an assumption.
     */
    const measured = st.perWeek > 0;
    const perWeek = (measured ? st.perWeek : 4) / rotLen;

    const recent = rowsFor(s, 'all');
    const recoveries = Object.values(recent || {}).map(r => r.recovery)
      .filter(v => v != null).slice(-7);
    const avgRec = recoveries.length
      ? recoveries.reduce((a, b) => a + b, 0) / recoveries.length : null;

    const band = volumeBand(s.profile, { recovery: avgRec });
    const perSession = setsByGroup(state.plan);

    const rows = Object.entries(perSession)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([g, n]) => {
        const weekly = n * perWeek;
        const v = bandVerdict(weekly, band);
        const pct = Math.min(100, (weekly / (band.max * 1.4)) * 100);
        const lo = (band.min / (band.max * 1.4)) * 100;
        const hi = (band.max / (band.max * 1.4)) * 100;
        return el('div.vol-row', {},
          el('span.vol-name', {}, GROUP_LABEL[g]),
          el('span.vol-track', {},
            el('i.vol-band', { style: { left: lo + '%', width: (hi - lo) + '%' } }),
            el('i.vol-fill' + '.is-' + v.level, { style: { width: pct + '%' } })),
          el('span.vol-num', {}, `${round1(n)} → ${round1(weekly)}/wk`));
      });

    meter.append(
      el('div.section-label', { style: { marginTop: '16px' } },
        el('span.micro', {}, 'How much work this is')),
      el('div.vol-rows', {}, ...rows),
      el('div.fine', { style: { marginTop: '8px' } },
        'Sets in this session, then what they come to weekly at '
        + (measured
            ? `how often you are actually training — ${round1(st.perWeek)} sessions a week over the last month`
            : 'four sessions a week, which is a guess until you have logged a few')
        + `. Your band is ${band.min}–${band.max} sets a week per muscle. `
        + band.why),
      el('div.fine', { style: { marginTop: '6px' } },
        'A set of a compound counts fully for what it mainly trains and half for what '
        + 'it helps — a bench press is not a full set of triceps work.'));
  };

  drawChips(); drawPlan(); drawMeter();

  const sh = sheet({
    title: existing ? existing.name || 'Edit workout' : 'New workout',
    body: el('div', {},
      nameIn,
      el('div.section-label', { style: { marginTop: '14px' } },
        el('span.micro', {}, 'What it trains')),
      chips,
      el('div.fine', {}, 'Cardio is tracked but does not count towards muscle coverage.'),
      el('div.section-label', { style: { marginTop: '14px' } },
        el('span.micro', {}, 'How long it usually takes')),
      minsIn,
      el('div.fine', {}, 'Optional. Fills itself in when you log this workout.'),
      el('div.section-label', { style: { marginTop: '16px' } },
        el('span.micro', {}, 'Exercises — optional')),
      el('div.fine', { style: { marginBottom: '8px' } },
        'Leave this empty and the workout still works. Fill it in and the app can tell '
        + 'you whether the amount of work is where it should be.'),
      planWrap,
      meter),
    foot: el('div.btn-row', {},
      existing && !String(existing.id).startsWith('p-') ? el('button.btn.ghost', {
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
          saveType({ id: existing?.id, name, groups: [...state.groups],
                     cardio: state.cardio, plan: state.plan,
                     minutes: minsIn.value ? +minsIn.value : null });
          haptic('success'); sh.close(); after();
        },
      }, 'Save')),
  });
  return sh;
}

const round1 = n => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');

/*
 * Picking an exercise.
 *
 * Filtered to the groups the workout covers, because a chest day does not
 * need to scroll past leg curls — with everything still reachable, since
 * plenty of people put a set of something unrelated on the end.
 */
function openExercisePicker(groups, onPick) {
  const list = el('div');
  const search = el('input', { type: 'search', placeholder: 'Search exercises', autocomplete: 'off',
    oninput: e => draw(e.target.value) });
  let showAll = !groups.length;

  const draw = (q = '') => {
    clear(list);
    const needle = q.trim().toLowerCase();
    let pool = showAll || needle ? EXERCISES : exercisesFor(groups);
    if (needle) pool = pool.filter(e => e.name.toLowerCase().includes(needle));
    if (!pool.length) {
      list.append(el('div.fine', {}, `Nothing matches "${q}".`));
      return;
    }
    for (const ex of pool) {
      list.append(el('button.row', {
        onclick: () => { onPick(ex.id); haptic('tap'); sh.close(); },
      },
        el('span.grow', {},
          el('div.title', {}, ex.name),
          el('div.sub', {},
            ex.primary.map(g => GROUP_LABEL[g]).join(' · ')
            + (ex.secondary.length ? ` · also ${ex.secondary.map(g => GROUP_LABEL[g]).join(', ')}` : ''))),
        icon('plus', 14)));
    }
    if (!showAll && !needle) {
      list.append(el('button.btn.sm.ghost', { style: { marginTop: '10px' },
        onclick: () => { showAll = true; draw(); } }, 'Show every exercise'));
    }
  };
  draw();
  const sh = sheet({ title: 'Add an exercise', body: el('div', {}, el('div.field', {}, search), list) });
  return sh;
}

/* ── Logging one session ────────────────────────────────────────────── */

function openLogger(key, ctx, prefill = {}) {
  const existing = sessionFor(key);
  const state = {
    type: prefill.pick ? null : (prefill.type || existing?.type || nextUp() || trainTypes()[0]?.id),
    effort: existing?.effort || null,
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

  /* If the workout has a plan, its set count is the obvious default —
     the person already said what the session consists of, and retyping it
     every time is the sort of friction that stops people logging. */
  const plannedSets = (() => {
    const t = typeById(state.type);
    return (t?.plan || []).reduce((a, x) => a + (x.sets || 0), 0) || null;
  })();
  const setsIn = el('input.num-in', { type: 'number', inputmode: 'numeric', min: '0', max: '100',
    placeholder: plannedSets ? `${plannedSets} planned` : 'hard sets',
    value: existing?.sets ?? '' });
  const typicalMins = typeById(state.type)?.minutes || null;
  const minsIn = el('input.num-in', { type: 'number', inputmode: 'numeric', min: '0', max: '600',
    placeholder: typicalMins ? `${typicalMins} usual` : 'minutes',
    value: prefill.minutes ?? existing?.minutes ?? '' });
  const noteIn = el('input', { type: 'text', placeholder: 'Note (optional)', value: existing?.note || '' });

  /*
   * How it actually went, which nothing else can supply.
   *
   * Two identical sessions on paper are different sessions if one was
   * taken to failure and the other was phoned in. No strap and no set
   * count knows the difference — only the person does. One tap, never
   * required, and tapping it again clears it.
   */
  const effortRow = el('div.chip-wrap');
  const effortNote = el('div.fine');
  const drawEffort = () => {
    clear(effortRow);
    for (const e of EFFORT) {
      effortRow.append(el('button.chip' + (state.effort === e.id ? '.is-on' : ''), {
        onclick: () => { state.effort = state.effort === e.id ? null : e.id; drawEffort(); },
      }, e.label));
    }
    effortNote.textContent = state.effort ? effortById(state.effort).note
      : 'Optional. It is the one part of a session a strap cannot see.';
  };
  drawEffort();

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
      el('div.section-label', { style: { marginTop: '14px' } },
        el('span.micro', {}, 'How it went')),
      effortRow,
      effortNote,
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
          if (!state.type) { toast('Pick what it was first.', 'err'); return; }
          logSession(key, {
            type: state.type,
            sets: setsIn.value ? +setsIn.value : (setsFromEx || plannedSets || null),
            effort: state.effort,
            minutes: minsIn.value ? +minsIn.value : (prefill.minutes ?? typicalMins ?? null),
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
