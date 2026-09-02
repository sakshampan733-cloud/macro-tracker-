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
import { get, commit, dayKey, shiftDay, setWeight, clearWeight, peekDay, weightSeries, totals, isMorningWeigh } from '../store.js';
import {
  importWhoopCSV, importWhoopFile, summary, METRICS, seriesFor, placeInRange, baseline,
  nutritionVsRecovery, stats,
} from '../whoop.js';
import { trendWeight, adaptiveTDEE, bestTDEE, whoopTDEE, predictedTDEE, checkIn, checkInVerdict, planVsActual } from '../nutrition.js';
import { trainStats } from '../store.js';
import { stepReport, stepTarget, stepsWorth, suggestedTarget } from '../steps.js';
import { calibrationTile } from './dish.js';
import { bloodTile } from './blood.js';
import {
  ring, stageBar, liveDot, recoveryColour,
  healthBars, healthLine, miniSpark, appleChart, activityRings, dualLine,
} from '../charts.js';
import { haptic } from '../feedback.js';
import { openReport } from './report.js';
import { openAppleHealth } from './apple.js';
import { sleepTile, sleepSchedule, sleepHours, clockText } from './sleep.js';
import { weightUnit, kgToLb, lbToKg, showWeight } from '../units.js';
import {
  existingSource, sourceForMetric, healthSource, setHealthSource, canMeasure, bandName,
  relayBase, rowsFor,
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
      el('button.btn.sm.ghost', { onclick: () => openReport(ctx, 7) }, 'Report'))),
    sourceBar(s, ctx) || el('div'),
    vitalsSection(s, ctx) || el('div'),
    senseTile(s, ctx) || el('div'),
    stepsTile(s, ctx) || el('div'),
    checkInTile(s, ctx),
    weightTile(ctx),
    tdeeTile(s),
    calibrationTile(s) || el('div'),
    bloodTile(s, ctx),
    correlationTile(s),
  );
}


/*
 * Steps, treated as a lever rather than a statistic.
 *
 * The number was already on this screen in a card the size of a stamp,
 * alongside blood oxygen — which files it as something that happens to
 * you. It is the opposite: it is the one part of the burn that answers to
 * a decision. Metabolism does not, and training is a few hours a week
 * against sixteen waking hours a day.
 *
 * Days hit rather than an average, because the average hides the shape.
 * Twelve thousand on Saturday does not undo four days of two thousand, and
 * it was the four days the deficit noticed.
 */
function stepsTile(s, ctx) {
  const r = stepReport(14);
  if (!r.target && !r.series.length) return null;

  if (!r.ready) {
    return el('div.tile', {},
      el('div.tile-head', {}, el('h3', {}, 'Steps')),
      el('div.fine', {},
        'A few more days of step counts and this can show you where the week is '
        + 'actually being won or lost.'));
  }

  const worth = stepsWorth(r.mean, s.profile?.weightKg);
  const pct = r.target ? Math.min(100, Math.round((r.median / r.target) * 100)) : null;

  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, 'Steps'),
      el('button.btn.sm.ghost', { onclick: () => openStepTarget(ctx) },
        r.target ? `target ${r.target.toLocaleString()}` : 'set a target')),

    el('div.between', { style: { marginBottom: '9px' } },
      el('div', {},
        el('div.micro', {}, r.today != null ? 'Today' : 'Typical day'),
        el('div.num', { style: { fontSize: '25px', marginTop: '2px' } },
          (r.today != null ? r.today : r.median).toLocaleString()),
        el('div.micro', { style: { marginTop: '2px' } },
          `typical ${r.median.toLocaleString()}`)),
      el('div', { style: { textAlign: 'right' } },
        el('div.micro', {}, 'Hit the target'),
        el('div.num', { style: { fontSize: '18px', marginTop: '2px',
          color: r.hit >= r.days * 0.6 ? 'var(--good-ink)' : 'var(--caution)' } },
          `${r.hit} of ${r.days}`),
        r.worst.length ? el('div.micro', { style: { marginTop: '2px' } },
          `lowest ${r.worst[0].steps.toLocaleString()}`) : null)),

    /* One bar a day, against the target line, so a bad run is visible as a
       run rather than as a lower average. */
    el('div.step-bars', {},
      ...r.series.map(d => {
        const h = r.target ? Math.min(100, (d.steps / r.target) * 100) : 50;
        return el('span.step-col', { title: `${d.date}: ${d.steps.toLocaleString()}` },
          el('i' + (r.target && d.steps >= r.target ? '.is-hit' : ''),
            { style: { height: Math.max(4, h) + '%' } }));
      })),
    /*
     * Nothing under the bars.
     *
     * Everything worth knowing is already above them — today, the target,
     * how many days hit it — and a paragraph restating that in sentences
     * turns a widget into an essay. Typical and lowest move up into the
     * caption row where they cost one line instead of three, and the
     * reasoning goes behind the Reading setting where it can be read once.
     */
    /* The lowest day is already in the caption above, so the sentence
       repeating it went. What is left is the one thing the numbers cannot
       say for themselves: that this walking is already counted. */
    explain(worth
      ? `≈${worth.lo}–${worth.hi} kcal, already inside your band's burn — not on top of it.`
      : '', { style: { marginTop: '8px' } }));
}

function openStepTarget(ctx) {
  const cur = stepTarget();
  const sugg = suggestedTarget();
  const input = el('input.num-in', {
    type: 'number', inputmode: 'numeric', step: '500', min: '1000', max: '40000',
    value: cur || '',
    placeholder: sugg ? String(sugg) : '8000',
  });
  const sh = sheet({
    title: 'Step target',
    body: el('div', {},
      el('div.fine', { style: { marginBottom: '12px' } },
        sugg
          ? `Suggested: ${sugg.toLocaleString()} — the middle of your own last four weeks, `
            + 'nudged up. A target set above anything you have ever done is one you learn '
            + 'to ignore.'
          : 'Ten thousand is a figure from a 1960s pedometer advert, not a finding. Pick '
            + 'something a little above your own normal day.'),
      el('div.field', {}, input),
      el('div.fine', { style: { marginTop: '10px' } },
        'Walking is the only part of your daily burn that answers to a decision, which is '
        + 'why it is worth a target at all. It is already counted in what your band '
        + 'reports — this is about noticing the quiet days, not about adding calories.')),
    foot: el('div.btn-row', {},
      cur != null ? el('button.btn.ghost', {
        onclick: () => { commit(st => { delete st.settings.stepTarget; }, 'settings');
          toast('Back to the suggested target.'); sh.close(); ctx.refresh(); },
      }, 'Use the suggestion') : null,
      el('button.btn.primary.grow', {
        onclick: () => {
          const v = Math.round(+input.value);
          if (!(v >= 1000 && v <= 40000)) { toast('Pick something between 1,000 and 40,000.', 'err'); return; }
          commit(st => { st.settings.stepTarget = v; }, 'settings');
          haptic('success'); toast(`Target set to ${v.toLocaleString()}.`);
          sh.close(); ctx.refresh();
        },
      }, 'Save')),
  });
  return sh;
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

  const toneColour = { good: 'var(--good-ink)', warn: 'var(--warn)', info: 'var(--m-p)' };

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
  /*
   * Two numbers, both named, and a change over a window you can hold in
   * your head.
   *
   * This led with the trend and reported the trend's movement since your
   * very first weigh-in. Both are defensible and together they were badly
   * misleading: step on the scale at 90.0 after a fortnight at 91.0 and
   * the tile answered "90.9, down 0.1" — the smoothed figure against an
   * anchor two years back, while you were looking at the number you had
   * just typed.
   *
   * The reading you took leads now. The trend sits beside it, labelled,
   * because it is the one that means something over weeks. And the change
   * is measured over thirty days rather than over all history.
   */
  const scale = latest ? latest.kg : null;
  const cutoff = shiftDay(key, -30);
  const monthAgo = withTrend.filter(p => p.date <= cutoff).pop() || withTrend[0];
  const change = latest && monthAgo ? latest.trend - monthAgo.trend : 0;
  const spanDays = latest && monthAgo
    ? Math.round((new Date(latest.date) - new Date(monthAgo.date)) / 86400000) : 0;

  /*
   * One weight widget, two lines.
   *
   * Where your weight is and where your log says it should be were two
   * separate tiles, one directly under the other, both drawing weight
   * against time. Splitting them meant the comparison — the only thing
   * either chart is for — had to be done by eye across a gap. They are one
   * chart now: the dashed line is the prediction, the solid one is you.
   */
  const pv = planVsActual(s);
  const recent = withTrend.slice(-90);
  const chart = pv.ready
    ? dualLine(pv.points.map(p => ({
        a: toDisp(p.expected), b: p.actual == null ? null : toDisp(p.actual),
      })), { h: 168, aColour: 'var(--muted)', bColour: 'var(--accent)', unit: ' ' + wu, dp: 1 })
    : withTrend.length > 2
      ? healthLine(
          recent.map(p => ({ v: toDisp(p.trend), label: `${p.date}: ${toDisp(p.kg).toFixed(1)} ${wu}` })),
          { h: 146, colour: 'var(--accent)', unit: ' ' + wu, dp: 1,
            raw: recent.map(p => ({ v: toDisp(p.kg) })) })
      : null;

  return el('div.tile', {},
    el('div.tile-head', {},
      el('h3', {}, 'Weight'),
      latest ? el('button.btn.sm.ghost', {
        onclick: () => openWeightHistory(ctx),
      }, `${withTrend.length} weigh-ins`) : null),

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
          el('div.micro', {}, 'Last weigh-in · ' + dateLabel(latest.date)),
          el('div.num', { style: { fontSize: '26px', marginTop: '2px' } }, toDisp(scale).toFixed(1),
            el('span', { style: { fontSize: '12px', color: 'var(--muted)', marginLeft: '3px' } }, wu))),
        el('div', { style: { textAlign: 'center' } },
          el('div.micro', {}, '10-day trend'),
          el('div.num', { style: { fontSize: '20px', marginTop: '3px', color: 'var(--text-2)' } },
            toDisp(latest.trend).toFixed(1))),
        el('div', { style: { textAlign: 'right' } },
          el('div.micro', {}, spanDays >= 7 ? `Trend, ${spanDays} days` : 'Trend change'),
          el('div.num', {
            style: { fontSize: '18px', marginTop: '2px', color: change < 0 ? 'var(--good-ink)' : change > 0 ? 'var(--m-c-ink)' : 'var(--text)' },
          }, (change >= 0 ? '+' : '') + toDisp(change).toFixed(1) + ' ' + wu))),
      /* Why the trend disagrees with the scale is worth saying once, not
         under every weigh-in. The Reading setting decides. */
      Math.abs(scale - latest.trend) > 0.35
        ? explain(`The trend is ${toDisp(Math.abs(scale - latest.trend)).toFixed(1)} ${wu} `
            + `${scale < latest.trend ? 'above' : 'below'} today's reading because it is smoothed over `
            + 'ten days — one weigh-in moves it about a tenth of the way. That lag is the point: '
            + 'it is what stops a salty dinner reading as a gain.', { style: { marginTop: '6px' } })
        : null,
      pv.ready ? el('div.dl-key', { style: { marginTop: '10px' } },
        el('span.micro', {}, el('i.dl-dash'), 'What your log predicts'),
        el('span.micro', {}, el('i.dl-solid'), 'What you weigh')) : null,
      chart,
      pv.ready
        ? el('div.fine', { style: { marginTop: '6px' } },
            weightVerdict(pv, wu, toDisp))
        : el('div.fine', { style: { marginTop: '6px' } },
            'Thick line is the ten-day trend — that is the one that means anything.'),
      pv.ready
        ? explain(`Maintenance ${kcal(pv.maintenance)} kcal, from the ${pv.maintenanceSource} figure.`
            + (pv.skipped ? ` ${pv.skipped} unlogged day${pv.skipped === 1 ? '' : 's'} `
                            + 'contributed nothing rather than being assumed.' : ''),
            { style: { marginTop: '5px' } })
        : null)
      : el('div.fine', { style: { marginTop: '12px' } },
          'Weigh in most mornings. Four readings and the app can work out your real maintenance calories.'),
  );
}

/* ── Maintenance calories ───────────────────────────────────────────── */

/*
 * What the gap between the two weight lines means.
 *
 * The direction is the whole finding, and the two directions need opposite
 * responses — so it is named rather than left to be inferred from which
 * line happens to be on top.
 */
function weightVerdict(pv, wu, toDisp) {
  const gap = pv.gapKg ?? 0;
  const drift = Math.abs(gap);
  /* Half a kilo is inside what a scale and a 7,700-per-kilo approximation
     can disagree about on their own. */
  if (drift < 0.5) return 'The two lines agree, so the calories you are logging are broadly the real ones.';
  const by = `${toDisp(drift).toFixed(1)} ${wu}`;
  return gap > 0
    ? `You are ${by} heavier than your log predicts — either food is going unlogged, `
      + 'or maintenance is set too high.'
    : `You are ${by} lighter than your log predicts — maintenance is probably set too low, `
      + 'which makes your target stricter than it needs to be.';
}

/*
 * Does the whole picture hold together?
 *
 * Training, food and the scale are three separate records, and each is
 * only worth something read against the other two. Training hard on an
 * honest deficit while the scale refuses to move means one of the three is
 * not what it claims, and knowing which is the entire reason for keeping
 * all three.
 *
 * It lives here rather than on the Train tab because this is a statement
 * about a body, not about a training week. It refuses to give a verdict
 * when a record is missing — two out of three is a guess in the clothes of
 * a finding.
 */
function senseTile(s, ctx) {
  const st = trainStats(28);
  const pv = planVsActual(s);
  const hasTraining = st.sessions > 0;
  if (!hasTraining && !pv.ready) return null;

  const rows = [
    senseRow('Training', hasTraining ? `${st.perWeek}/week` : 'nothing logged', st.perWeek >= 2.5),
    senseRow('Food logged', pv.have ? `${pv.have.loggedDays} days` : '0 days',
             (pv.have?.loggedDays || 0) >= 14),
    senseRow('Weight vs log', pv.ready ? `${pv.gapKg >= 0 ? '+' : ''}${pv.gapKg.toFixed(1)} kg` : 'not enough yet',
             pv.ready && Math.abs(pv.gapKg) < 0.5),
  ];

  let head, body;
  if (!pv.ready) {
    head = 'Not enough to judge yet.';
    body = `You have trained ${st.sessions} time${st.sessions === 1 ? '' : 's'} in four weeks. `
         + 'Whether that is working needs your food logged and a few weigh-ins too — '
         + 'training alone cannot say whether you are gaining or losing, only that you turned up.';
  } else {
    const gap = pv.gapKg ?? 0;
    const onPlan = Math.abs(gap) < 0.5;
    const consistent = st.perWeek >= 2.5;
    const cutting = (s.profile?.rate ?? 0) < -0.05;
    if (onPlan && consistent) {
      head = 'It holds together.';
      body = `Training ${st.perWeek} times a week, and your weight is doing what your food `
           + 'log says it should. All three records agreeing is the only state in which any '
           + 'of them can be trusted.';
    } else if (onPlan) {
      head = 'The food side is honest; the training is thin.';
      body = 'Your weight is tracking your log closely, so the eating is being recorded '
           + `properly. But ${st.perWeek} sessions a week is not much stimulus — in a `
           + (cutting ? 'deficit that is how weight comes off muscle as well as fat.'
                      : 'surplus that is how a gain ends up being mostly fat.');
    } else if (gap > 0) {
      head = consistent ? 'You are training. The food is not adding up.' : 'Neither side is holding.';
      body = `You are ${Math.abs(gap).toFixed(1)} kg heavier than your log predicts. `
           + (cutting ? 'Food is going unlogged, or maintenance is set too high — the training '
                        + 'is not the problem here.'
                      : 'If you are gaining on purpose, that is faster than planned rather than wrong.');
    } else {
      head = 'You are losing faster than the plan.';
      body = `You are ${Math.abs(gap).toFixed(1)} kg lighter than your log predicts. `
           + (consistent ? 'With this much training that is a real risk to muscle — maintenance '
                           + 'is probably set too low, and your target stricter than it needs to be.'
                         : 'Maintenance is probably set too low.');
    }
  }

  return el('div.tile', {},
    el('div.tile-head', {}, el('h3', {}, 'Is it working?')),
    el('div.sense-rows', {}, ...rows),
    el('div.note' + (/holds together/.test(head) ? '' : '.info'), {},
      el('div', {}, el('b', {}, head), ' ', body)));
}

const senseRow = (name, value, ok) => el('div.sense-row', {},
  el('span.sense-dot' + (ok ? '.is-ok' : '')),
  el('span.grow', {}, name),
  el('span.sense-val', {}, value));

/*
 * Every weigh-in, editable.
 *
 * A weight was the one thing in the app you could write and never unwrite
 * — no list, no edit, no delete. Type 19.0 instead of 91.0 with wet
 * fingers and it sat in the trend forever, dragging every downstream
 * figure with it: the trend line, the adaptive maintenance, the gap
 * between your log and the scale.
 */
function openWeightHistory(ctx) {
  const s = get();
  const wu = weightUnit(s);
  const toDisp = kg => (wu === 'lb' ? kgToLb(kg) : kg);
  const fromDisp = v => (wu === 'lb' ? lbToKg(v) : v);

  const list = el('div');
  const draw = () => {
    clear(list);
    const rows = weightSeries().slice().reverse();
    if (!rows.length) { list.append(el('div.fine', {}, 'Nothing logged yet.')); return; }
    const trend = new Map(trendWeight(weightSeries()).map(p => [p.date, p.trend]));
    for (const r of rows.slice(0, 120)) {
      const input = el('input.num-in', {
        type: 'number', inputmode: 'decimal', step: '0.1',
        value: toDisp(r.kg).toFixed(1),
      });
      /* A weight taken in the evening is not a late morning weight — it
         carries a kilo or two of food and water that a morning one does
         not, and the amount changes daily. Marked, so a reading that does
         not belong beside the others can be seen rather than quietly
         moving the trend. */
      const late = r.hour != null && !isMorningWeigh(r.hour);
      list.append(el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, dateLabel(r.date),
            late ? el('span.late-tag', {}, clockText(r.hour)) : null),
          el('div.sub', {}, `trend ${toDisp(trend.get(r.date) ?? r.kg).toFixed(1)} ${wu}`
            + (late ? ' · not a morning reading' : ''))),
        input,
        el('button.btn.sm.ghost', {
          onclick: () => {
            const kg = fromDisp(+input.value);
            if (!(kg > 20 && kg < 400)) { toast(`That does not look like a weight in ${wu}.`, 'err'); return; }
            setWeight(r.date, kg); haptic('tap'); toast('Updated.'); draw(); ctx.refresh();
          },
        }, 'Save'),
        el('button.btn.sm.ghost.is-danger', {
          'aria-label': `Delete the weigh-in for ${r.date}`,
          onclick: () => confirmSheet({
            title: `Delete ${dateLabel(r.date)}?`,
            body: `${toDisp(r.kg).toFixed(1)} ${wu} will be removed. The trend and your `
                + 'maintenance figure both recalculate without it.',
            confirm: 'Delete', danger: true,
            onConfirm: () => { clearWeight(r.date); haptic('tap'); toast('Deleted.'); draw(); ctx.refresh(); },
          }),
        }, icon('trash', 14))));
    }
  };
  draw();
  return sheet({
    title: 'Weigh-ins',
    body: el('div', {},
      el('div.fine', { style: { marginBottom: '12px' } },
        'Newest first. Change a number and save it, or delete one you did not mean to '
        + 'log — the trend and your maintenance figure both recalculate.'),
      list),
  });
}

function tdeeTile(s) {
  if (!s.profile) return el('div');
  const best = bestTDEE(s, s.profile);
  const adaptive = adaptiveTDEE(s);
  const predicted = predictedTDEE(s.profile);

  /*
   * The burn row follows the band you are looking at.
   *
   * This tile always said "Whoop", including on the Apple view, where the
   * number underneath it had been measured by an Apple Watch. The label
   * was hard-coded to the declared setup rather than read from the data,
   * so the one card whose entire job is to say where your maintenance
   * figure comes from was the card getting it wrong.
   */
  const mode = healthSource();
  const pick = effectivePick(s);
  const scopedRows = mode === 'both' && pick !== 'all' ? rowsFor(s, pick) : null;
  const whoop = whoopTDEE(s, 14, scopedRows);

  const bandLabel =
    mode === 'apple' ? 'Apple Watch'
    : mode === 'whoop' ? 'Whoop'
    : mode === 'both'
      ? (pick === 'apple' ? 'Apple Watch' : pick === 'whoop' ? 'Whoop' : 'Whoop + Apple')
      : 'Your band';

  /* Said from the counted provenance, not from the setting: on both bands
     the merge keeps Whoop's burn and never averages the two, and this is
     the sentence that tells you so. */
  const bandNote = !whoop.ready ? 'Device-measured daily burn'
    : whoop.fromApple && whoop.fromWhoop
      ? `${whoop.fromWhoop} days from Whoop, ${whoop.fromApple} from Apple. Never averaged.`
    : whoop.fromApple
      ? `Measured by your Apple Watch over ${whoop.days} days`
      : mode === 'both' && pick === 'all'
        ? `Whoop measured all ${whoop.days} days, so Whoop is the one in use`
        : `Measured by your ${bandLabel} over ${whoop.days} days`;

  const rows = [
    { key: 'adaptive', label: 'Adaptive', note: 'From your own intake and weight trend', res: adaptive },
    { key: 'whoop', label: bandLabel, note: bandNote, res: whoop },
    { key: 'predicted', label: 'Formula', note: predicted.method, res: predicted },
  ];

  /* "in use: whoop" was a variable name showing through to the reader. */
  const inUseName = best.source === 'whoop' ? bandLabel
    : best.source === 'adaptive' ? 'Adaptive'
    : best.source === 'predicted' ? 'Formula' : best.source;

  return el('div.tile', {},
    el('div.tile-head', {}, el('h3', {}, 'Maintenance calories'),
      el('span.micro', {}, 'in use: ' + inUseName)),

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

    /* The working stays available and stops being unavoidable: a note that
       shows a derivation under a figure that already carries its own ± is
       the kind of thing you read once. What is not ready is still said
       outright, because that one is a thing to act on. */
    adaptive.ready
      ? explain(`Over ${adaptive.spanDays} days you averaged ${kcal(adaptive.meanIntake)} kcal and your `
          + `trend weight moved ${adaptive.slopeKgPerWeek >= 0 ? '+' : ''}${adaptive.slopeKgPerWeek} kg a week — `
          + `real maintenance ${kcal(adaptive.kcal)} ±${adaptive.sigma}, with ${adaptive.scatterKg} kg of `
          + 'scale scatter making up most of that ±.', { style: { marginTop: '10px' } })
      : el('div.note.info', {},
        el('div', {}, `Needs ${adaptive.need.intakeDays} logged days and ${adaptive.need.weighIns} weigh-ins. `
          + `You have ${adaptive.have.intakeDays} and ${adaptive.have.weighIns}.`)),
  );
}

const notReadyNote = r =>
  r.key === 'adaptive'
    ? `Needs ${r.res.need.intakeDays} logged days and ${r.res.need.weighIns} weigh-ins`
    : r.key === 'whoop'
      ? `Needs 5 days of measured burn — there ${r.res.have === 1 ? 'is' : 'are'} ${r.res.have || 0}`
      : '';

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
/*
 * Which band's readings the panel shows.
 *
 * Three states, all of them a button. "Both" was previously the state you
 * reached by having no chip selected, which is not a state anybody can
 * find — you could get out of it and then not back into it. A mode you
 * cannot name on screen is a mode that does not exist.
 */
/*
 * Whose readings this whole tab is showing.
 *
 * At the top rather than tucked into one card, because it governs the
 * whole page: pick Apple and the hero, the vitals and the charts all
 * become the watch's, which is the only way to see what the app looks
 * like for somebody who owns one. Only shown when you wear both — with a
 * single band there is nothing to choose between.
 */
function sourceBar(s, ctx) {
  if (healthSource() !== 'both') return null;
  const cur = s.settings?.vitalsSource || 'all';
  return el('div.source-bar', {},
    el('span.micro', {}, 'Showing'),
    el('div.flex', { style: { gap: '5px' } },
      srcChip('all', 'Both', cur, ctx),
      srcChip('whoop', 'Whoop', cur, ctx),
      srcChip('apple', 'Apple', cur, ctx)));
}

/*
 * Which band this tab is showing, given what you actually wear.
 *
 * The stored setting is only meaningful on two bands. With one, the band
 * you own is the answer and the setting is ignored rather than obeyed.
 */
function effectivePick(s) {
  const mode = healthSource();
  if (mode === 'apple') return 'apple';
  if (mode === 'both') return s.settings?.vitalsSource || 'all';
  return 'all';
}

function srcChip(which, label, current, ctx) {
  const on = current === which;
  return el('button.micro.src-tag'
      + (which === 'apple' ? '.is-apple' : which === 'all' ? '.is-both' : '')
      + (on ? '.is-on' : ''), {
    'aria-pressed': String(on),
    title: which === 'all' ? 'Whoop, plus the steps only Apple counts' : `Show only ${label}`,
    onclick: () => {
      if (on) return;                     /* already showing it */
      commit(st => { st.settings.vitalsSource = which; }, 'settings');
      haptic('tap');
      ctx.refresh();
    },
  }, label);
}

/*
 * The Health-app categories, and which of Apple's readings sit in each.
 *
 * The grouping is Apple's own, not one invented here: blood oxygen is
 * filed under Respiratory in Health rather than under Heart, and wrist
 * temperature under Body Measurements. Somebody checking this against
 * their own phone should find the same reading in the same place.
 */
/*
 * One card vocabulary for every reading, whichever band produced it.
 *
 * The Apple view got this treatment first and it turned out to be the
 * better screen — a reading filed under a coloured category, named, with
 * the number large and the unit small, is legible in a way a grey row of
 * figures never was. There was never a reason for Whoop's numbers to look
 * worse; the categories are physiology, not branding, and a resting heart
 * rate belongs under Heart no matter what measured it.
 *
 * So this is the whole table now, Whoop's own scores included, and both
 * views build from it. Sleep is deliberately absent: it keeps its own card
 * with the stage breakdown, and listing it here as well drew the same
 * night twice under two headings.
 */
const METRIC_CARDS = {
  /*        category,             colour token,   glyph,   zero-based chart */
  steps:    ['Activity',          '--h-move',     'steps',  true],
  kcal:     ['Activity',          '--h-energy',   'flame',  true],
  strain:   ['Exertion',          '--h-strain',   'bolt',   true],
  recovery: ['Recovery',          '--h-recovery', 'coach',  true],
  rhr:      ['Heart',             '--h-heart',    'heart',  false],
  hrv:      ['Heart',             '--h-heart',    'heart',  false],
  spo2:     ['Respiratory',       '--h-resp',     'lungs',  false],
  resp:     ['Respiratory',       '--h-resp',     'lungs',  false],
  temp:     ['Body Measurements', '--h-body',     'thermo', false],
};

/* Card order, per band. Apple never lists what it cannot measure. */
const APPLE_ORDER = ['steps', 'kcal', 'rhr', 'hrv', 'spo2', 'resp', 'temp'];
const WHOOP_ORDER = ['recovery', 'strain', 'hrv', 'rhr', 'kcal', 'spo2', 'resp', 'temp', 'steps'];

/*
 * One card. Shared by both views so they cannot drift apart.
 */
function metricCard(s, ctx, scoped, sum, key, latestKey) {
  const spec = METRIC_CARDS[key];
  const info = sum.metrics[key];
  if (!spec || !info?.latest) return null;
  const [category, token, glyph, zero] = spec;
  const pts = seriesFor(scoped, key, 30);
  const value = info.latest.v;
  /* Recovery is the one reading whose colour IS its meaning, so it keeps
     its own three bands rather than a fixed category hue. */
  const colour = key === 'recovery' ? recoveryColour(value) : `var(${token})`;
  const from = sourceForMetric(s, key);

  /*
   * Small enough to sit two across on a phone.
   *
   * These were full-width cards carrying a labelled chart each, which on a
   * phone meant scrolling through eight screens of dashboard to see eight
   * numbers, and roughly a dozen figures on screen at once between the
   * axis labels and the values. A tile answers one question — what is it
   * now, and which way is it going — and everything else moves behind the
   * tap. The chart with its scale, its dates and its distribution is one
   * touch away and unchanged.
   */
  return el('div.ah-card.tappable', {
    role: 'button', tabIndex: 0,
    style: { '--ah': colour },
    'aria-label': `${info.label}, ${value} ${info.unit}`,
    onclick: () => openMetric(s, key, ctx),
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMetric(s, key, ctx); } },
  },
    el('span.ah-cat', {}, icon(glyph, 14), category),
    el('div.ah-name', {}, info.label,
      from === 'apple' && healthSource() === 'both'
        ? el('span.from-tag', {}, 'Apple') : null),
    el('div.ah-value', {},
      value.toLocaleString(undefined, { minimumFractionDigits: info.dp, maximumFractionDigits: info.dp }),
      info.unit ? el('span.ah-unit', {}, info.unit) : null),
    el('div.ah-spark', { style: { color: colour } },
      pts.length >= 2
        ? miniSpark(pts.map(p => p.v), { colour, w: 96, h: 20 })
        : el('span.micro', {}, 'first reading')));
}

function appleVitals(s, ctx, scoped, sum) {
  const latestKey = Object.keys(scoped.rows || {}).sort().pop();
  const today = scoped.rows?.[latestKey] || {};

  const wrap = el('div.ah', {},
    el('div.between', { style: { marginBottom: '12px' } },
      el('div', {},
        el('h2.ah-title', {}, 'Health'),
        el('div.micro', {}, `Apple Watch · ${latestKey}`)),
      el('button.btn.sm.ghost', { onclick: () => openWhoopRelay(ctx) }, 'Sync')));

  /*
   * The rings lead, the way recovery leads the Whoop view.
   *
   * They are the picture a Watch owner actually checks, and the nearest
   * thing Apple has to a single daily verdict. Shown as soon as any one
   * of the three arrives rather than waiting for all of them, with the
   * missing ones named — "not sent" is a fixable Shortcut problem, and
   * silently omitting the row hides that there is anything to fix.
   */
  const goals = s.settings?.ringGoals || {};
  const ringData = {
    move: today.activeKcal != null
      ? { value: today.activeKcal, goal: today.moveGoal || goals.move || 500 } : null,
    exercise: today.exerciseMin != null
      ? { value: today.exerciseMin, goal: goals.exercise || 30 } : null,
    stand: today.standHours != null
      ? { value: today.standHours, goal: goals.stand || 12 } : null,
  };
  const anyRing = Object.values(ringData).some(v => v);
  wrap.append(el('div.ah-card.ah-rings', { style: { '--ah': '#FA114F' } },
    el('div.between', {},
      el('span.ah-cat', {}, icon('flame', 15), 'Activity'),
      el('span.ah-when', {}, latestKey === dayKey() ? 'Today' : latestKey)),
    anyRing
      ? activityRings(ringData)
      : el('div.fine', {},
          'Your Shortcut is not sending the ring data yet. Add Active Energy, '
          + 'Exercise Minutes and Stand Hours to it and the rings fill in.')));

  const cards = APPLE_ORDER
    .map(k => metricCard(s, ctx, scoped, sum, k, latestKey))
    .filter(Boolean);

  wrap.append(cards.length
    ? el('div.ah-grid', {}, ...cards)
    : el('div.tile', {}, el('div.fine', {},
        'Nothing from your Apple Watch yet. Run the Shortcut once on your phone.')));

  /* Sleep stages, in Apple's own vocabulary — Health calls them Core,
     Deep and REM, and a Watch owner reading "Light" would wonder which
     of their numbers it corresponds to. */
  if (today.sleepH) {
    const core = Math.max(0, today.sleepH - (today.remH || 0) - (today.swsH || 0));
    const stages = [
      { label: 'Deep', value: today.swsH || 0, colour: 'var(--sleep-deep)' },
      { label: 'Core', value: core,            colour: 'var(--sleep-core)' },
      { label: 'REM',  value: today.remH || 0, colour: 'var(--sleep-rem)' },
    ];
    wrap.append(el('div.ah-card', { style: { '--ah': '#37B9E8' } },
      el('div.between', {},
        el('span.ah-cat', {}, icon('bed', 15), 'Sleep'),
        el('span.ah-when', {}, 'Last night')),
      el('div.ah-value', {}, today.sleepH.toFixed(1), el('span.ah-unit', {}, 'h')),
      stageBar(stages),
      el('div.stage-key', {},
        ...stages.map(st => el('span.micro', {},
          el('i', { style: { background: st.colour } }),
          `${st.label} ${st.value.toFixed(1)}h`))),
      (today.remH || today.swsH) ? null
        : el('div.fine', { style: { marginTop: '8px' } },
            'Your Shortcut is sending total sleep only. Add REM and Deep to it '
            + 'and the stages fill in.')));
    wrap.append(sleepTile(s, ctx.date || dayKey(), ctx));
  }

  /* What an Apple Watch does not measure, said once and plainly, rather
     than left as empty cards for the reader to interpret. */
  /*
   * Explained only to somebody who owns the other band.
   *
   * For a person with a Whoop as well, "why is there no Recovery here" is
   * a real question and this answers it. For an Apple-only user it names a
   * device they do not own to explain the absence of a number they were
   * never going to see — which is exactly the brand leak the app is meant
   * not to have.
   */
  wrap.append(healthSource() === 'both'
    ? el('div.note.info', {},
        el('div', {},
          'Recovery and Strain are Whoop\u2019s own scores rather than measurements, '
          + 'so there is nothing for an Apple Watch to report and this view leaves '
          + 'them out. Everything else \u2014 targets, the daily adjustment, '
          + 'maintenance calories, the report \u2014 runs on the readings above.'))
    : el('div.note.info', {},
        el('div', {},
          'Everything the app does \u2014 your targets, the daily adjustment, '
          + 'maintenance calories, the report \u2014 runs on the readings above.')));

  return wrap;
}

function vitalsSection(s, ctx) {
  /*
   * No band, no section — before anything else.
   *
   * This bailed only when there was no data to show, which is not the same
   * question. Somebody who has told the app they wear nothing can still
   * have rows in the store from a demo, an old import, or a band they have
   * since stopped using, and they were shown the whole Vitals panel and a
   * Sync button for hardware they had just said they do not have.
   */
  if (healthSource() === 'none') return null;

  /* The hero and the charts read the selected band as well, so choosing
     Apple shows the tab an Apple Watch owner would actually see.
     
     Only somebody wearing both has a choice to make, and only they are
     shown the chips. Reading the setting regardless meant a Whoop-only
     user who had once tried the Apple view stayed stuck in it, with no
     control on screen to get back — the setting outlived the band. */
  const pick = effectivePick(s);
  /* A store that has never synced anything has no whoop object at all,
     and summary() reached straight through for .rows. The Body tab then
     failed to draw entirely — for a brand-new user, which is the worst
     possible audience for a blank error screen. */
  const scoped = pick === 'all' ? (s.whoop || { rows: {} })
    : { rows: rowsFor(s, pick), source: s.whoop?.source };
  const sum = summary(scoped);

  if (!sum) {
    const mode = healthSource();

    /*
     * No band, and nothing to apologise for.
     *
     * Someone who has said they wear nothing should never see a Vitals
     * heading, a sync button, or a brand name — the whole section was
     * telling them, every visit, about a thing they do not have and
     * cannot use. Everything the app actually does for them is below
     * this: weight, the trend, maintenance from their own intake, the
     * log-against-scale check, the report. None of it needs a strap.
     */
    if (mode === 'none') return null;

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

  /*
   * Apple gets Apple's screen, not Whoop's with the holes showing.
   *
   * Scoping the existing layout to Apple's rows was only half an answer.
   * The layout is built around a Recovery ring with Strain beside it, and
   * an Apple Watch measures neither — so choosing Apple produced a big
   * empty dial captioned RECOVERY and a Strain reading of "—". Two blanks
   * in the largest card on the page, which reads as a broken app rather
   * than as a watch that does not compute those scores.
   *
   * A Watch owner already has a mental model of what their data looks
   * like, and it is the Health app: readings filed under a coloured
   * category, the category named and iconned, the number large, the unit
   * small beside it. So that is what this draws. Nothing here can be
   * blank, because the list is built from what actually arrived.
   */
  if (pick === 'apple') return appleVitals(s, ctx, scoped, sum);

  const rec = sum.metrics.recovery;
  const hrv = sum.metrics.hrv;
  const rhr = sum.metrics.rhr;
  const sleep = sum.metrics.sleepH;
  const strain = sum.metrics.strain;

  const latestKey = Object.keys(scoped.rows || {}).sort().pop();
  const today = scoped.rows?.[latestKey] || {};
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
          const r = ring({ value: recV, max: 100, size: 128, stroke: 11,
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
      /* Deep, core, REM — Health's blue family rather than the app's
         hairline grey, which made the biggest part of the night look like
         missing data. */
      { label: 'Deep', value: today.swsH || 0, colour: 'var(--sleep-deep)' },
      { label: 'Light', value: light, colour: 'var(--sleep-core)' },
      { label: 'REM',  value: today.remH || 0, colour: 'var(--sleep-rem)' },
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
    const pts = seriesFor(scoped, key, 30);
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
   * The readings, as Health-style cards.
   *
   * These were a wall of small grey rows: label, number, sparkline,
   * "usual". It read like a spreadsheet of the one part of the app that
   * is genuinely alive — measured overnight, arriving on its own. The
   * Apple view was given card treatment first and was plainly the better
   * screen, and there was never a reason for Whoop's numbers to look
   * worse than a watch's. Both build from the same table now, so a
   * resting heart rate looks like a resting heart rate whichever wrist
   * it came off.
   */
  const srcFilter = effectivePick(s);
  /*
   * Read from the band asked for rather than filtering the merge.
   *
   * Narrowing the merged rows only ever showed what the merge had already
   * decided to keep — which on two bands is Whoop for everything except
   * steps, so choosing Apple showed one card and looked broken.
   */
  const viewRows = { rows: rowsFor(s, srcFilter) };
  const viewSum = summary(viewRows) || sum;

  const order = srcFilter === 'apple' ? APPLE_ORDER : WHOOP_ORDER;
  const shown = order.filter(k => canMeasure(k, srcFilter === 'all' ? null : srcFilter));
  const cards = shown
    .map(k => metricCard(s, ctx, viewRows, viewSum, k, latestKey))
    .filter(Boolean);

  /* "a, b and c" — a list you can read out loud. */
  const listWords = xs => xs.length < 2 ? (xs[0] || '')
    : xs.slice(0, -1).join(', ') + ' or ' + xs[xs.length - 1];

  if (cards.length || srcFilter !== 'all') {
    const mode = healthSource();
    const present = new Set(shown.filter(k => viewSum.metrics[k]?.latest));
    const fromApple = [...present].filter(k => sourceForMetric(s, k) === 'apple')
      .map(k => METRICS[k].label);
    const missing = (mode === 'apple' || srcFilter === 'apple')
      ? shown.filter(k => !present.has(k)).map(k => METRICS[k].label) : [];

    let note = null;
    if (mode === 'both' && srcFilter === 'all' && fromApple.length) {
      note = `${listWords(fromApple)} come from Apple Health, marked above. Everything else `
           + 'is measured by your Whoop. The two are never averaged together.';
    } else if (missing.length) {
      note = `Your watch has not sent ${listWords(missing)} yet — check the Shortcut `
           + 'is collecting them.';
    }

    /* Native append stringifies null; el() filters it. Building the note
       as an element keeps a literal "null" off the page. */
    wrap.append(
      el('div.between', { style: { margin: '4px 2px 10px' } },
        el('h3', {}, 'Vitals'),
        mode === 'both'
          ? el('div.flex', { style: { gap: '5px' } },
              srcChip('all', 'Both', srcFilter, ctx),
              srcChip('whoop', 'Whoop', srcFilter, ctx),
              srcChip('apple', 'Apple', srcFilter, ctx))
          : null),
      cards.length
        ? el('div.ah-grid', {}, ...cards)
        : el('div.tile', {}, el('div.fine', {},
            `Nothing from ${srcFilter === 'apple' ? 'your Apple Watch' : 'your Whoop'} yet.`)),
      el('div', {}, note ? el('div.fine', { style: { margin: '10px 2px 0' } }, note) : null));
  }

  /* ── the fortnight, at a glance ── */
  const recentRec = seriesFor(scoped, 'recovery', 14);
  if (recentRec.length > 3) {
    wrap.append(el('div.tile.tappable', {
      role: 'button', tabIndex: 0,
      onclick: () => openMetric(s, 'recovery', ctx),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMetric(s, 'recovery', ctx); } },
    },
      el('div.between', { style: { marginBottom: '10px' } },
        el('h3', {}, 'Recovery', icon('chevron', 14)),
        el('span.micro', {}, `last 14 days · avg ${Math.round(rec.recent.mean)}%`)),
      /* A widget height, not a chart height. The shape of a fortnight
         reads at ninety pixels; the rest was padding. */
      healthBars(recentRec.map(p => ({ v: p.v, label: `${p.date}: ${Math.round(p.v)}%` })), {
        h: 92, unit: '%', dp: 0, colourFor: recoveryColour,
      }),
      /* A .between around one long unbreakable line forced the tile wider
         than the screen, and the chart inside it stretched to match — 81px
         of horizontal overflow on the Body tab traced back to this caption.
         It is a caption; it wraps. */
      el('div.micro', { style: { marginTop: '7px' } },
        'green ≥ 67 · amber ≥ 34 · red below'),
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
  const scoped = { rows: rowsFor(s, effectivePick(s)) };
  const series = seriesFor(scoped, metric);
  if (!series.length) return null;
  const latest = series[series.length - 1];
  const place = placeInRange(scoped, metric, latest.v);
  const base14 = baseline(scoped, metric, 14);
  const st = place.stats;
  const spec = METRIC_CARDS[metric];
  const colour = metric === 'recovery' ? recoveryColour(latest.v)
    : spec ? `var(${spec[1]})` : 'var(--accent)';
  const zero = spec ? spec[3] : false;

  /*
   * Dense enough to read without scrolling.
   *
   * This was four stacked cards — a readout, a chart, six rows of
   * statistics and a paragraph — which in a panel is a column you climb.
   * The question being asked is "what is this number and is it normal for
   * me", and that fits on one screen: the reading, the shape of the last
   * two months, and the four figures that actually place it. The rest was
   * restating the same distribution in three different ways.
   */
  const stat = (k, v) => el('div.stat-cell', {},
    el('div.micro', {}, k),
    el('div.stat-v', {}, v));

  sheet({
    title: info.label,
    body: el('div.metric-detail', { style: { '--ah': colour } },
      el('div.metric-hero', {},
        el('div', {},
          el('div.micro', {}, latest.date),
          el('div.metric-big', {}, latest.v.toFixed(info.dp),
            info.unit ? el('span.metric-unit', {}, info.unit) : null)),
        el('div.metric-place', {},
          el('div.metric-pct', {}, place.pct + el('span', {}, '').textContent + 'th'),
          el('div.micro', {}, 'of your own range'))),

      appleChart(series.slice(-60).map(p => ({ v: p.v, date: p.date,
        label: `${p.date}: ${p.v.toFixed(info.dp)} ${info.unit}` })),
        { colour, h: 150, zero, unit: info.unit, dp: info.dp }),

      el('div.stat-grid', {},
        stat('Last 14 days', base14.mean.toFixed(info.dp) + (info.unit ? ' ' + info.unit : '')),
        stat('All-time average', st.mean.toFixed(info.dp) + (info.unit ? ' ' + info.unit : '')),
        stat('Usual middle half', `${st.p25.toFixed(info.dp)}–${st.p75.toFixed(info.dp)}`),
        stat('Full range', `${st.min.toFixed(info.dp)}–${st.max.toFixed(info.dp)}`)),

      el('div.metric-verdict', {},
        `${Math.abs(place.z).toFixed(1)} standard deviations `
        + `${place.z >= 0 ? 'above' : 'below'} your average across ${st.n} readings — `
        + `${place.verdict}.`)),
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
    { label: 'Deep', key: 'swsH',  value: last.swsH || 0, mean: avg('swsH'),  colour: 'var(--sleep-deep)' },
    { label: 'REM',  key: 'remH',  value: last.remH || 0, mean: avg('remH'),  colour: 'var(--sleep-rem)' },
    { label: 'Light', key: 'light', value: light(last),   mean: avg('light'), colour: 'var(--sleep-core)' },
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
            el('span', { style: { color: Math.abs(diff) < 0.25 ? 'var(--muted)' : (diff > 0 ? 'var(--good-ink)' : 'var(--caution)') } },
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
            /* Normalise before testing, so a pasted bare host or a stray
               newline is fixed rather than saved and failed on later. */
            const v = relayBase(urlInput.value);
            if (!v) { toast('That is not a usable web address.', 'err'); return; }
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
  /*
   * This correlates food against recovery, and recovery is a score only
   * Whoop computes. Shown to an Apple Watch owner it promised an analysis
   * their hardware can never supply, and named a device they do not own
   * while doing it. It is not a thin version of the feature for them —
   * there is no version of it.
   */
  if (!canMeasure('recovery')) return el('div');

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
            style: { color: f.strong ? (f.r > 0 ? 'var(--good-ink)' : 'var(--warn)') : 'var(--muted)' },
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
