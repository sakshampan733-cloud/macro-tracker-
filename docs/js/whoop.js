/*
 * Whoop import and analysis.
 *
 * Whoop has no public consumer API, so this reads the CSV bundle you get
 * from Settings, then "Download my data" on whoop.com. Unzip it and drop
 * physiological_cycles.csv in — that one file carries recovery, HRV,
 * resting heart rate, sleep, strain and energy burned.
 *
 * Column names have changed across export versions, so headers are matched
 * on meaning rather than exact string.
 */

/* ── CSV ────────────────────────────────────────────────────────────── */

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

const COLUMNS = {
  start:    [/cycle start/i, /^date$/i, /^day$/i],
  recovery: [/recovery score/i, /^recovery/i],
  rhr:      [/resting heart rate/i, /\brhr\b/i],
  hrv:      [/heart rate variability/i, /\bhrv\b/i],
  strain:   [/day strain/i, /^strain/i],
  kcal:     [/energy burned/i, /calorie/i],
  spo2:     [/blood oxygen/i, /spo2/i],
  temp:     [/skin temp/i, /temperature/i],
  resp:     [/respiratory rate/i],
  wake:     [/wake onset/i],
  sleepMin: [/asleep duration/i, /sleep duration/i],
  sleepPerf:[/sleep performance/i],
  sleepEff: [/sleep efficiency/i],
  remMin:   [/rem duration/i],
  swsMin:   [/deep \(sws\)/i, /deep.*duration/i],
  debtMin:  [/sleep debt/i],
  avgHr:    [/average hr/i],
  maxHr:    [/max hr/i],
};

function mapHeaders(header) {
  const idx = {};
  for (const [key, pats] of Object.entries(COLUMNS)) {
    for (let i = 0; i < header.length; i++) {
      if (pats.some(p => p.test(header[i]))) { idx[key] = i; break; }
    }
  }
  return idx;
}

const num = v => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function toDate(v) {
  if (!v) return null;
  // Whoop writes "2026-07-02 06:14:22" or ISO with a zone.
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function hourOf(v) {
  const m = String(v || '').match(/(\d{2}):(\d{2})/);
  return m ? +m[1] + +m[2] / 60 : null;
}

const nextDay = key => {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

/*
 * Which day does a cycle belong to?
 *
 * A Whoop physiological cycle opens the evening you fall asleep and closes
 * when you wake. The recovery it reports is the one you wake up *with*, so
 * it belongs to the morning, not to the night before. Filing it under the
 * cycle's start date shifts every reading a day early — which then
 * misaligns the calorie target and doubles the offset in the food-versus-
 * recovery comparison, since that one already looks a day ahead.
 *
 * Wake onset is the honest answer. Where a row has no wake column,
 * fall back to the rule that an evening start belongs to the next morning.
 */
function cycleDate(row, idx) {
  if (idx.wake != null) {
    const d = toDate(row[idx.wake]);
    if (d) return d;
  }
  const start = toDate(row[idx.start]);
  if (!start) return null;
  const h = hourOf(row[idx.start]);
  return h != null && h >= 17 ? nextDay(start) : start;
}

/*
 * A Whoop physiological cycle starts the evening before and reports the
 * recovery you woke up with. Attribute each row to the day you woke into,
 * which is what "my recovery today" means to a human.
 */
export function importWhoopCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('That file has no rows in it.');

  const idx = mapHeaders(rows[0]);
  if (idx.start == null) {
    throw new Error('No date column found. Use physiological_cycles.csv from your Whoop export.');
  }

  const out = {};
  let kept = 0;
  for (const r of rows.slice(1)) {
    const date = cycleDate(r, idx);
    if (!date) continue;
    const rec = {
      recovery: idx.recovery != null ? num(r[idx.recovery]) : null,
      rhr:      idx.rhr != null ? num(r[idx.rhr]) : null,
      hrv:      idx.hrv != null ? num(r[idx.hrv]) : null,
      strain:   idx.strain != null ? num(r[idx.strain]) : null,
      kcal:     idx.kcal != null ? num(r[idx.kcal]) : null,
      spo2:     idx.spo2 != null ? num(r[idx.spo2]) : null,
      temp:     idx.temp != null ? num(r[idx.temp]) : null,
      resp:     idx.resp != null ? num(r[idx.resp]) : null,
      sleepH:   idx.sleepMin != null && num(r[idx.sleepMin]) != null
                  ? +(num(r[idx.sleepMin]) / 60).toFixed(2) : null,
      sleepPerf:idx.sleepPerf != null ? num(r[idx.sleepPerf]) : null,
      sleepEff: idx.sleepEff != null ? num(r[idx.sleepEff]) : null,
      remH:     idx.remMin != null && num(r[idx.remMin]) != null
                  ? +(num(r[idx.remMin]) / 60).toFixed(2) : null,
      swsH:     idx.swsMin != null && num(r[idx.swsMin]) != null
                  ? +(num(r[idx.swsMin]) / 60).toFixed(2) : null,
      debtH:    idx.debtMin != null && num(r[idx.debtMin]) != null
                  ? +(num(r[idx.debtMin]) / 60).toFixed(2) : null,
      wakeHour: idx.wake != null ? hourOf(r[idx.wake]) : null,
    };
    if (Object.values(rec).every(v => v == null)) continue;
    out[date] = rec;
    kept++;
  }

  if (!kept) throw new Error('No usable rows. Is this the right CSV?');
  const dates = Object.keys(out).sort();
  return { rows: out, count: kept, from: dates[0], to: dates[dates.length - 1] };
}

/* ── Ranges ─────────────────────────────────────────────────────────── */

export const METRICS = {
  recovery:  { label: 'Recovery',        unit: '%',   good: 'high', dp: 0 },
  hrv:       { label: 'HRV',             unit: 'ms',  good: 'high', dp: 0 },
  rhr:       { label: 'Resting HR',      unit: 'bpm', good: 'low',  dp: 0 },
  sleepH:    { label: 'Sleep',           unit: 'h',   good: 'high', dp: 1 },
  sleepPerf: { label: 'Sleep performance', unit: '%', good: 'high', dp: 0 },
  strain:    { label: 'Day strain',      unit: '',    good: 'none', dp: 1 },
  kcal:      { label: 'Energy burned',   unit: 'kcal',good: 'none', dp: 0 },
  resp:      { label: 'Respiratory rate',unit: 'rpm', good: 'none', dp: 1 },
  spo2:      { label: 'Blood oxygen',    unit: '%',   good: 'high', dp: 1 },
  temp:      { label: 'Skin temp',       unit: '°C',  good: 'none', dp: 1 },
  steps:     { label: 'Steps',           unit: '',    good: 'high', dp: 0 },
};

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stats(values) {
  const v = values.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / v.length);
  return {
    n: v.length, mean, sd,
    min: v[0], max: v[v.length - 1],
    p10: quantile(v, 0.10), p25: quantile(v, 0.25),
    p50: quantile(v, 0.50), p75: quantile(v, 0.75), p90: quantile(v, 0.90),
  };
}

export function seriesFor(whoop, metric, lastN = null) {
  let entries = Object.entries(whoop.rows || {}).sort();
  if (lastN) entries = entries.slice(-lastN);
  return entries.map(([date, r]) => ({ date, v: r[metric] })).filter(p => p.v != null);
}

/*
 * Where a single reading sits in your own history — not a population's.
 * The percentile is the honest answer to "is this good for me?".
 */
export function placeInRange(whoop, metric, value) {
  const all = seriesFor(whoop, metric).map(p => p.v);
  const s = stats(all);
  if (!s || value == null) return null;
  const below = all.filter(v => v < value).length;
  const pct = Math.round((below / all.length) * 100);
  const z = s.sd ? (value - s.mean) / s.sd : 0;
  const good = METRICS[metric]?.good;

  let verdict;
  if (good === 'none') verdict = 'typical';
  else {
    const favourable = good === 'high' ? z : -z;
    verdict = favourable > 1 ? 'strong' : favourable > 0.35 ? 'above your normal'
            : favourable < -1 ? 'well below your normal'
            : favourable < -0.35 ? 'below your normal' : 'typical';
  }
  return { value, pct, z: +z.toFixed(2), verdict, stats: s };
}

/* Baseline from the trailing window, which is what "normal for me" means
   once you've been training or sleeping differently for a month. */
export function baseline(whoop, metric, days = 30) {
  return stats(seriesFor(whoop, metric, days).map(p => p.v));
}

export function summary(whoop) {
  const dates = Object.keys(whoop.rows || {}).sort();
  if (!dates.length) return null;
  const out = { from: dates[0], to: dates[dates.length - 1], days: dates.length, metrics: {} };
  for (const m of Object.keys(METRICS)) {
    const all = stats(seriesFor(whoop, m).map(p => p.v));
    if (!all) continue;
    const recent = baseline(whoop, m, 14);
    const latest = seriesFor(whoop, m).slice(-1)[0] || null;
    out.metrics[m] = {
      ...METRICS[m], all, recent, latest,
      drift: recent && all.sd ? +((recent.mean - all.mean) / all.sd).toFixed(2) : null,
    };
  }
  return out;
}

/* ── What nutrition does to recovery ────────────────────────────────── */

function pearson(pairs) {
  const n = pairs.length;
  if (n < 8) return null;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2;
  }
  if (!sxx || !syy) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  // t-statistic for r, two-tailed, as a rough significance gate.
  const t = Math.abs(r) * Math.sqrt((n - 2) / Math.max(1e-9, 1 - r * r));
  return { r: +r.toFixed(2), n, t: +t.toFixed(2), strong: t > 2.0 };
}

const DRIVERS = {
  kcal:    { label: 'Calories eaten',   pick: t => t.kcal },
  p:       { label: 'Protein',          pick: t => t.p },
  c:       { label: 'Carbohydrate',     pick: t => t.c },
  f:       { label: 'Fat',              pick: t => t.f },
  fib:     { label: 'Fibre',            pick: t => t.fib },
  sug:     { label: 'Sugar',            pick: t => t.sug },
  na:      { label: 'Sodium',           pick: t => t.na },
  alc:     { label: 'Alcohol',          pick: t => t.alc },
  water:   { label: 'Water',            pick: t => t.water },
  lastMeal:{ label: 'Last meal, hour of', pick: t => t.lastMealHour },
};

/*
 * Correlate yesterday's intake with the recovery you woke up with today.
 * Deliberately conservative: nothing is reported under 14 paired days, and
 * weak associations are labelled as such. This finds patterns worth
 * testing, not causes.
 */
export function nutritionVsRecovery(store, target = 'recovery') {
  const out = [];
  const pairsByDriver = {};
  for (const k in DRIVERS) pairsByDriver[k] = [];

  const dates = Object.keys(store.days).sort();
  for (const date of dates) {
    const d = store.days[date];
    if (!d.entries || d.entries.length < 2) continue;

    const next = new Date(date + 'T12:00:00');
    next.setDate(next.getDate() + 1);
    const nextKey = next.toISOString().slice(0, 10);
    const w = store.whoop?.rows?.[nextKey];
    if (!w || w[target] == null) continue;

    const t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, sug: 0, na: 0, alc: 0 };
    let lastTs = 0;
    for (const e of d.entries) {
      if (e.dish) {
        // Valued from its density; the macro split is a recipe assumption
        // and deliberately not treated as measured.
        t.kcal += e.grams * (e.density || 1.2);
      } else {
        const k = e.grams / 100;
        for (const key in t) t[key] += (e.per100[key] || 0) * k;
      }
      if (e.ts > lastTs) lastTs = e.ts;
    }
    t.water = (d.water || []).reduce((a, x) => a + x.ml, 0);
    t.lastMealHour = lastTs ? new Date(lastTs).getHours() + new Date(lastTs).getMinutes() / 60 : null;

    for (const k in DRIVERS) {
      const v = DRIVERS[k].pick(t);
      if (v != null && Number.isFinite(v) && v !== 0) pairsByDriver[k].push([v, w[target]]);
    }
  }

  for (const k in DRIVERS) {
    const res = pearson(pairsByDriver[k]);
    if (res) out.push({ key: k, label: DRIVERS[k].label, ...res });
  }
  out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return { target, findings: out, paired: pairsByDriver.kcal.length };
}

/*
 * How much harder than usual was today?
 *
 * Whoop's absolute calorie figure runs high — its model is proprietary and
 * consistently overstates burn. But it is good at *relative* effort: a
 * strain-16 day really is bigger than a strain-9 day. So this returns the
 * ratio of today's burn to your own Whoop average, not the raw number.
 * Multiply a trustworthy baseline by that ratio and you get a day-adjusted
 * target with the right level and the right movement.
 *
 * Clamped, because one bad sensor day should not swing a target by 40%.
 */
export function dayFactor(store, dateKey, windowDays = 28) {
  const rows = Object.entries(store.whoop?.rows || {}).sort();
  const today = store.whoop?.rows?.[dateKey];
  if (!today || !(today.kcal > 0)) return null;

  const recent = rows.slice(-windowDays).map(([, r]) => r.kcal).filter(v => v > 0);
  if (recent.length < 7) return null;

  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (!(mean > 0)) return null;

  const raw = today.kcal / mean;
  const factor = Math.max(0.88, Math.min(1.22, raw));
  return {
    factor,
    clamped: Math.abs(raw - factor) > 0.001,
    strain: today.strain,
    burned: Math.round(today.kcal),
    average: Math.round(mean),
    days: recent.length,
  };
}

/* ── Reading the export straight from the zip ────────────────────────── */

/*
 * Whoop hands you a zip. On a Mac that is a double-click; on a phone it is
 * a genuine chore — save to Files, long-press, uncompress, find the right
 * csv among six. Since this is the only route to Whoop data when the app is
 * running without a server, it should not be the fiddly part.
 *
 * So the file picker takes the zip as-is. This reads the archive's central
 * directory, finds the physiological cycles file, and inflates it with
 * DecompressionStream, which Safari has had since 16.4. No library.
 */

const dv = buf => new DataView(buf);
const str = (buf, off, len) => new TextDecoder().decode(new Uint8Array(buf, off, len));

export function looksLikeZip(bytes) {
  return bytes.byteLength > 4 && dv(bytes).getUint32(0, true) === 0x04034b50;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot open zip files. Unzip it first and pick the CSV.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer();
}

/* Walk the central directory rather than scanning local headers: only the
   central directory reliably carries the compressed sizes. */
export async function readZip(buf) {
  const view = dv(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That does not look like a zip file.');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = str(buf, p + 46, nameLen);
    entries.push({ name, method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    entries,
    async read(entry) {
      const lv = dv(buf);
      if (lv.getUint32(entry.localOff, true) !== 0x04034b50) throw new Error('Damaged zip entry.');
      const nameLen = lv.getUint16(entry.localOff + 26, true);
      const extraLen = lv.getUint16(entry.localOff + 28, true);
      const start = entry.localOff + 30 + nameLen + extraLen;
      const raw = buf.slice(start, start + entry.compSize);
      const out = entry.method === 0 ? raw : await inflateRaw(raw);
      return new TextDecoder().decode(new Uint8Array(out));
    },
  };
}

/*
 * Take whatever the picker gave us — the zip, or a single csv — and return
 * imported Whoop rows. Picking the wrong csv out of the export is the other
 * easy mistake, so the right one is found by name.
 */
export async function importWhoopFile(file) {
  const buf = await file.arrayBuffer();

  if (!looksLikeZip(buf)) {
    return importWhoopCSV(new TextDecoder().decode(new Uint8Array(buf)));
  }

  const zip = await readZip(buf);
  const csvs = zip.entries.filter(e => /\.csv$/i.test(e.name) && !/__MACOSX/.test(e.name));
  if (!csvs.length) throw new Error('No CSV inside that zip. Is it the Whoop export?');

  const wanted = csvs.find(e => /physiological[_ -]?cycles/i.test(e.name))
              || csvs.find(e => /cycles/i.test(e.name));
  if (!wanted) {
    const names = csvs.map(e => e.name.split('/').pop()).join(', ');
    throw new Error(`No physiological_cycles.csv in that zip. It contains: ${names}`);
  }

  const res = importWhoopCSV(await zip.read(wanted));
  res.filename = wanted.name.split('/').pop();
  return res;
}
