/*
 * Body.
 *
 * Weight, vitals, and what the two have to say to each other. This is the
 * screen that answers "where do I actually range?" — against your own
 * history, not a population chart.
 */

import {
  el, clear, icon, kcal, g, sparkline, distribution, toast, sheet, field,
  segmented, empty, dateLabel, confirmSheet,
} from '../ui.js';
import { get, commit, dayKey, setWeight, peekDay, weightSeries, totals } from '../store.js';
import {
  importWhoopCSV, importWhoopFile, summary, METRICS, seriesFor, placeInRange, baseline,
  nutritionVsRecovery,
} from '../whoop.js';
import { trendWeight, adaptiveTDEE, bestTDEE, whoopTDEE, predictedTDEE, checkIn, checkInVerdict } from '../nutrition.js';
import { calibrationTile } from './dish.js';
import { bloodTile } from './blood.js';
import { openReport } from './report.js';
import {
  relayUrl, isConnected, connectUrl, checkRelay, syncWhoop, disconnect, captureFromUrl,
} from '../whooprelay.js';

export function renderBody(root, ctx) {
  const s = get();
  clear(root);

  root.append(
    el('div.between', { style: { marginBottom: '14px' } },
      el('h1', {}, 'Body'),
      el('button.btn.sm.primary', { onclick: () => openReport(ctx, 7) }, 'Report')),
    checkInTile(s, ctx),
    weightTile(ctx),
    tdeeTile(s),
    calibrationTile(s) || el('div'),
    bloodTile(s, ctx),
    vitalsSection(s, ctx),
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

  const input = el('input.num-in', {
    type: 'number', inputmode: 'decimal', step: '0.1', min: '20',
    placeholder: s.profile?.weightKg ? String(s.profile.weightKg) : 'kg',
    value: today ? String(today) : '',
  });

  const latest = withTrend[withTrend.length - 1];
  const first = withTrend[0];
  const change = latest && first ? latest.trend - first.trend : 0;

  const chart = withTrend.length > 2
    ? sparkline(
        withTrend.map(p => ({ v: p.kg })),
        { h: 76, trend: withTrend.map(p => ({ v: p.trend })) })
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
          const kg = +input.value;
          if (!(kg > 20 && kg < 400)) { toast('That does not look like a weight in kg.', 'err'); return; }
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
          el('div.num', { style: { fontSize: '26px', marginTop: '2px' } }, latest.trend.toFixed(1),
            el('span', { style: { fontSize: '12px', color: 'var(--muted)', marginLeft: '3px' } }, 'kg'))),
        el('div', { style: { textAlign: 'right' } },
          el('div.micro', {}, 'Since ' + dateLabel(first.date)),
          el('div.num', {
            style: { fontSize: '18px', marginTop: '2px', color: change < 0 ? 'var(--good)' : change > 0 ? 'var(--m-c)' : 'var(--text)' },
          }, (change >= 0 ? '+' : '') + change.toFixed(1) + ' kg'))),
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
    { key: 'whoop', label: 'Whoop', note: 'Device-measured daily burn', res: whoop },
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

function vitalsSection(s, ctx) {
  const sum = summary(s.whoop);

  if (!sum) {
    return el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Vitals')),
      el('div.tile', {}, empty(
        'No Whoop data yet',
        'Whoop has no public API, so bring the data in yourself: whoop.com → Settings → Download my data. '
        + 'Unzip it and load physiological_cycles.csv. Fifty days is plenty to see where you range.',
        el('div', {},
          el('button.btn.primary', { onclick: () => openWhoopRelay(ctx) }, icon('bolt', 16), 'Connect Whoop'),
          el('button.btn.ghost', { style: { marginTop: '8px' }, onclick: () => openWhoopImport(ctx) },
            icon('upload', 16), 'Or load a CSV export')))));
  }

  const wrap = el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Vitals')),
    el('div.between', { style: { marginBottom: '10px' } },
      el('span.micro', {}, `${sum.days} days · ${sum.from} to ${sum.to}`),
      el('button.btn.sm.ghost', { onclick: () => openWhoopImport(ctx) }, 'Re-import')),
  );

  const order = ['recovery', 'hrv', 'rhr', 'sleepH', 'sleepPerf', 'strain'];
  const grid = el('div.metric-grid');

  for (const m of order) {
    const info = sum.metrics[m];
    if (!info || !info.latest) continue;
    const place = placeInRange(s.whoop, m, info.latest.v);
    const tone = place && info.good !== 'none'
      ? (place.verdict === 'strong' || place.verdict === 'above your normal' ? 'good'
        : place.verdict.includes('below') ? 'warn' : '')
      : '';

    const open = () => openMetric(s, m, ctx);
    grid.append(el('div', {
      class: 'metric ' + tone,
      role: 'button',
      tabindex: '0',
      'aria-label': `${info.label}, ${info.latest.v.toFixed(info.dp)} ${info.unit}`,
      onclick: open,
      // A focusable role="button" that ignores the keyboard is a trap.
      onkeydown: e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      },
    },
      el('div.micro', {}, info.label),
      el('div.v', {}, info.latest.v.toFixed(info.dp), el('span.u', {}, info.unit)),
      el('div.verdict', {}, place ? `${place.pct}th percentile · ${place.verdict}` : '')));
  }

  wrap.append(grid);

  const rec = sum.metrics.recovery;
  if (rec && rec.drift != null && Math.abs(rec.drift) > 0.4) {
    wrap.append(el('div', { class: 'note ' + (rec.drift > 0 ? 'good' : 'warn'), style: { marginTop: '10px' } },
      el('div', {}, `Your last fortnight of recovery is running `
        + `${Math.abs(rec.drift).toFixed(1)} standard deviations ${rec.drift > 0 ? 'above' : 'below'} your full-period average `
        + `(${rec.recent.mean.toFixed(0)}% against ${rec.all.mean.toFixed(0)}%).`)));
  }

  return wrap;
}

function openMetric(s, metric, ctx) {
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
        sparkline(series.slice(-60).map(p => ({ v: p.v })), { h: 90 })),

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

    body.replaceChildren(
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
