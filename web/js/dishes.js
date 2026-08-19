/*
 * Home-cooked food you cannot weigh the recipe of.
 *
 * The usual advice — "log the ingredients" — fails for a dish somebody else
 * cooked in a pot you never saw. But you do not actually need the recipe.
 * You need one number: how many calories are in a gram of it. And that
 * number is stable, because the same person cooks the same dal the same way
 * with roughly the same ladle of oil, week after week.
 *
 * So: weigh your own serving, name the style, and the app carries an honest
 * range. Then, because your breakfast is measured to the calorie, the dish
 * is the only real unknown left in the day — and an isolated unknown can be
 * solved for from the way your weight actually moves.
 *
 * Densities are kcal per gram of the dish as served. Ranges are wide on
 * purpose: they are the real spread between a thin homestyle dal and a
 * restaurant one, and pretending otherwise is how people end up 400 kcal
 * out without knowing it.
 */

export const STYLES = {
  'dal-thin': {
    label: 'Dal, thin', hint: 'Watery, barely any tadka',
    lo: 0.70, hi: 1.00, energy: { p: 0.20, c: 0.52, f: 0.28 },
  },
  'dal-regular': {
    label: 'Dal, regular', hint: 'Everyday tadka dal',
    lo: 1.00, hi: 1.45, energy: { p: 0.18, c: 0.46, f: 0.36 },
  },
  'dal-rich': {
    label: 'Dal, rich', hint: 'Makhani, cream or lots of ghee',
    lo: 1.50, hi: 2.10, energy: { p: 0.15, c: 0.34, f: 0.51 },
  },
  'sabzi-dry': {
    label: 'Sabzi, dry', hint: 'Bhindi, aloo, cabbage, stir-fried',
    lo: 0.90, hi: 1.55, energy: { p: 0.08, c: 0.34, f: 0.58 },
  },
  'sabzi-gravy': {
    label: 'Sabzi, gravy', hint: 'Mixed veg, matar, tomato base',
    lo: 0.85, hi: 1.40, energy: { p: 0.10, c: 0.44, f: 0.46 },
  },
  'rajma-chole': {
    label: 'Rajma or chole', hint: 'Beans or chickpeas in gravy',
    lo: 1.10, hi: 1.70, energy: { p: 0.20, c: 0.51, f: 0.29 },
  },
  'paneer-gravy': {
    label: 'Paneer, gravy', hint: 'Palak paneer, shahi, butter masala',
    lo: 1.50, hi: 2.30, energy: { p: 0.18, c: 0.15, f: 0.67 },
  },
  'chicken-curry': {
    label: 'Chicken, curry', hint: 'Home-style, bone or boneless',
    lo: 1.30, hi: 2.00, energy: { p: 0.36, c: 0.11, f: 0.53 },
  },
  'rice-plain': {
    label: 'Rice, plain', hint: 'Boiled or steamed, no fat',
    lo: 1.20, hi: 1.40, energy: { p: 0.08, c: 0.90, f: 0.02 },
  },
  'rice-rich': {
    label: 'Rice, pulao or fried', hint: 'Cooked with oil or ghee',
    lo: 1.40, hi: 1.95, energy: { p: 0.08, c: 0.68, f: 0.24 },
  },
  'khichdi': {
    label: 'Khichdi', hint: 'Rice and dal together',
    lo: 1.00, hi: 1.50, energy: { p: 0.14, c: 0.62, f: 0.24 },
  },
  'sambar-rasam': {
    label: 'Sambar or rasam', hint: 'Thin south Indian lentil gravy',
    lo: 0.60, hi: 1.00, energy: { p: 0.18, c: 0.48, f: 0.34 },
  },
  'mixed-plate': {
    label: 'Mixed plate', hint: "Everything together, can't separate it",
    lo: 1.10, hi: 1.80, energy: { p: 0.16, c: 0.50, f: 0.34 },
  },
};

export const STYLE_KEYS = Object.keys(STYLES);

const prior = style => {
  const s = STYLES[style];
  return { mean: (s.lo + s.hi) / 2, sd: (s.hi - s.lo) / 4 };
};

/*
 * Turn a weighed serving into macros.
 *
 * Energy comes from grams times density. The split between protein, carb
 * and fat is the one part that really is a recipe assumption, but it moves
 * the macros far less than the density moves the calories, so it is the
 * right thing to hold fixed and the density to solve for.
 */
export function fromStyle(style, grams, density = null) {
  const s = STYLES[style];
  if (!s) return null;
  const p = prior(style);
  const d = density?.mean ?? p.mean;
  const sd = density?.sd ?? p.sd;

  const kcal = grams * d;
  return {
    kcal,
    p: (kcal * s.energy.p) / 4,
    c: (kcal * s.energy.c) / 4,
    f: (kcal * s.energy.f) / 9,
    fib: 0, sug: 0, sat: 0, na: 0,
    sigmaKcal: grams * sd,
    density: d,
    densitySd: sd,
  };
}

/* Stored as a per-100 g block so a home dish behaves like any other food. */
export function per100For(style, density = null) {
  const m = fromStyle(style, 100, density);
  return { kcal: m.kcal, p: m.p, c: m.c, f: m.f, fib: 0, sug: 0, sat: 0, na: 0 };
}

/* ── Solving for your household's real densities ────────────────────── */

/*
 * What this can and cannot work out.
 *
 * The honest constraint first: if dal and rice always arrive on the same
 * plate in roughly the same ratio, their two densities are mathematically
 * inseparable from each other and from your metabolism. No amount of data
 * fixes that — it is one equation with three unknowns. So the app does not
 * pretend to solve each dish. It solves one number: how much richer or
 * leaner your kitchen runs than the reference tables. That single factor is
 * identifiable, and it is the number that actually decides whether your day
 * total is right.
 *
 * The second constraint is noise. A week-long weight slope carries about
 * ±480 kcal/day of scale noise, while the thing being measured is a shift of
 * perhaps 60 kcal/day — the signal is buried. But the same difference
 * accumulates: over eight weeks it becomes a few thousand calories against a
 * trend weight known to a few hundred. So the fit runs on cumulative energy
 * balance against the smoothed trend, never on week-to-week slopes.
 */

const KCAL_PER_KG = 7700;

/*
 * A centred average, not an exponential one.
 *
 * An EMA only looks backwards, so on a falling weight it always sits above
 * the truth. Differencing two lagged values understates the real drop —
 * here by about a quarter — and every calorie of that lands on the dish
 * being estimated. A centred window has no such lag.
 */
function centredMean(points, index, halfWidth = 4) {
  const lo = Math.max(0, index - halfWidth);
  const hi = Math.min(points.length - 1, index + halfWidth);
  let sum = 0, n = 0;
  for (let i = lo; i <= hi; i++) { sum += points[i].kg; n++; }
  return { kg: sum / n, n };
}

function solve2(M, v) {
  const [[a, b], [c, d]] = M;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  return {
    x: [(v[0] * d - b * v[1]) / det, (a * v[1] - v[0] * c) / det],
    inv: [[d / det, -b / det], [-c / det, a / det]],
  };
}

export function solveDensities(store, { windowDays = 84, tdeeGuess = 2400 } = {}) {
  const all = Object.keys(store.days).sort();
  if (!all.length) return { ready: false, reason: 'nothing logged yet' };

  const cut = new Date();
  cut.setDate(cut.getDate() - windowDays);
  const from = new Date(cut.getTime() - cut.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);

  const used = new Set();
  const days = [];
  for (const key of all) {
    if (key < from) continue;
    const d = store.days[key];
    if (!d.entries || d.entries.length < 2) continue;

    let known = 0, book = 0, homeGrams = 0;
    for (const e of d.entries) {
      if (e.dish && STYLES[e.dish]) {
        used.add(e.dish);
        book += e.grams * prior(e.dish).mean;   // valued at reference rates
        homeGrams += e.grams;
      } else {
        known += (e.per100.kcal || 0) * e.grams / 100;
      }
    }
    days.push({ key, known, book, homeGrams, weight: d.weight || null });
  }

  const styles = [...used];
  if (!styles.length) return { ready: false, reason: 'no home dishes logged' };
  if (days.length < 21) {
    return { ready: false, styles, reason: `needs ${21 - days.length} more logged days`, have: days.length, need: 21 };
  }

  const weighed = days.filter(d => d.weight > 0);
  if (weighed.length < 12) {
    return { ready: false, styles, reason: `needs ${12 - weighed.length} more weigh-ins`, have: weighed.length, need: 12 };
  }

  // Centred smoothing over the weigh-ins, then carried across days without one.
  const wp = weighed.map(d => ({ key: d.key, kg: d.weight }));
  const smoothed = wp.map((_, i) => ({ key: wp[i].key, trend: centredMean(wp, i).kg }));
  const trendBy = Object.fromEntries(smoothed.map(p => [p.key, p.trend]));
  let carried = smoothed[0].trend;
  for (const d of days) {
    if (trendBy[d.key] != null) carried = trendBy[d.key];
    d.trend = carried;
  }

  // Cumulative energy balance at fortnightly checkpoints. Coefficients grow
  // with time, and that growth is what gives the fit its leverage.
  const w0 = days[0].trend;
  const rows = [];
  let cK = 0, cB = 0;
  for (let i = 0; i < days.length; i++) {
    cK += days[i].known;
    cB += days[i].book;
    if ((i + 1) % 14 === 0 || i === days.length - 1) {
      if (i < 20) continue;
      rows.push({
        n: i + 1,
        y: (days[i].trend - w0) * KCAL_PER_KG - cK,
        b: cB,
        key: days[i].key,
      });
    }
  }
  if (rows.length < 2) return { ready: false, styles, reason: 'needs a longer stretch of logging' };

  /*
   * Unknowns: k (kitchen richness) and TDEE.
   *   k · book_cum − N · TDEE = trendΔ · 7700 − known_cum
   *
   * These two are close to collinear: if you eat about the same amount of
   * home food every day, then "the dal is richer than I thought" and "my
   * metabolism is slower than I thought" predict exactly the same weight
   * curve, and nothing in the data can tell them apart. What breaks the tie
   * is an independent read on maintenance — the adaptive figure, or Whoop —
   * so TDEE is held near that anchor and the dish is what moves. If the
   * anchor is wrong, this inherits the error, which is why the screen says
   * out loud what it assumed.
   */
  const k0 = 1.0, kSd = 0.22;
  const tSd = 170;
  // Two centred endpoints, each averaging ~9 readings of a scale that
  // scatters by ~0.33 kg.
  const sigma = 0.16 * KCAL_PER_KG;

  const M = [[1 / (kSd * kSd), 0], [0, 1 / (tSd * tSd)]];
  const v = [k0 / (kSd * kSd), tdeeGuess / (tSd * tSd)];
  for (const r of rows) {
    const a = [r.b, -r.n];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) M[i][j] += (a[i] * a[j]) / (sigma * sigma);
      v[i] += (a[i] * r.y) / (sigma * sigma);
    }
  }

  /*
   * Is this even answerable?
   *
   * The fit has two columns: cumulative home-food energy, and number of
   * days. If you eat home food every day in similar amounts, the first is
   * just a constant times the second — the columns are parallel and the
   * fit cannot tell a rich kitchen from a slow metabolism. Tested honestly
   * rather than papered over with a prior, because returning the book value
   * dressed up as a measurement is worse than admitting it is the book
   * value.
   */
  const bs = rows.map(r => r.b / r.n);          // home kcal per day at each checkpoint
  const mb = bs.reduce((a, x) => a + x, 0) / bs.length;
  const spread = Math.sqrt(bs.reduce((a, x) => a + (x - mb) ** 2, 0) / bs.length) / (mb || 1);

  if (spread < 0.12) {
    return {
      ready: false,
      identifiable: false,
      styles,
      spread,
      reason: 'your home meals are too steady to separate from your metabolism',
      remedy: 'The maths needs stretches where you eat much more or much less home food than usual — '
            + 'a week away, or a fortnight of fully weighed dinners. Until then the Pot method below is '
            + 'the reliable way to pin this down.',
    };
  }

  const res = solve2(M, v);
  if (!res) return { ready: false, styles, reason: 'the numbers do not separate yet' };

  const k = Math.max(0.55, Math.min(1.9, res.x[0]));
  const kErr = Math.sqrt(Math.max(1e-9, res.inv[0][0]));
  const tdee = res.x[1];
  const tdeeErr = Math.sqrt(Math.max(1e-9, res.inv[1][1]));
  const learned = 1 - Math.min(1, kErr / kSd);

  const out = {};
  for (const st of styles) {
    const p = prior(st);
    out[st] = {
      mean: k * p.mean,
      sd: Math.sqrt((p.mean * kErr) ** 2 + (p.sd * 0.4) ** 2),
      prior: p.mean, priorSd: p.sd,
      learned,
      servings: countServings(store, st, from),
      label: STYLES[st].label,
    };
  }

  return {
    ready: true,
    styles: out,
    richness: { k, sd: kErr, learned, anchor: Math.round(tdeeGuess) },
    tdee: { mean: tdee, sd: tdeeErr },
    checkpoints: rows.length,
    days: days.length,
    weighIns: weighed.length,
    span: { from: days[0].key, to: days[days.length - 1].key },
  };
}

function countServings(store, style, from) {
  let n = 0;
  for (const key of Object.keys(store.days)) {
    if (key < from) continue;
    for (const e of store.days[key].entries || []) if (e.dish === style) n++;
  }
  return n;
}

/*
 * The density to actually use right now: your solved figure once the fit has
 * meaningfully beaten the book, the published range until then.
 */
export function densityFor(store, style, solved = null) {
  const s = solved || solveDensities(store);
  const hit = s.ready && s.styles[style];
  if (hit && hit.learned > 0.15) {
    return { mean: hit.mean, sd: hit.sd, source: 'yours', learned: hit.learned,
             servings: hit.servings, k: s.richness.k };
  }
  const p = prior(style);
  return { mean: p.mean, sd: p.sd, source: 'reference', learned: hit ? hit.learned : 0 };
}
