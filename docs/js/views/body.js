/*
 * Body.
 *
 * Weight, vitals, and what the two have to say to each other. This is the
 * screen that answers "where do I actually range?" — against your own
 * history, not a population chart.
 */

import {
  el, clear, icon, kcal, g, distribution, toast, sheet, field,
  segmented, empty, dateLabel, confirmSheet, explain, replaceKids } from '../ui.js';
import { get, commit, dayKey, setWeight, peekDay, weightSeries, totals } from '../store.js';
import {
  importWhoopCSV, importWhoopFile, summary, METRICS, seriesFor, placeInRange, baseline,
  nutritionVsRecovery, stats,
} from '../whoop.js';
import { trendWeight, adaptiveTDEE, bestTDEE, whoopTDEE, predictedTDEE, checkIn, checkInVerdict } from '../nutrition.js';
import { calibrationTile } from './dish.js';
import { bloodTile } from './blood.js';
import {
  ring, stageBar, liveDot, recoveryColour,
  healthBars, healthLine, miniSpark,
} from '../charts.js';
import { haptic } from '../feedback.js';
import { openReport } from './report.js';
import { openAppleHealth } from './apple.js';
import { sleepTile, sleepSchedule, sleepHours } from './sleep.js';
import { weightUnit, kgToLb, lbToKg, showWeight } from '../units.js';
import {
  existingSource, sourceForMetric, healthSource, setHealthSource, canMeasure, bandName,
} from '../applehealth.js';
import {
  relayUrl, isConnected, connectUrl, checkRelay, syncWhoop, disconnect, captureFromUrl,
} from '../whooprelay.js';

export function renderBody(root, ctx) {
  const s = get();
  clear(root);

  root.append(
    (root.classList.add('stagger'), el('div.between', { style: { marginBottom: '14px' } },
      el('h1', {}, 'Body'),
      el('button.btn.sm.primary', { onclick: () => openReport(ctx, 7) }, 'Report'))),
    /*
     * The band's readings lead.
     *
     * They are what changed overnight and what you opened this tab to
     * look at. Weight, maintenance and the rest are review — true all
     * week, and none of it moves while you are reading it. Putting the
     * weigh-in first meant scrolling past a number you already knew to
     * reach the one you did not.
     */
    vitalsSection(s, ctx),
    checkInTile(s, ctx),
    weightTile(ctx),
    tdeeTile(s),
    calibrationTile(s) || el('div'),
    bloodTile(s, ctx),
    correlationTile(s),
  );
}

/* ── Check-in ───────────────────────────────────────────────────────── */

const CADENCES = { 7: 'week', 14: 'fortnight', 30: 'month' };

/*
 * A look back, not a daily nag.
 *
 * Day to day the scale is mostly water and gut contents; the true signal
 * only separates from that noise over a week or more. So this is the one
 * place in the app that deliberately does not update every time you log
 * something — it reports on a cadence you set, and says the same plain
 * things a person would: on track, behind, or not enough data yet.
 */
function checkInTile(s, ctx) {
  const days = s.settings.checkInDays || 14;
  const ci = checkIn(s, days);
  const profile = s.profile;
  const rate = profile.rate ?? 0;
  const verdict = checkInVerdict(ci, profile, rate);

  const toneColour = { good: 'var(--good)', warn: 'var(--warn)', info: 'var(--m-p)' };

  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, `Last ${CADENCES[days] || days + ' days'}`),
      el('button.btn.sm.ghost', { onclick: () => openCadencePicker(s, ctx) },
        CADENCES[days] || `${days}d`)),

    el('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
      el('div', {
        style: {
          width: '8px', height: '8px', borderRadius: '50%', marginTop: '6px', flex: 'none',
          background: toneColour[verdict.tone] || 'var(--muted)',
        },
      }),
      el('div', {},
        el('div', { style: { fontSize: '15px', fontWeight: '600' } }, verdict.headline),
        el('div.fine', { style: { marginTop: '4px' } }, verdict.body))),

    ci.ready ? el('div', { style: { display: 'flex', gap: '18px', marginTop: '14px', flexWrap: 'wrap' } },
      stat('Logged', `${ci.loggedDays}/${ci.totalDays} days`),
      stat('Weighed in', `${ci.weighIns}×`),
      stat('Avg intake', `${ci.meanIntake.toLocaleString('en-IN')} ±${ci.intakeSigma}`),
      ci.weightChange != null ? stat('Weight', `${ci.weightChange >= 0 ? '+' : ''}${ci.weightChange} kg`) : null,
    ) : null,
  );
}

const stat = (label, value) =>
  el('div', {},
    el('div.micro', {}, label),
    el('div.num', { style: { fontSize: '14px', marginTop: '2px' } }, value));

function openCadencePicker(s, ctx) {
  const body = el('div', {},
    el('p', { style: { color: 'var(--text-2)', marginTop: 0, lineHeight: '1.55' } },
      'Daily weight is mostly water — a bad night\'s sleep or a salty meal moves it more than a real week of eating does. '
      + 'Give it long enough to breathe and the actual trend stops hiding.'),
    el('div.tile.flush', {},
      ...Object.entries(CADENCES).map(([days, label]) => el('button.row', {
        onclick: () => {
          commit(st => { st.settings.checkInDays = +days; });
          toast(`Checking in every ${label}.`);
          s2.close(); ctx.refresh();
        },
      },
        el('span.grow', {},
          el('div.title', {}, label.charAt(0).toUpperCase() + label.slice(1)),
          el('div.sub', {},
            days === '7' ? 'Fast feedback, but noisier — a lot of the swing is still water.'
            : days === '14' ? 'The usual choice. Long enough for the trend to be real, soon enough to still act on it.'
            : 'Steadiest read, slowest to tell you something is off.')),
        el('span.micro', {}, days + 'd'),
      ))));
  const s2 = sheet({ title: 'How often to check in', body });
}

/* ── Weight ─────────────────────────────────────────────────────────── */

function weightTile(ctx) {
  const s = get();
  const key = dayKey();
  const today = peekDay(key).weight;
  const series = weightSeries();
  const withTrend = trendWeight(series);

  /* Kilograms are what gets stored; the unit is only how it is typed and
     read back. Weighing in is the most repeated numeric entry in the app,
     so it is the one place a forced conversion is most annoying. */
  const wu = weightUnit(s);
  const toDisp = kg => (wu === 'lb' ? kgToLb(kg) : kg);
  const fromDisp = v => (wu === 'lb' ? lbToKg(v) : v);

  const input = el('input.num-in', {
    type: 'number', inputmode: 'decimal', step: '0.1', min: '20',
    placeholder: s.profile?.weightKg ? toDisp(s.profile.weightKg).toFixed(1) : wu,
    value: today ? toDisp(today).toFixed(1) : '',
  });

  const latest = withTrend[withTrend.length - 1];
  const first = withTrend[0];
  const change = latest && first ? latest.trend - first.trend : 0;

  /* Trend, not the raw scale — the daily number swings a kilo on water and
     the bars would just be noise. */
  const recent = withTrend.slice(-90);
  const chart = withTrend.length > 2
    ? healthLine(
        recent.map(p => ({ v: toDisp(p.trend), label: `${p.date}: ${toDisp(p.kg).toFixed(1)} ${wu}` })),
        { h: 146, colour: 'var(--accent)', unit: ' ' + wu, dp: 1,
          raw: recent.map(p => ({ v: toDisp(p.kg) })) })
    : null;

  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, 'Weight'),
      latest ? el('span.micro', {}, `${withTrend.length} weigh-ins`) : null),

    el('div.flex', {},
      input,
      el('button.btn.primary', {
        style: { flex: 'none' },
        onclick: () => {
          const kg = fromDisp(+input.value);
          if (!(kg > 20 && kg < 400)) { toast(`That does not look like a weight in ${wu}.`, 'err'); return; }
          setWeight(key, kg);
          commit(st => { if (st.profile) st.profile.weightKg = kg; });
          toast('Logged.');
          ctx.refresh();
        },
      }, 'Log')),

    latest ? el('div', { style: { marginTop: '14px' } },
      el('div.between', {},
        el('div', {},
          el('div.micro', {}, 'Trend weight'),
          el('div.num', { style: { fontSize: '26px', marginTop: '2px' } }, toDisp(latest.trend).toFixed(1),
            el('span', { style: { fontSize: '12px', color: 'var(--muted)', marginLeft: '3px' } }, wu))),
        el('div', { style: { textAlign: 'right' } },
          el('div.micro', {}, 'Since ' + dateLabel(first.date)),
          el('div.num', {
            style: { fontSize: '18px', marginTop: '2px', color: change < 0 ? 'var(--good)' : change > 0 ? 'var(--m-c-ink)' : 'var(--text)' },
          }, (change >= 0 ? '+' : '') + toDisp(change).toFixed(1) + ' ' + wu))),
      chart,
      el('div.fine', { style: { marginTop: '6px' } },
        'Thin line is the scale. Thick line is the ten-day trend — that is the one that means anything.'))
      : el('div.fine', { style: { marginTop: '12px' } },
          'Weigh in most mornings. Four readings and the app can work out your real maintenance calories.'),
  );
}

/* ── Maintenance calories ───────────────────────────────────────────── */

function tdeeTile(s) {
  if (!s.profile) return el('div');
  const best = bestTDEE(s, s.profile);
  const adaptive = adaptiveTDEE(s);
  const whoop = whoopTDEE(s);
  const predicted = predictedTDEE(s.profile);

  const rows = [
    { key: 'adaptive', label: 'Adaptive', note: 'From your own intake and weight trend', res: adaptive },
    /* The device row is named after whatever device you actually declared,
       and reads neutrally when you declared none. */
    { key: 'whoop',
      label: healthSource() === 'apple' ? 'Apple Health'
        : healthSource() === 'whoop' || healthSource() === 'both' ? 'Whoop'
        : 'Your band',
      note: 'Device-measured daily burn', res: whoop },
    { key: 'predicted', label: 'Formula', note: predicted.method, res: predicted },
  ];

  return el('div.tile', {},
    el('div.tile-head', {}, el('h3', {}, 'Maintenance calories'),
      el('span.micro', {}, 'in use: ' + best.source)),

    el('div.tile.flush', { style: { margin: 0, border: '1px solid var(--line)' } },
      ...rows.map(r => {
        const ready = r.res.kcal != null;
        const inUse = best.source === r.key;
        return el('div.row', { style: { opacity: ready ? '1' : '.5' } },
          el('span.grow', {},
            el('div.title', {}, r.label,
              inUse ? el('span.conf.weighed', { style: { marginLeft: '8px' } }, 'IN USE') : null),
            el('div.sub', {}, ready ? r.note : notReadyNote(r))),
          el('span.kcal', {}, ready ? kcal(r.res.kcal) : '—',
            ready && r.res.sigma ? el('div.micro', { style: { marginTop: '2px' } }, '±' + r.res.sigma) : null));
      })),

    adaptive.ready ? el('div.note', {},
      el('div', {},
        `Over ${adaptive.spanDays} days you averaged ${kcal(adaptive.meanIntake)} kcal and your trend weight moved `
        + `${adaptive.slopeKgPerWeek >= 0 ? '+' : ''}${adaptive.slopeKgPerWeek} kg a week. `
        + `That puts real maintenance at ${kcal(adaptive.kcal)} ±${adaptive.sigma}. `
        + `Scale scatter is ${adaptive.scatterKg} kg, which is what the ± is mostly made of.`))
      : el('div.note.info', {},
        el('div', {}, `The adaptive figure needs ${adaptive.need.intakeDays} logged days and ${adaptive.need.weighIns} weigh-ins. `
          + `You have ${adaptive.have.intakeDays} and ${adaptive.have.weighIns}. It is worth the wait — a formula can be 15% out on any given person.`)),
  );
}

const notReadyNote = r =>
  r.key === 'adaptive'
    ? `Needs ${r.res.need.intakeDays} logged days and ${r.res.need.weighIns} weigh-ins`
    : r.key === 'whoop' ? 'Import your Whoop export to enable' : '';

/* ── Vitals ─────────────────────────────────────────────────────────── */

/*
 * Vitals.
 *
 * This was the flattest screen in the app, which was exactly backwards: it
 * is the only part showing something measured overnight, arriving on its
 * own, without you doing anything. A grid of small grey numbers made live
 * physiology look like a spreadsheet.
 *
 * So recovery gets the shape it deserves — a ring, coloured by the same
 * three bands Whoop uses because those bands ARE the reading — flanked by
 * the two things that actually drive it. Sleep is shown as the stages it
 * was made of, because six hours that was mostly light sleep is not the
 * same night as six with normal deep and REM, and a single number hides
 * that completely.
 */
function vitalsSection(s, ctx) {
  const sum = summary(s.whoop);

  if (!sum) {
    const mode = healthSource();

    /* Until you say what you wear, the honest screen is the question —
       not a Whoop button aimed at someone who may own an Apple Watch, or
       neither. */
    if (!mode) {
      return el('div', {},
        el('div.section-label', {}, el('span.micro', {}, 'Vitals')),
        el('div.tile', {}, empty(
          'What do you wear?',
          'The app tracks perfectly well without a band. Tell it what you have and it '
          + 'will only offer the syncs that apply to you.',
          el('button.btn.primary', { onclick: () => openHealthSetup(ctx) },
            icon('bolt', 16), 'Choose'))));
    }

    if (mode === 'none') {
      /* Without a strap the app still needs a wake time and a bedtime —
         the coach, the water pacing and the caffeine cutoff are all
         measured from them. A schedule you set yourself supplies both. */
      return el('div', {},
        el('div.section-label', {}, el('span.micro', {}, 'Sleep')),
        sleepTile(s, ctx.date || dayKey(), ctx),
        el('div.section-label', {}, el('span.micro', {}, 'Vitals')),
        el('div.tile', {}, empty(
          'No band, and nothing missing',
          'Weight, intake and the adaptive TDEE do the work here — a band would add '
          + 'recovery and strain, not accuracy.',
          el('button.btn.ghost', { onclick: () => openHealthSetup(ctx) }, 'I got one'))));
    }

    const buttons = el('div', {});
    if (mode === 'whoop' || mode === 'both') {
      buttons.append(
        el('button.btn.primary', { onclick: () => openWhoopRelay(ctx) }, icon('bolt', 16), 'Connect Whoop'),
        el('button.btn.ghost', { style: { marginTop: '8px' }, onclick: () => openWhoopImport(ctx) },
          icon('upload', 16), 'Or load a CSV export'));
    }
    if (mode === 'apple' || mode === 'both') {
      buttons.append(el('button.btn' + (mode === 'apple' ? '.primary' : '.ghost'),
        { style: mode === 'both' ? { marginTop: '8px' } : {}, onclick: () => openAppleHealth(ctx) },
        icon('bolt', 16), 'Set up Apple Health'));
    }
    buttons.append(el('button.btn.ghost.sm', { style: { marginTop: '10px' },
      onclick: () => openHealthSetup(ctx) }, 'Change what I wear'));

    /* Until the band is actually syncing, a hand-set schedule is what the
       coach has to work from. */
    return el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Sleep')),
      sleepTile(s, ctx.date || dayKey(), ctx),
      el('div.section-label', {}, el('span.micro', {}, 'Vitals')),
      el('div.tile', {}, empty(
        mode === 'apple' ? 'No Apple Health data yet'
          : mode === 'both' ? 'Nothing synced yet'
          : 'No Whoop data yet',
        mode === 'both'
          ? 'Connect both. Whoop measures recovery, strain and blood oxygen; Apple fills '
          + 'the one gap Whoop\u2019s API leaves, which is your step count.'
          : mode === 'apple'
          ? 'Your watch pushes to the relay through a Shortcut — the app walks you through it.'
          : 'Connect Whoop for live sync, or load a CSV export if you would rather not set up the relay.',
        buttons)));

    return el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Vitals')),
      el('div.tile', {}, empty(
        mode === 'apple' ? 'No Apple Health data yet'
          : mode === 'both' ? 'Nothing synced yet'
          : 'No Whoop data yet',
        mode === 'both'
          ? 'Connect both. Whoop measures recovery, strain and blood oxygen; Apple fills '
          + 'the one gap Whoop\u2019s API leaves, which is your step count.'
          : mode === 'apple'
          ? 'Your watch pushes to the relay through a Shortcut — the app walks you through it.'
          : 'Connect Whoop for live sync, or load a CSV export if you would rather not set up the relay.',
        buttons)));
  }

  const rec = sum.metrics.recovery;
  const hrv = sum.metrics.hrv;
  const rhr = sum.metrics.rhr;
  const sleep = sum.metrics.sleepH;
  const strain = sum.metrics.strain;

  const latestKey = Object.keys(s.whoop.rows || {}).sort().pop();
  const today = s.whoop.rows?.[latestKey] || {};
  const recV = rec?.latest?.v ?? null;
  const colour = recoveryColour(recV);

  const syncedVia = s.whoop.source === 'relay' ? `live from ${bandName()}`
    : s.whoop.source === 'demo' ? 'demo data' : 'imported';

  const wrap = el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Vitals')),
    el('div.between', { style: { marginBottom: '10px' } },
      el('span.flex', {},
        liveDot(colour),
        el('span.micro', { style: { marginLeft: '7px' } },
          `${latestKey} · ${syncedVia}`)),
      el('button.btn.sm.ghost', { onclick: () => openWhoopRelay(ctx) }, 'Sync')),
  );

  /* ── the hero: recovery, flanked by what drives it ── */
  const hero = el('div.tile.tile-field', {},
    el('div.vitals-hero', {},
      el('div.vitals-side', {},
        sideStat('HRV', hrv?.latest?.v, 'ms', 0, s, 'hrv', ctx),
        sideStat('Resting HR', rhr?.latest?.v, 'bpm', 0, s, 'rhr', ctx)),

      el('div', { style: { cursor: 'pointer' },
        role: 'button', tabindex: '0',
        'aria-label': `Recovery ${recV ?? 'unknown'} percent`,
        onclick: () => openMetric(s, 'recovery', ctx),
        onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMetric(s, 'recovery', ctx); } },
      },
        (() => {
          const r = ring({ value: recV, max: 100, size: 152, stroke: 12,
                 colour, label: 'RECOVERY', unit: '%',
                 sub: recV == null ? '' : recV >= 67 ? 'ready' : recV >= 34 ? 'moderate' : 'rest' });
          r.style.setProperty('--ring-glow', `color-mix(in srgb, ${colour} 13%, transparent)`);
          return r;
        })()),

      el('div.vitals-side', {},
        sideStat('Sleep', sleep?.latest?.v, 'h', 1, s, 'sleepH', ctx),
        sideStat('Strain', strain?.latest?.v, '', 1, s, 'strain', ctx)),
    ),
  );
  // the card's own atmosphere carries the reading before any number is read
  hero.style.setProperty('--field', `color-mix(in srgb, ${colour} 20%, transparent)`);
  wrap.append(hero);

  /* ── sleep, as the stages it was actually made of ── */
  if (today.sleepH) {
    const light = Math.max(0, (today.sleepH || 0) - (today.remH || 0) - (today.swsH || 0));
    const stages = [
      { label: 'Deep', value: today.swsH || 0, colour: 'var(--m-p)' },
      { label: 'REM',  value: today.remH || 0, colour: 'var(--m-f)' },
      { label: 'Light', value: light, colour: 'var(--line-2)' },
    ];
    wrap.append(el('div.tile.tappable', {
      role: 'button', tabIndex: 0,
      onclick: () => openSleepDetail(s, ctx),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSleepDetail(s, ctx); } },
    },
      el('div.between', { style: { marginBottom: '10px' } },
        el('h3', {}, 'Last night', icon('chevron', 14)),
        el('span.num', { style: { fontSize: '15px' } },
          `${today.sleepH.toFixed(1)} h`)),
      stageBar(stages),
      el('div.stage-key', {},
        ...stages.map(st => el('span.micro', {},
          el('i', { style: { background: st.colour } }),
          `${st.label} ${st.value.toFixed(1)}h`))),
      today.sleepPerf != null
        ? el('div.fine', { style: { marginTop: '10px' } },
            `Sleep performance ${Math.round(today.sleepPerf)}%`
            + (today.debtH ? ` · ${today.debtH.toFixed(1)} h of debt` : ''))
        : null,
    ));

    /* The goal belongs next to the measurement, not only on the screen
       you see before a band is connected. */
    wrap.append(sleepTile(s, ctx.date || dayKey(), ctx));
  }

  /* ── trends, as shapes rather than rows of numbers ── */
  const trendFor = (key, colour) => {
    const pts = seriesFor(s.whoop, key, 30);
    if (pts.length < 4) return null;
    const info = sum.metrics[key];
    /*
     * Statistics from the same window that is drawn.
     *
     * This previously labelled a 14-day baseline as the "30-day range"
     * beside a 30-day chart, so the stated range excluded points visibly
     * on the line — a caption contradicting the picture directly above it.
     */
    const base = stats(pts.map(p => p.v));
    if (!base) return null;
    /*
     * The parameter here is `key`; this called openMetric with `metric`,
     * which exists nowhere in scope. The tile therefore never became
     * tappable and the chevron beside the label pointed at nothing — an
     * arrow promising a detail view that could not open.
     *
     * The label is an h3 like every other openable panel, too. The old
     * .micro rendered it grey, which was a visible signal that these
     * panels were built differently, and the only honest reading of that
     * difference was the bug.
     */
    return el('div.tile.tappable', {
      role: 'button', tabIndex: 0,
      onclick: () => openMetric(s, key, ctx),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMetric(s, key, ctx); } },
    },
      el('div.between', { style: { marginBottom: '8px' } },
        el('div', {},
          el('h3', {}, info.label, icon('chevron', 13)),
          el('div.num', { style: { fontSize: '19px', marginTop: '2px', color: colour } },
            info.latest.v.toFixed(info.dp) + (info.unit ? ' ' + info.unit : ''))),
        el('div', { style: { textAlign: 'right' } },
          el('div.micro', {}, '30-day range'),
          el('div.num', { style: { fontSize: '12px', marginTop: '3px', color: 'var(--muted)' } },
            `${base.min.toFixed(info.dp)}–${base.max.toFixed(info.dp)}`))),
      healthBars(pts.map(p => ({ v: p.v, label: `${p.date}: ${p.v.toFixed(info.dp)} ${info.unit}` })), {
        colour, h: 132, unit: info.unit ? ' ' + info.unit : '',
        dp: info.dp, band: { lo: base.p25, hi: base.p75 },
      }),
      el('div.fine', { style: { marginTop: '8px' } },
        'Shaded band is where this normally sits for you.'),
    );
  };

  /*
   * Vitals, as a panel rather than a wall.
   *
   * Seven full charts stacked is not a dashboard, it is a scroll. Each of
   * these numbers is checked in a second — "is my resting heart rate
   * where it usually is" — and a 132px chart is the wrong instrument for
   * a one-second question.
   *
   * So: one row each, with the current value, a sparkline small enough to
   * read as a direction rather than as data, and where that sits against
   * your own middle band. The full chart is one tap away and unchanged.
   *
   * Recovery and sleep keep their own panels below. They carry things a
   * row cannot hold — a distribution, a stage breakdown — and they are
   * the two you actually open.
   */
  const VITALS = [
    ['hrv',    'var(--m-p)'],
    ['rhr',    'var(--accent)'],
    ['strain', 'var(--m-f)'],
    ['kcal',   'var(--m-c)'],
    ['spo2',   'var(--m-fib)'],
    ['resp',   'var(--m-water)'],
    ['temp',   'var(--m-c-ink)'],
    ['steps',  'var(--m-p)'],
  ];

  const vitalRows = [];
  const vitalKeys = new Set();
  const srcSeen = new Set();
  for (const [key, colour] of VITALS) {
    /* Do not offer a row the hardware cannot produce. An empty Recovery
       on an Apple Watch is not missing data, it is a category error. */
    if (!canMeasure(key)) continue;
    const pts = seriesFor(s.whoop, key, 30);
    if (pts.length < 4) continue;
    const info = METRICS[key];
    const st30 = stats(pts.map(p => p.v));
    if (!st30) continue;
    const latest = pts[pts.length - 1].v;

    /* Against your own middle half, not a population range. Outside it is
       worth a word; inside it is the answer "normal", which is usually the
       one you were looking for. */
    let where = 'usual', tone = '';
    if (latest > st30.p75) { where = 'above usual'; tone = info.good === 'high' ? 'is-good' : info.good === 'low' ? 'is-warn' : ''; }
    else if (latest < st30.p25) { where = 'below usual'; tone = info.good === 'low' ? 'is-good' : info.good === 'high' ? 'is-warn' : ''; }

    vitalKeys.add(key);
    /* Which band this particular row came off. Judged per metric, because
       for someone wearing both the answer genuinely differs by row. */
    const from = sourceForMetric(s, key);
    if (from) srcSeen.add(from);

    vitalRows.push(el('button.vital' + (from === 'apple' ? '.from-apple' : ''), {
      onclick: () => openMetric(s, key, ctx),
      'aria-label': `${info.label}, from ${from === 'apple' ? 'Apple Health' : 'Whoop'}`,
    },
      el('span.vital-name', {},
        info.label,
        from === 'apple' ? el('span.from-tag', {}, 'Apple') : null),
      el('span.vital-val', { style: { color: colour } },
        latest.toFixed(info.dp), el('i', {}, info.unit ? ' ' + info.unit : '')),
      el('span.vital-spark', { style: { color: colour } },
        miniSpark(pts.map(p => p.v), { colour })),
      el('span.vital-where' + (tone ? '.' + tone : ''), {}, where),
      icon('chevron', 13)));
  }

  /* "a, b and c" — a list you can read out loud. */
  const listWords = xs => xs.length < 2 ? (xs[0] || '')
    : xs.slice(0, -1).join(', ') + ' or ' + xs[xs.length - 1];

  if (vitalRows.length) {
    /* Which band these numbers came off. The two sources are never blended
       — an Apple import is refused outright while Whoop data is present,
       because Whoop's HRV is RMSSD and Apple's is SDNN and averaging them
       would produce a number that is not any kind of HRV at all. Saying so
       on the panel is the difference between segregated and merely
       separate-by-accident. */
    const mode = healthSource();
    const mixed = srcSeen.size > 1;
    const src = mixed ? 'both' : (srcSeen.values().next().value || existingSource(s) || 'whoop');

    /* Named in words as well as marked in colour: which rows are Apple's
       is the kind of thing you want stated, not inferred from a tint. */
    const fromApple = VITALS.map(([k]) => k)
      .filter(k => vitalKeys.has(k) && sourceForMetric(s, k) === 'apple')
      .map(k => METRICS[k].label);
    const missing = (src === 'apple' || mode === 'apple')
      ? VITALS.map(([k]) => k).filter(k => !vitalKeys.has(k)).map(k => METRICS[k].label)
      : [];

    let note = null;
    /* The two-source note only makes sense when there genuinely are two.
       On a single band it named hardware the reader does not own. */
    if (mode === 'both' && mixed && fromApple.length) {
      /* Everything Apple is allowed to supply alongside Whoop is a count —
         steps, stand hours, exercise minutes — so the plural verb is
         always the right one here. */
      note = `${listWords(fromApple)} come from Apple Health, marked above. Everything else `
           + 'is measured by your Whoop. The two are never averaged together.';
    } else if (missing.length) {
      note = `Your watch has not sent ${listWords(missing)} yet — check the Shortcut `
           + 'is collecting them.';
    }

    wrap.append(el('div.tile.flush.vitals', {},
      el('div.vitals-head', {},
        el('h3', {}, 'Vitals'),
        src === 'both' && mode === 'both'
          ? el('div.flex', { style: { gap: '6px' } },
              el('span.micro.src-tag', {}, 'Whoop'),
              el('span.micro.src-tag.is-apple', {}, 'Apple'))
          /* Someone who says they wear nothing but still has imported data
             gets a neutral label — naming a band they told us they do not
             own is the thing this whole pass exists to stop. */
          : el('span.micro.src-tag' + (src === 'apple' ? '.is-apple' : ''), {},
              mode === 'none' || !mode ? 'imported'
                : src === 'apple' ? 'Apple Watch' : bandName())),
      ...vitalRows,
      note ? el('div.vital-note', {}, note) : null));
  }

  /* ── the fortnight, at a glance ── */
  const recentRec = seriesFor(s.whoop, 'recovery', 14);
  if (recentRec.length > 3) {
    wrap.append(el('div.tile.tappable', {
      role: 'button', tabIndex: 0,
      onclick: () => openMetric(s, 'recovery', ctx),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMetric(s, 'recovery', ctx); } },
    },
      el('div.between', { style: { marginBottom: '10px' } },
        el('h3', {}, 'Recovery', icon('chevron', 14)),
        el('span.micro', {}, `last 14 days · avg ${Math.round(rec.recent.mean)}%`)),
      healthBars(recentRec.map(p => ({ v: p.v, label: `${p.date}: ${Math.round(p.v)}%` })), {
        h: 132, unit: '%', dp: 0, colourFor: recoveryColour,
      }),
      el('div.between', { style: { marginTop: '8px' } },
        el('span.micro', {}, 'green ≥67 · amber ≥34 · red below')),
    ));
  }

  if (rec && rec.drift != null && Math.abs(rec.drift) > 0.4) {
    wrap.append(el('div', { class: 'note ' + (rec.drift > 0 ? 'good' : 'warn') },
      el('div', {}, `Your last fortnight of recovery is running `
        + `${Math.abs(rec.drift).toFixed(1)} standard deviations ${rec.drift > 0 ? 'above' : 'below'} your full-period average `
        + `(${rec.recent.mean.toFixed(0)}% against ${rec.all.mean.toFixed(0)}%).`)));
  }

  return wrap;
}

/* A driver of recovery, small, tappable, with its own percentile. */
function sideStat(label, value, unit, dp, store, key, ctx) {
  if (value == null) return el('div.vitals-stat', {}, el('div.micro', {}, label), el('div.v', {}, '—'));
  const place = placeInRange(store.whoop, key, value);
  return el('div.vitals-stat', {
    role: 'button', tabindex: '0', style: { cursor: 'pointer' },
    'aria-label': `${label} ${value}`,
    onclick: () => openMetric(store, key, ctx),
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMetric(store, key, ctx); } },
  },
    el('div.micro', {}, label),
    el('div.v', {}, value.toFixed(dp) + (unit ? ' ' + unit : '')),
    el('div.d.micro', {}, place ? `${place.pct}th` : ''));
}

export function openMetric(s, metric, ctx) {
  const info = METRICS[metric];
  const series = seriesFor(s.whoop, metric);
  const latest = series[series.length - 1];
  const place = placeInRange(s.whoop, metric, latest.v);
  const base14 = baseline(s.whoop, metric, 14);
  const st = place.stats;

  sheet({
    title: info.label,
    body: el('div', {},
      el('div.tile', {},
        el('div.readout', {},
          el('div', {},
            el('div.micro', {}, 'Latest · ' + latest.date),
            el('div.readout-main', {}, latest.v.toFixed(info.dp),
              el('span.readout-pm', {}, ' ' + info.unit))),
          el('div.readout-side', {},
            el('div.micro', {}, 'Your median'),
            el('div.v', {}, st.p50.toFixed(info.dp)))),
        el('div', { style: { marginTop: '14px' } },
          el('div.micro', { style: { marginBottom: '6px' } }, 'Where today sits in your whole history'),
          distribution({ stats: st, value: latest.v, dp: info.dp }))),

      el('div.tile', {},
        el('div.micro', { style: { marginBottom: '8px' } }, `Last ${Math.min(60, series.length)} days`),
        healthBars(series.slice(-60).map(p => ({ v: p.v, label: `${p.date}: ${p.v}` })),
          { h: 140, colour: 'var(--accent)', unit: ' ' + info.unit, dp: info.dp })),

      el('div.tile', {},
        ...[
          ['Range', `${st.min.toFixed(info.dp)} – ${st.max.toFixed(info.dp)} ${info.unit}`],
          ['Typical middle half', `${st.p25.toFixed(info.dp)} – ${st.p75.toFixed(info.dp)} ${info.unit}`],
          ['Average', `${st.mean.toFixed(info.dp)} ${info.unit}`],
          ['Spread', `± ${st.sd.toFixed(info.dp)} ${info.unit}`],
          ['Last 14 days', `${base14.mean.toFixed(info.dp)} ${info.unit}`],
          ['Readings', String(st.n)],
        ].map(([k, v]) => el('div.between', { style: { padding: '7px 0', borderBottom: '1px solid var(--line)' } },
          el('span', { style: { fontSize: '13.5px', color: 'var(--text-2)' } }, k),
          el('span.num', { style: { fontSize: '13.5px' } }, v)))),

      el('div.note', {}, el('div', {},
        `Today is at the ${place.pct}th percentile of everything you've recorded, `
        + `${Math.abs(place.z).toFixed(1)} standard deviations ${place.z >= 0 ? 'above' : 'below'} your average. `
        + `Read that as ${place.verdict}.`)),
    ),
  });
}

/*
 * Sleep, opened up.
 *
 * The tile answers "how long"; this answers "made of what, and is that
 * normal for me". Stage hours are compared against your own recent
 * average rather than a textbook target, because the healthy share of
 * deep sleep varies enough between people that a fixed number would call
 * most nights abnormal.
 */
function openSleepDetail(s, ctx) {
  const w = s.whoop || {};
  /* Rows are keyed by date, not stored as an array — reading .days here
     found nothing and returned silently, which is why the pane opened
     onto no sheet at all. */
  const days = Object.entries(w.rows || {}).sort()
    .map(([date, r]) => ({ date, ...r }))
    .filter(d => d.sleepH);
  const last = days[days.length - 1];
  if (!last) { toast('No sleep recorded yet.'); return; }

  const light = n => Math.max(0, (n.sleepH || 0) - (n.remH || 0) - (n.swsH || 0));
  const recent = days.slice(-28);
  const avg = k => recent.length
    ? recent.reduce((a, d) => a + (k === 'light' ? light(d) : (d[k] || 0)), 0) / recent.length : 0;

  const stages = [
    { label: 'Deep', key: 'swsH',  value: last.swsH || 0, mean: avg('swsH'),  colour: 'var(--m-p)' },
    { label: 'REM',  key: 'remH',  value: last.remH || 0, mean: avg('remH'),  colour: 'var(--m-f)' },
    { label: 'Light', key: 'light', value: light(last),   mean: avg('light'), colour: 'var(--line-2)' },
  ];

  const durSeries = days.slice(-60).map(d => ({ v: d.sleepH, label: `${d.date}: ${d.sleepH.toFixed(1)} h` }));
  const dur = placeInRange(w, 'sleepH', last.sleepH);

  sheet({
    title: 'Sleep',
    body: el('div', {},
      el('div.tile.tile-hero', {},
        el('div.readout', {},
          el('div', {},
            el('div.micro', {}, last.date),
            el('div.readout-main', {}, last.sleepH.toFixed(1),
              el('span.readout-pm', {}, ' h'))),
          last.sleepPerf != null ? el('div.readout-side', {},
            el('div.micro', {}, 'Performance'),
            el('div.v', {}, Math.round(last.sleepPerf) + '%')) : null),
        el('div', { style: { marginTop: '16px' } }, stageBar(stages)),
        el('div.stage-key', {}, ...stages.map(st => el('span.micro', {},
          el('i', { style: { background: st.colour } }),
          `${st.label} ${st.value.toFixed(1)}h`)))),

      el('div.section-label', {}, el('span.micro', {}, 'Stages against your own 28-day average')),
      el('div.tile', {}, ...stages.map(st => {
        const diff = st.value - st.mean;
        const pct = last.sleepH ? (st.value / last.sleepH) * 100 : 0;
        return el('div.between', { style: { padding: '9px 0', borderBottom: '1px solid var(--line)' } },
          el('span', { style: { fontSize: '13.5px', color: 'var(--text-2)' } },
            el('i.dot', { style: { background: st.colour } }), st.label),
          el('span.num', { style: { fontSize: '13.5px' } },
            `${st.value.toFixed(1)} h · ${Math.round(pct)}% · `,
            el('span', { style: { color: Math.abs(diff) < 0.25 ? 'var(--muted)' : (diff > 0 ? 'var(--good)' : 'var(--caution)') } },
              `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`)));
      })),

      el('div.section-label', {}, el('span.micro', {}, 'Duration, last 60 nights')),
      el('div.tile', {}, healthBars(durSeries, { h: 150, colour: 'var(--accent)', unit: ' h', dp: 1 })),

      el('div.tile', {},
        el('div.micro', { style: { marginBottom: '6px' } }, 'Where last night sits in your history'),
        distribution({ stats: dur.stats, value: last.sleepH, dp: 1 })),

      last.debtH ? el('div.note', {}, el('div', {},
        `You are carrying ${last.debtH.toFixed(1)} h of sleep debt. Whoop accumulates that against `
        + 'your own need estimate, so it clears with a long night rather than several ordinary ones.')) : null,

      explain('Deep sleep front-loads the night and REM back-loads it, so a night cut short at '
        + 'the end loses REM disproportionately while one started late loses deep. That is why the '
        + 'split is worth reading alongside the total rather than instead of it.'),
    ),
  });
}

/* ── Import ─────────────────────────────────────────────────────────── */

/*
 * Live sync.
 *
 * Whoop does publish a developer API, so the weekly export-and-import chore
 * is avoidable: authorise once in the browser and this Mac keeps itself
 * topped up. The two keys live on this machine and never reach the phone.
 */
/*
 * Live sync through the relay.
 *
 * Everything here is about getting three things lined up: the relay is
 * deployed and has its credentials, the exact callback address is registered
 * with Whoop, and this app knows where the relay is. Each step checks
 * itself, because a mismatched redirect URI produces an error message from
 * Whoop that explains nothing.
 */
export function openWhoopRelay(ctx) {
  const s = get();
  const urlInput = el('input', {
    type: 'url', value: relayUrl(), placeholder: 'https://basal-whoop.<name>.workers.dev',
    autocapitalize: 'none', spellcheck: 'false',
  });
  const body = el('div');
  const sheetRef = { close: null };

  const render = async () => {
    const base = relayUrl();
    const connected = isConnected();
    let health = null;
    if (base) health = await checkRelay(base);

    replaceKids(body, 
      el('ol', { style: { color: 'var(--text-2)', fontSize: '13.5px', lineHeight: '1.75',
                          paddingLeft: '18px', marginTop: 0 } },
        el('li', {}, 'Deploy the worker from ', el('b', {}, 'relay/worker.js'), ' in the repo, on a free Cloudflare account.'),
        el('li', {}, 'Add ', el('b', {}, 'WHOOP_CLIENT_ID'), ' and ', el('b', {}, 'WHOOP_CLIENT_SECRET'), ' to it as secrets.'),
        el('li', {}, 'Register the worker’s ', el('b', {}, '/callback'), ' address at developer.whoop.com.'),
        el('li', {}, 'Paste the worker address below.')),

      field('Relay address', urlInput),
      el('div.btn-row', {},
        el('button.btn', {
          onclick: async () => {
            const v = urlInput.value.trim().replace(/\/+$/, '');
            const res = await checkRelay(v);
            if (!res.ok) { toast(res.error, 'err'); return; }
            commit(st => { st.settings.relayUrl = v; });
            toast('Relay reachable.');
            render();
          },
        }, 'Save and test')),

      health ? el('div', { class: 'note ' + (health.ok ? 'good' : 'warn') },
        el('div', {},
          el('b', {}, health.ok ? 'Relay is up' : 'Relay not reachable'),
          el('div.fine', { style: { marginTop: '3px' } },
            health.ok
              ? 'Register exactly this as the redirect URI at developer.whoop.com — character for character:'
              : health.error))) : null,

      health && health.ok ? el('div.tile', { style: { padding: '10px 12px' } },
        el('code', { class: 'num', style: { fontSize: '12px', wordBreak: 'break-all',
                                            color: 'var(--accent)' } }, health.redirectUri)) : null,

      el('div.divider'),

      connected
        ? el('div', {},
            el('div.note.good', {}, el('div', {},
              el('b', {}, 'Connected to Whoop'),
              el('div.fine', { style: { marginTop: '3px' } },
                'Syncs on its own when the app opens. Your tokens are stored on this device, not on the relay.'))),
            el('button.btn.primary.block', {
              onclick: async () => {
                toast('Syncing…');
                try {
                  const r = await syncWhoop({ days: 365 });
                  toast(`${r.count} days synced.`);
                  sheetRef.close && sheetRef.close();
                  ctx.refresh();
                } catch (e) { toast(String(e.message || e), 'err'); }
              },
            }, 'Sync now'),
            el('button.btn.block.ghost', { style: { marginTop: '10px' },
              onclick: () => { disconnect(); toast('Disconnected.'); render(); } }, 'Disconnect'))
        : el('button.btn.primary.block', {
            disabled: !(health && health.ok),
            onclick: () => { const u = connectUrl(); if (u) location.href = u; },
          }, 'Authorise with Whoop'),
    );
  };

  render();
  const sh = sheet({ title: 'Whoop live sync', body });
  sheetRef.close = sh.close;
  return sh;
}

export function openWhoopConnect(ctx) {
  const body = el('div');
  const s = sheet({ title: 'Whoop', body });

  const draw = async () => {
    body.replaceChildren(el('div.tile.flex', {}, el('div.spinner'),
      el('span.dim', {}, 'Checking…')));

    let st;
    try {
      st = await (await fetch('api/whoop/status')).json();
    } catch {
      body.replaceChildren(el('div.note.warn', {}, el('div', {},
        'The Mac server is not running, so syncing is unavailable. You can still load a CSV export.')));
      return;
    }

    const parts = [];

    if (!st.configured) {
      parts.push(
        el('div.note.info', {}, el('div', {},
          el('b', {}, 'One-time setup'),
          el('div.fine', { style: { marginTop: '3px' } },
            'Whoop needs you to register an app before it will hand over your own data. It takes a few minutes and is free.'))),
        el('ol', { style: { color: 'var(--text-2)', fontSize: '13.5px', lineHeight: '1.75', paddingLeft: '18px' } },
          el('li', {}, 'Go to ', el('b', {}, 'developer.whoop.com'), ' and sign in with your Whoop account.'),
          el('li', {}, 'Create an app. Any name will do.'),
          el('li', {}, 'Set the redirect URI to exactly this:'),
          el('li', {}, 'Copy the Client ID and Client Secret it gives you.'),
          el('li', {}, 'Save them on the Mac at ', el('b', {}, 'data/whoop_credentials.json'), '.')),
        el('div.note.info', {}, el('div.fine', {},
          'Do the authorisation step on the Mac itself, in a browser at localhost — not from your phone. '
          + 'Whoop checks the return address character for character, and only the Mac address is registered. '
          + 'Your phone never needs to do it; it just reads what the Mac has already fetched.')),
        el('div.tile', { style: { padding: '10px 12px' } },
          el('code', { class: 'num', style: { fontSize: '12px', wordBreak: 'break-all', color: 'var(--accent)' } },
            st.redirect_uri)),
        el('div.tile', { style: { padding: '10px 12px' } },
          el('code', { class: 'num', style: { fontSize: '11.5px', whiteSpace: 'pre-wrap', color: 'var(--text-2)' } },
            '{\n  "client_id": "…",\n  "client_secret": "…"\n}')),
        el('div.fine', {}, 'Restart the server after saving the file, then reopen this panel.'),
        el('button.btn.block', { style: { marginTop: '12px' }, onclick: draw }, 'Check again'));
    } else if (!st.connected) {
      parts.push(
        el('div.note.good', {}, el('div', {},
          el('b', {}, 'Keys found'),
          el('div.fine', { style: { marginTop: '3px' } },
            'One authorisation left. Whoop will ask you to approve read access, then send you back here.'))),
        el('button.btn.primary.block', {
          onclick: () => { window.open('api/whoop/connect', '_blank'); },
        }, 'Authorise with Whoop'),
        el('div.fine', { style: { marginTop: '10px' } },
          'A tab opens on whoop.com. Approve it, then come back and press Sync.'),
        el('button.btn.block', { style: { marginTop: '10px' }, onclick: draw }, "I've approved it"));
    } else {
      const last = st.last_sync
        ? new Date(st.last_sync * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : 'never';
      parts.push(
        el('div.note.good', {}, el('div', {},
          el('b', {}, 'Connected'),
          el('div.fine', { style: { marginTop: '3px' } },
            `Last pulled ${last}. ${st.cached_days} days on the Mac. `
            + 'Nothing to upload again — it refreshes itself whenever the app opens with the server running.'))),
        el('button.btn.primary.block', { onclick: () => runSync(true) }, 'Sync now'),
        el('button.btn.block.ghost', { style: { marginTop: '10px' }, onclick: async () => {
          if (await confirmSheet({ title: 'Disconnect Whoop?',
            message: 'The stored authorisation is deleted from this Mac. Data already imported stays.',
            confirmLabel: 'Disconnect', danger: true })) {
            await fetch('api/whoop/disconnect'); draw();
          }
        } }, 'Disconnect'));
    }

    body.replaceChildren(...parts);
  };

  const runSync = async (loud) => {
    body.replaceChildren(el('div.tile.flex', {}, el('div.spinner'),
      el('span.dim', {}, 'Pulling from Whoop…')));
    try {
      const r = await (await fetch('api/whoop/sync')).json();
      if (!r.ok) {
        body.replaceChildren(el('div.note.warn', {}, el('div', {}, r.error)),
          el('button.btn.block', { style: { marginTop: '10px' }, onclick: draw }, 'Back'));
        return;
      }
      commit(st2 => { st2.whoop = { rows: r.rows, importedAt: Date.now(), source: 'api' }; }, 'whoop');
      if (loud) toast(`${r.count} days synced.`);
      s.close();
      ctx.refresh();
    } catch (e) {
      body.replaceChildren(el('div.note.warn', {}, el('div', {}, String(e))));
    }
  };

  draw();
  return s;
}

/* Quietly top up whenever the server is reachable and already authorised. */
export async function autoSyncWhoop() {
  try {
    const st = await (await fetch('api/whoop/status')).json();
    if (!st.connected) return false;
    const r = await (await fetch('api/whoop/sync?days=120')).json();
    if (!r.ok || !r.count) return false;
    commit(s => { s.whoop = { rows: r.rows, importedAt: Date.now(), source: 'api' }; }, 'whoop');
    return true;
  } catch { return false; }
}

export function openWhoopImport(ctx) {
  const file = el('input', { type: 'file', accept: '.zip,.csv,text/csv,application/zip' });
  const status = el('div');

  const load = async f => {
    if (!f) return;
    status.replaceChildren(el('div.flex', {}, el('div.spinner'), el('span', {}, 'Reading…')));
    try {
      const res = await importWhoopFile(f);
      commit(st => { st.whoop = { rows: res.rows, importedAt: Date.now() }; }, 'whoop');
      status.replaceChildren(el('div.note.good', {},
        el('div', {}, `Imported ${res.count} days, ${res.from} to ${res.to}.`
          + (res.filename ? ` From ${res.filename} inside the zip.` : ''))));
      toast(`${res.count} days of Whoop data in.`);
      setTimeout(() => { s.close(); ctx.refresh(); }, 900);
    } catch (e) {
      status.replaceChildren(el('div.note.warn', {}, el('div', {}, e.message)));
    }
  };

  file.addEventListener('change', () => load(file.files[0]));

  const s = sheet({
    title: 'Import Whoop data',
    body: el('div', {},
      el('ol', { style: { color: 'var(--text-2)', fontSize: '13.5px', lineHeight: '1.7', paddingLeft: '18px', marginTop: 0 } },
        el('li', {}, 'Open whoop.com and sign in.'),
        el('li', {}, 'Settings, then Download my data.'),
        el('li', {}, 'Whoop emails you a zip. Save it to Files.'),
        el('li', {}, 'Pick the ', el('b', {}, 'zip itself'), ' below — no need to unzip it.')),
      el('button.btn.primary.block', { onclick: () => { s.close(); openWhoopConnect(ctx); } },
        'Set up automatic sync instead'),
      el('div.divider'),
      field('Whoop export', file,
        'The .zip straight from Whoop, or a single .csv if you have already unzipped it.'),
      status,
      el('div.note', {}, el('div', {},
        'Nothing leaves this device. The file is parsed in the browser and stored locally.'))),
  });
  return s;
}

/* ── Food against recovery ──────────────────────────────────────────── */

function correlationTile(s) {
  if (!s.whoop || !Object.keys(s.whoop.rows || {}).length) return el('div');

  const res = nutritionVsRecovery(s, 'recovery');
  if (res.paired < 14) {
    return el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Food against recovery')),
      el('div.tile', {}, el('div.dim', { style: { fontSize: '13.5px', lineHeight: '1.5' } },
        `${res.paired} days so far have both a food log and a Whoop recovery the next morning. `
        + `At 14 the app will start comparing them and tell you which of your inputs actually tracks with how you wake up.`)));
  }

  const strong = res.findings.filter(f => f.strong).slice(0, 4);

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Food against next-day recovery')),
    el('div.tile.flush', {},
      ...(strong.length ? strong : res.findings.slice(0, 3)).map(f =>
        el('div.row', {},
          el('span.grow', {},
            el('div.title', {}, f.label),
            el('div.sub', {}, `${f.n} paired days${f.strong ? '' : ' · weak, treat as noise'}`)),
          el('span.kcal', {
            style: { color: f.strong ? (f.r > 0 ? 'var(--good)' : 'var(--warn)') : 'var(--muted)' },
          }, (f.r > 0 ? '+' : '') + f.r.toFixed(2))))),
    el('div.note', {}, el('div', {},
      'These are correlations across your own days, not causes. '
      + 'Use them to pick something worth testing deliberately for a fortnight, then check whether it held.')),
  );
}


/*
 * Which bands you wear, asked once.
 *
 * Four setups, and the app genuinely behaves differently in each: what it
 * offers to sync, what it can show, and — for the person wearing both —
 * which readings it is willing to take from which device.
 */
export function openHealthSetup(ctx) {
  const OPTIONS = [
    ['whoop', 'Whoop only',
     'Recovery, strain, HRV, resting heart rate, sleep stages, blood oxygen, skin temperature '
     + 'and respiratory rate. No step count — Whoop measures steps but its API does not hand them over.'],
    ['apple', 'Apple Watch only',
     'Steps, heart rate, sleep and energy, pushed from the Health app by a Shortcut. '
     + 'No recovery or strain score — those are Whoop\u2019s own calculations.'],
    ['both', 'Both',
     'Whoop supplies everything it measures. Apple fills only the gap: steps. '
     + 'HRV is never taken from both — Whoop reports RMSSD and Apple reports SDNN, '
     + 'and a trend mixing the two would be meaningless.'],
    ['none', 'Neither',
     'Everything except recovery and strain still works: intake, weight trend, '
     + 'adaptive TDEE and the quality breakdown.'],
  ];

  const body = el('div');
  const draw = () => {
    const cur = healthSource();
    replaceKids(body, ...OPTIONS.map(([v, label, note]) =>
      el('button.pick-row' + (cur === v ? '.is-on' : ''), {
        onclick: () => { setHealthSource(v); haptic('tap'); draw(); ctx.refresh?.(); },
      },
        el('div.grow', {},
          el('div.pick-name', {}, label),
          el('div.fine', {}, note)),
        cur === v ? icon('check', 16) : null)));
  };
  draw();

  return sheet({ title: 'What do you wear?', body });
}
