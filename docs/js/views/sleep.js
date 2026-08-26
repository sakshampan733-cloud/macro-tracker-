/*
 * The sleep schedule dial.
 *
 * Modelled on Apple's Bedtime control, because it is the right shape for
 * the problem: sleep is an arc on a 24-hour circle, and the thing you
 * actually want to adjust is where that arc sits and how long it is. Two
 * time fields make you do the subtraction in your head; the ring shows the
 * duration as the size of the thing you are dragging.
 *
 * Three gestures, all on the same band:
 *   — drag the bed end to change when you go to sleep
 *   — drag the alarm end to change when you get up
 *   — drag the band itself to move the whole night without resizing it
 *
 * This exists chiefly for people with no band on their wrist. Whoop and
 * Apple supply a wake time, and the coach, the caffeine cutoff and the
 * meal timing all hang off it — without a strap those features simply had
 * nothing to stand on. A schedule you set yourself is a worse measurement
 * than a watch and a far better one than nothing.
 */

import { el, clear, sheet, toast, icon, replaceKids, append } from '../ui.js';
import { get, commit, dayKey, peekDay } from '../store.js';
import { haptic } from '../feedback.js';

const TAU = Math.PI * 2;
const SNAP = 5 / 60;                    /* five minutes */
/* Nobody schedules a twenty-minute night, and nobody schedules a
   fifteen-hour one either. The bounds exist to keep a wild drag from
   producing a schedule the rest of the app then reasons from. */
const MIN_SPAN = 0.5;
const MAX_SPAN = 14;

export const DEFAULT_SCHEDULE = { bed: 23, wake: 7 };

export function sleepSchedule() {
  const s = get().settings?.sleepGoal;
  if (!s || s.bed == null || s.wake == null) return null;
  return s;
}

export const sleepHours = s => ((s.wake - s.bed) + 24) % 24;

export function setSleepSchedule(bed, wake) {
  commit(s => { s.settings.sleepGoal = { bed, wake, setAt: Date.now() }; }, 'settings');
}

export function clearSleepSchedule() {
  commit(s => { delete s.settings.sleepGoal; }, 'settings');
}

/* 24-hour clock text, in the same style as the rest of the app. */
export function hhmm(h) {
  const t = ((h % 24) + 24) % 24;
  const hr = Math.floor(t);
  const mn = Math.round((t - hr) * 60);
  return `${String(mn === 60 ? hr + 1 : hr).padStart(2, '0')}:${String(mn === 60 ? 0 : mn).padStart(2, '0')}`;
}

/* Twelve-hour text, which is how most people say a bedtime out loud. */
export function clockText(h) {
  const t = ((h % 24) + 24) % 24;
  const hr24 = Math.floor(t);
  const mn = Math.round((t - hr24) * 60);
  const ampm = hr24 < 12 ? 'AM' : 'PM';
  const hr12 = hr24 % 12 === 0 ? 12 : hr24 % 12;
  return `${hr12}:${String(mn).padStart(2, '0')} ${ampm}`;
}

const durText = h => {
  const hr = Math.floor(h);
  const mn = Math.round((h - hr) * 60);
  return mn ? `${hr} hr ${mn} min` : `${hr} hr`;
};

/* ── The dial ───────────────────────────────────────────────────────── */

/*
 * Midnight sits at the top and the clock runs clockwise, so 6AM is on the
 * right and noon at the bottom — the same orientation as the reference,
 * and the one that puts a normal night's sleep across the top of the ring
 * where it reads as a single unbroken band.
 */
const SIZE = 260;
const CX = SIZE / 2, CY = SIZE / 2;
const R_BAND = 104;                     /* centre-line of the draggable band */
const BAND_W = 30;
const R_FACE = 76;

const angleOf = h => (h / 24) * TAU - Math.PI / 2;
const pointAt = (h, r) => [CX + r * Math.cos(angleOf(h)), CY + r * Math.sin(angleOf(h))];

/* An arc along the band's centre line, stroked to give it width. */
function arcPath(from, to, r) {
  let span = ((to - from) + 24) % 24;
  if (span < 0.0001) span = 0.0001;
  if (span > 23.999) span = 23.999;
  const [x1, y1] = pointAt(from, r);
  const [x2, y2] = pointAt(from + span, r);
  const large = span > 12 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function sleepDial({ bed, wake, onChange }) {
  const state = { bed, wake };

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('class', 'sleep-dial no-swipe');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Sleep schedule');

  const mk = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  /* The unlit track. */
  svg.append(mk('circle', { cx: CX, cy: CY, r: R_BAND, class: 'dial-track',
                            'stroke-width': BAND_W, fill: 'none' }));

  /* The face: hour marks, then the four cardinal labels. */
  const face = mk('g', { class: 'dial-face' });
  face.append(mk('circle', { cx: CX, cy: CY, r: R_FACE + 12, class: 'dial-face-bg' }));
  for (let h = 0; h < 24; h++) {
    const long = h % 6 === 0;
    const [x1, y1] = pointAt(h, R_FACE - (long ? 8 : 4));
    const [x2, y2] = pointAt(h, R_FACE);
    face.append(mk('line', { x1, y1, x2, y2, class: 'dial-tick' + (long ? ' is-major' : '') }));
  }
  for (const [h, label] of [[0, '12AM'], [6, '6AM'], [12, '12PM'], [18, '6PM']]) {
    const [x, y] = pointAt(h, R_FACE - 24);
    const t = mk('text', { x, y, class: 'dial-num is-major', 'text-anchor': 'middle',
                           'dominant-baseline': 'central' });
    t.textContent = label;
    face.append(t);
  }
  for (const h of [2, 4, 8, 10, 14, 16, 20, 22]) {
    const [x, y] = pointAt(h, R_FACE - 24);
    const t = mk('text', { x, y, class: 'dial-num', 'text-anchor': 'middle',
                           'dominant-baseline': 'central' });
    t.textContent = String(h % 12 === 0 ? 12 : h % 12);
    face.append(t);
  }
  /* Moon at midnight, sun at noon — the reference's way of saying which
     half of the ring is night without writing it down. */
  const [mx, my] = pointAt(0, R_FACE - 44);
  const moon = mk('text', { x: mx, y: my, class: 'dial-glyph is-moon',
                            'text-anchor': 'middle', 'dominant-baseline': 'central' });
  moon.textContent = '☾';
  const [sx, sy] = pointAt(12, R_FACE - 44);
  const sun = mk('text', { x: sx, y: sy, class: 'dial-glyph is-sun',
                           'text-anchor': 'middle', 'dominant-baseline': 'central' });
  sun.textContent = '☀';
  face.append(moon, sun);
  svg.append(face);

  /* The band, its ribbing, and the two ends. */
  const band = mk('path', { class: 'dial-band', 'stroke-width': BAND_W, fill: 'none' });
  const ribs = mk('g', { class: 'dial-ribs' });
  const bedKnob = mk('circle', { r: 15, class: 'dial-knob' });
  const wakeKnob = mk('circle', { r: 15, class: 'dial-knob' });
  const bedIcon = mk('text', { class: 'dial-knob-glyph', 'text-anchor': 'middle',
                               'dominant-baseline': 'central' });
  bedIcon.textContent = '●';
  const wakeIcon = mk('text', { class: 'dial-knob-glyph', 'text-anchor': 'middle',
                                'dominant-baseline': 'central' });
  wakeIcon.textContent = '○';
  svg.append(band, ribs, bedKnob, wakeKnob, bedIcon, wakeIcon);

  const centre = mk('text', { x: CX, y: CY + 4, class: 'dial-centre',
                              'text-anchor': 'middle', 'dominant-baseline': 'central' });
  svg.append(centre);

  function paint() {
    band.setAttribute('d', arcPath(state.bed, state.wake, R_BAND));

    /* Ribbing along the band, the texture that makes it read as a grip. */
    clear(ribs);
    const span = sleepHours(state);
    const n = Math.max(6, Math.round(span * 6));
    for (let i = 1; i < n; i++) {
      const h = state.bed + (span * i) / n;
      const [x1, y1] = pointAt(h, R_BAND - BAND_W / 2 + 5);
      const [x2, y2] = pointAt(h, R_BAND + BAND_W / 2 - 5);
      ribs.append(mk('line', { x1, y1, x2, y2, class: 'dial-rib' }));
    }

    const [bx, by] = pointAt(state.bed, R_BAND);
    const [wx, wy] = pointAt(state.wake, R_BAND);
    bedKnob.setAttribute('cx', bx); bedKnob.setAttribute('cy', by);
    wakeKnob.setAttribute('cx', wx); wakeKnob.setAttribute('cy', wy);
    bedIcon.setAttribute('x', bx); bedIcon.setAttribute('y', by);
    wakeIcon.setAttribute('x', wx); wakeIcon.setAttribute('y', wy);

    centre.textContent = '';
    svg.setAttribute('aria-label',
      `Asleep from ${clockText(state.bed)} to ${clockText(state.wake)}, ${durText(span)}`);
    onChange?.({ ...state });
  }

  /* ── dragging ── */
  let mode = null;                      /* 'bed' | 'wake' | 'band' */
  let grabOffset = 0;

  const hourAt = e => {
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * SIZE - CX;
    const y = ((e.clientY - box.top) / box.height) * SIZE - CY;
    let a = Math.atan2(y, x) + Math.PI / 2;   /* midnight at the top */
    if (a < 0) a += TAU;
    return (a / TAU) * 24;
  };

  const snap = h => {
    const v = Math.round(h / SNAP) * SNAP;
    return ((v % 24) + 24) % 24;
  };

  /* Circular distance in hours, 0 when identical and 12 at the opposite
     side of the clock. An earlier version returned the complement of this
     and was compared as though it were a distance, so a touch right on a
     knob scored 12 and never claimed the handle — every drag fell through
     to moving the whole band, and the night could not be resized at all. */
  const gap = (a, b) => {
    const d = ((a - b) % 24 + 24) % 24;
    return d > 12 ? 24 - d : d;
  };

  svg.addEventListener('pointerdown', e => {
    const h = hourAt(e);
    const dBed = gap(h, state.bed);
    const dWake = gap(h, state.wake);

    /* Whichever end is nearer wins, unless the touch is well inside the
       band — then the whole night moves, which is the gesture people use
       to shift a schedule an hour later without resizing it. */
    const inside = ((h - state.bed + 24) % 24) < sleepHours(state);
    if (dBed < 1.2 || dWake < 1.2) {
      mode = dBed <= dWake ? 'bed' : 'wake';
    } else if (inside) {
      mode = 'band';
      grabOffset = ((h - state.bed) + 24) % 24;
    } else {
      return;
    }
    svg.setPointerCapture?.(e.pointerId);
    svg.classList.add('is-dragging');
    haptic('tap');
    e.preventDefault();
  });

  svg.addEventListener('pointermove', e => {
    if (!mode) return;
    const h = hourAt(e);

    if (mode === 'band') {
      const span = sleepHours(state);
      state.bed = snap(h - grabOffset);
      state.wake = snap(state.bed + span);
    } else if (mode === 'bed') {
      const next = snap(h);
      /* Both ends of the range matter. A lower bound stops the band
         collapsing to nothing; an upper bound stops it flipping inside
         out, which is what a drag the long way round did — swinging one
         end past the other turned an eight-hour night into a
         twenty-two-hour one in a single gesture. */
      const span = ((state.wake - next) + 24) % 24;
      if (span >= MIN_SPAN && span <= MAX_SPAN) state.bed = next;
    } else {
      const next = snap(h);
      const span = ((next - state.bed) + 24) % 24;
      if (span >= MIN_SPAN && span <= MAX_SPAN) state.wake = next;
    }
    paint();
    e.preventDefault();
  });

  const end = () => {
    if (!mode) return;
    mode = null;
    svg.classList.remove('is-dragging');
    haptic('tap');
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  paint();
  return { node: svg, state, paint, set: (b, w) => { state.bed = b; state.wake = w; paint(); } };
}

/* ── The sheet ──────────────────────────────────────────────────────── */

export function openSleepGoal(ctx) {
  const start = sleepSchedule() || DEFAULT_SCHEDULE;
  let cur = { bed: start.bed, wake: start.wake };

  const bedOut = el('div.sched-time');
  const wakeOut = el('div.sched-time');
  const dur = el('div.sched-dur');
  const verdict = el('div.sched-verdict');

  const dial = sleepDial({
    bed: cur.bed, wake: cur.wake,
    onChange: v => {
      cur = v;
      const h = sleepHours(v);
      bedOut.textContent = clockText(v.bed);
      wakeOut.textContent = clockText(v.wake);
      dur.textContent = durText(h);

      /*
       * A statement about the schedule, not a scolding. Seven to nine is
       * the range adult guidance converges on; outside it the honest thing
       * is to say what the schedule is, not to argue with it — plenty of
       * people have a good reason.
       */
      verdict.textContent = h >= 7 && h <= 9
        ? 'This schedule meets the usual adult range.'
        : h < 7
          ? `That is ${durText(7 - h)} short of the usual seven-hour mark.`
          : 'Longer than most adults need, which is not a problem in itself.';
      verdict.className = 'sched-verdict' + (h >= 7 && h <= 9 ? ' is-good' : '');
    },
  });

  const body = el('div', {},
    el('div.tile.sched-card', {},
      el('div.sched-heads', {},
        el('div', {},
          el('div.micro', {}, '▲ BEDTIME'),
          bedOut,
          el('div.micro', {}, 'Tonight')),
        el('div', { style: { textAlign: 'right' } },
          el('div.micro', {}, 'WAKE UP'),
          wakeOut,
          el('div.micro', {}, 'Tomorrow'))),
      el('div.sched-dial-wrap', {}, dial.node),
      dur,
      verdict),

    el('div.fine', { style: { marginTop: '12px' } },
      'Drag either end to move it, or drag the band to shift the whole night. '
      + 'This is what the app uses for your wake time and your bedtime when you '
      + 'are not wearing a band — which is what the meal timing, the water pacing '
      + 'and the caffeine cutoff all hang off.'),

    sleepSchedule()
      ? el('button.btn.ghost.block', { style: { marginTop: '14px' },
          onclick: () => {
            clearSleepSchedule();
            toast('Sleep goal removed.');
            sh.close();
            ctx?.refresh?.();
          } }, 'Remove the goal')
      : null);

  const sh = sheet({
    title: 'Sleep goal',
    body,
    foot: el('button.btn.primary.block', {
      onclick: () => {
        setSleepSchedule(cur.bed, cur.wake);
        haptic('success');
        toast(`Asleep ${clockText(cur.bed)} to ${clockText(cur.wake)}.`);
        sh.close();
        ctx?.refresh?.();
      },
    }, 'Save'),
  });
  return sh;
}

/* ── The tile ───────────────────────────────────────────────────────── */

/*
 * Last night, against the schedule.
 *
 * Only shown when no band is supplying sleep — a strap measures this far
 * better than anyone's memory of it, and two sleep readings disagreeing on
 * the same screen is exactly the mix-up the Body tab is careful to avoid.
 */
export function sleepTile(s, key, ctx) {
  const sch = sleepSchedule();

  if (!sch) {
    return el('div.tile', {},
      el('div.between', {},
        el('div', {},
          el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Sleep goal'),
          el('div.fine', { style: { marginTop: '3px' } },
            'Set a bedtime and a wake time, and the app can pace your meals, '
            + 'water and caffeine around them.')),
        el('button.btn.sm', { onclick: () => openSleepGoal(ctx) }, 'Set it')));
  }

  const goalH = sleepHours(sch);

  /*
   * A band measures last night better than anyone remembers it, so when
   * one is present its figure is the one shown and the hand-logging button
   * disappears. Without a band the manual log is the only source there is.
   * Either way the goal is visible and editable, which it was not before —
   * you could set a schedule and then never find it again.
   */
  const rows = Object.entries(s.whoop?.rows || {}).sort();
  const lastBand = rows.length ? rows[rows.length - 1][1] : null;
  const banded = lastBand?.sleepH > 0;
  const manual = peekDay(key).sleep || null;

  const sleptH = banded ? lastBand.sleepH : manual?.hours ?? null;
  const source = banded ? 'measured' : manual ? 'your estimate' : null;

  const body = el('div');
  if (sleptH != null) {
    const diff = sleptH - goalH;
    const close = Math.abs(diff) < 0.5;
    body.append(
      el('div.readout', { style: { marginTop: '10px' } },
        el('div', {},
          el('div.micro', {}, 'Last night'),
          el('div.readout-main', { style: { fontSize: '30px' } }, durText(sleptH))),
        el('div.readout-side', {},
          el('div.micro', {}, 'Against goal'),
          el('div.v', { style: { color: close ? 'var(--good)' : 'var(--muted)' } },
            `${diff >= 0 ? '+' : '\u2212'}${durText(Math.abs(diff))}`))),
      el('div.micro', { style: { marginTop: '6px' } },
        banded
          ? `${durText(goalH)} goal \u00b7 ${source}`
          : `${clockText(manual.bed)} \u2192 ${clockText(manual.wake)} \u00b7 ${source}`));
  } else {
    body.append(el('div.fine', { style: { marginTop: '9px' } },
      'Nothing logged for last night.'));
  }

  return el('div.tile', {},
    el('div.between', {},
      el('div.flex', { style: { gap: '7px' } }, icon('moon', 15), el('h3', {}, 'Sleep goal')),
      el('button.btn.sm.ghost', { onclick: () => openSleepGoal(ctx) },
        `${clockText(sch.bed)} \u2192 ${clockText(sch.wake)}`)),
    body,
    banded ? null : el('button.btn.sm.block', { style: { marginTop: '11px' },
      onclick: () => openLogSleep(key, sch, ctx) },
      manual ? 'Change last night' : 'Log last night'));
}

/* Logging a night by hand, on the same dial. */
export function openLogSleep(key, sch, ctx) {
  const prev = peekDay(key).sleep;
  let cur = { bed: prev?.bed ?? sch.bed, wake: prev?.wake ?? sch.wake };

  const dur = el('div.sched-dur');
  const bedOut = el('div.sched-time');
  const wakeOut = el('div.sched-time');

  const dial = sleepDial({
    bed: cur.bed, wake: cur.wake,
    onChange: v => {
      cur = v;
      bedOut.textContent = clockText(v.bed);
      wakeOut.textContent = clockText(v.wake);
      dur.textContent = durText(sleepHours(v));
    },
  });

  const sh = sheet({
    title: 'Last night',
    body: el('div', {},
      el('div.tile.sched-card', {},
        el('div.sched-heads', {},
          el('div', {}, el('div.micro', {}, 'ASLEEP'), bedOut),
          el('div', { style: { textAlign: 'right' } }, el('div.micro', {}, 'AWAKE'), wakeOut)),
        el('div.sched-dial-wrap', {}, dial.node),
        dur),
      el('div.fine', { style: { marginTop: '12px' } },
        'Your own estimate. It feeds the wake time the coach uses, so it is worth '
        + 'being roughly right rather than exactly wrong.')),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        commit(s => {
          const d = s.days[key] || (s.days[key] = { entries: [], water: [], weight: null, note: '', supps: [] });
          d.sleep = { bed: cur.bed, wake: cur.wake, hours: sleepHours(cur), at: Date.now() };
        }, 'sleep');
        haptic('success');
        sh.close();
        ctx?.refresh?.();
      },
    }, 'Save'),
  });
  return sh;
}
