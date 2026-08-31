/*
 * Charts that look like the data is alive.
 *
 * The Whoop section was the flattest part of this app, which was backwards:
 * it is the only screen showing something genuinely live, arriving on its
 * own, measured overnight while you slept. It should feel that way.
 *
 * Everything here draws with plain SVG and CSS — no charting library, so
 * nothing to go stale, and every animation is a stroke-dashoffset or a
 * transform, which the compositor handles without touching layout. All of
 * it collapses to a static frame under prefers-reduced-motion.
 */

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

let uid = 0;
const nextId = p => `${p}-${++uid}`;

const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/* Recovery's colour IS its meaning — the three bands are the reading. */
export function recoveryColour(v) {
  if (v == null) return 'var(--muted)';
  if (v >= 67) return 'var(--good)';
  if (v >= 34) return 'var(--caution)';
  return 'var(--warn)';
}

/*
 * A circular gauge.
 *
 * Sweeps from empty on first paint, because a number that arrives rather
 * than simply being there reads as measured rather than stored.
 */
export function ring({
  value, max = 100, size = 168, stroke = 13,
  colour = 'var(--accent)', label = '', sub = '', dp = 0, unit = '',
} = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, (value ?? 0) / max));

  const wrap = document.createElement('div');
  wrap.className = 'ring-wrap';
  wrap.style.width = size + 'px';
  wrap.style.height = size + 'px';

  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
  svg.setAttribute('class', 'ring-svg');

  svg.append(svgEl('circle', {
    cx: size / 2, cy: size / 2, r,
    fill: 'none', stroke: 'var(--line)', 'stroke-width': stroke,
  }));

  const arc = svgEl('circle', {
    cx: size / 2, cy: size / 2, r,
    fill: 'none', stroke: colour, 'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-dasharray': c,
    'stroke-dashoffset': reduced() ? c * (1 - pct) : c,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  });
  arc.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)';
  svg.append(arc);
  wrap.append(svg);

  const centre = document.createElement('div');
  centre.className = 'ring-centre';
  const big = document.createElement('div');
  big.className = 'ring-value num';
  big.style.color = colour;
  big.textContent = value == null ? '—' : (dp ? (0).toFixed(dp) : '0');
  const lab = document.createElement('div');
  lab.className = 'micro';
  lab.textContent = label;
  const subEl = document.createElement('div');
  subEl.className = 'ring-sub fine';
  subEl.textContent = sub;
  centre.append(lab, big, subEl);
  wrap.append(centre);

  // Fill and count up together. Both are guaranteed to land even if the
  // frame callback never runs — see countUp.
  const settleArc = () => arc.setAttribute('stroke-dashoffset', String(c * (1 - pct)));
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(settleArc);
    setTimeout(settleArc, 400);
  } else {
    settleArc();
  }
  if (value != null) countUp(big, value, dp, unit);

  return wrap;
}

/*
 * Count a number up to its value.
 *
 * Eased rather than linear so it decelerates into place; a linear count
 * reads like a loading spinner rather than a measurement settling.
 */
export function countUp(node, target, dp = 0, unit = '', ms = 900) {
  const settle = () => { node.textContent = fmt(target, dp) + unit; };

  if (reduced() || typeof requestAnimationFrame !== 'function') { settle(); return; }

  let done = false;
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = fmt(target * eased, dp) + unit;
    if (p < 1) requestAnimationFrame(step);
    else { done = true; settle(); }
  };
  requestAnimationFrame(step);

  /*
   * The animation is decoration; the number is not.
   *
   * requestAnimationFrame is throttled to nothing in a background tab and
   * on some low-power devices, which would leave the figure frozen at zero
   * — a wrong number presented as a real one, which is far worse than no
   * animation. This guarantees the true value lands regardless.
   */
  setTimeout(() => { if (!done) settle(); }, ms + 300);
}

const fmt = (v, dp) => dp ? v.toFixed(dp) : String(Math.round(v));

/*
 * An area chart with a gradient fill.
 *
 * The line alone was too thin to read as anything; the fill underneath is
 * what turns a row of numbers into a shape you can take in at a glance.
 * Draws itself in left to right on first paint.
 */
export function areaChart(points, {
  w = 340, h = 120, colour = 'var(--accent)', pad = 8,
  showDots = false, band = null, format = v => String(Math.round(v)),
} = {}) {
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart-rich' });
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.height = h + 'px';
  svg.style.width = '100%';
  if (!points.length) return svg;

  const vals = points.map(p => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (band) { lo = Math.min(lo, band.lo); hi = Math.max(hi, band.hi); }
  const span = (hi - lo) || 1;
  const padY = span * 0.15;
  lo -= padY; hi += padY;

  const x = i => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = v => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);

  const gid = nextId('grad');
  const grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(
    svgEl('stop', { offset: '0%', 'stop-color': colour, 'stop-opacity': '0.34' }),
    svgEl('stop', { offset: '100%', 'stop-color': colour, 'stop-opacity': '0' }),
  );
  const defs = svgEl('defs');
  defs.append(grad);
  svg.append(defs);

  // the typical range, drawn behind everything as context
  if (band) {
    svg.append(svgEl('rect', {
      x: 0, y: y(band.hi), width: w, height: Math.max(1, y(band.lo) - y(band.hi)),
      fill: colour, opacity: 0.07,
    }));
  }

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  svg.append(svgEl('path', {
    d: `${line}L${x(points.length - 1).toFixed(1)},${h}L${x(0).toFixed(1)},${h}Z`,
    fill: `url(#${gid})`,
  }));

  const stroke = svgEl('path', {
    d: line, fill: 'none', stroke: colour,
    'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  });
  svg.append(stroke);

  if (!reduced()) {
    const len = points.length * 40;
    stroke.style.strokeDasharray = len;
    stroke.style.strokeDashoffset = len;
    stroke.style.transition = 'stroke-dashoffset 1.2s ease-out';
    const settle = () => { stroke.style.strokeDashoffset = '0'; };
    requestAnimationFrame(settle);
    setTimeout(settle, 500);
  }

  if (showDots) {
    const last = points[points.length - 1];
    const dot = svgEl('circle', {
      cx: x(points.length - 1), cy: y(last.v), r: 3.5, fill: colour,
    });
    dot.setAttribute('class', 'chart-pulse');
    svg.append(dot);
  }
  return svg;
}

/*
 * Sleep, as the stages it was actually made of.
 *
 * One number for hours slept hides the thing that matters — six hours that
 * was mostly light sleep is not the same night as six hours with normal
 * deep and REM, and only the stacked view shows that.
 */
export function stageBar(stages, { h = 26 } = {}) {
  const total = stages.reduce((a, s) => a + s.value, 0);
  const wrap = document.createElement('div');
  wrap.className = 'stage-bar';
  wrap.style.height = h + 'px';
  if (!total) return wrap;

  stages.forEach((s, i) => {
    if (s.value <= 0) return;
    const seg = document.createElement('div');
    seg.className = 'stage-seg';
    seg.style.background = s.colour;
    seg.title = `${s.label}: ${s.value.toFixed(1)} h`;
    seg.style.width = reduced() ? (s.value / total * 100) + '%' : '0%';
    seg.style.transitionDelay = (i * 90) + 'ms';
    wrap.append(seg);
    if (!reduced()) {
      const settle = () => { seg.style.width = (s.value / total * 100) + '%'; };
      requestAnimationFrame(settle);
      setTimeout(settle, 500);   // never leave a bar at zero width
    }
  });
  return wrap;
}

/* A small live indicator — a quiet pulse, not a spinner. */
export function liveDot(colour = 'var(--accent)') {
  const d = document.createElement('span');
  d.className = 'live-dot';
  d.style.setProperty('--dot', colour);
  return d;
}

/* Bars for a set of days, e.g. a fortnight of recovery scores. */
export function barRow(points, { h = 56, colourFor = () => 'var(--accent)' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'bar-row';
  wrap.style.height = h + 'px';
  const max = Math.max(...points.map(p => p.v), 1);
  points.forEach((p, i) => {
    const b = document.createElement('div');
    b.className = 'bar-col';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.background = colourFor(p.v);
    const pct = (p.v / max) * 100;
    fill.style.height = reduced() ? pct + '%' : '0%';
    fill.style.transitionDelay = (i * 22) + 'ms';
    if (p.label) b.title = p.label;
    b.append(fill);
    wrap.append(b);
    if (!reduced()) {
      const settle = () => { fill.style.height = pct + '%'; };
      requestAnimationFrame(settle);
      setTimeout(settle, 500);
    }
  });
  return wrap;
}

/* ── Apple Health style ─────────────────────────────────────────────── */

/*
 * The chart language Apple Health uses, and the reason it reads so well:
 * rounded capsule bars rather than a hairline, the extremes labelled
 * directly on the chart instead of on an axis you have to read across to,
 * and no gridlines competing with the data. You take the shape in first and
 * the numbers second, which is the right order for a glance.
 */
export function healthBars(points, {
  h = 150, colour = 'var(--accent)', unit = '', dp = 0,
  showRange = true, barMin = 3, gap = 0.34,
  band = null, colourFor = null,
} = {}) {
  const svg = svgEl('svg', { class: 'hchart' });
  svg.setAttribute('height', String(h));
  if (!points.length) return svg;

  const n = points.length;
  const w = Math.max(300, n * 13);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const vals = points.map(p => p.v).filter(v => v != null);
  if (!vals.length) return svg;

  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  /*
   * Where the bars start from.
   *
   * Padding below the minimum by a share of the *value* collapses any
   * series whose variation is small next to its magnitude: ninety days of
   * weight moving 0.4 kg around 85 kg became ninety identical full-height
   * bars. Pad by a share of the range instead, so the chart shows the
   * variation that exists — while still refusing to start at the minimum,
   * which would turn noise into a cliff.
   */
  const range = hi - lo;
  const base = range === 0
    ? Math.max(0, lo - Math.max(1, Math.abs(lo) * 0.02))
    : (lo > 0 && range / hi < 0.55 ? lo - range * 0.45 : 0);
  const span = (hi - base) || 1;

  const topPad = showRange ? 26 : 8;
  const botPad = 20;
  const plot = h - topPad - botPad;

  const slot = w / n;
  const bw = Math.max(barMin, slot * (1 - gap));
  const y = v => topPad + plot - ((v - base) / span) * plot;

  const hiIdx = vals.length ? points.findIndex(p => p.v === hi) : -1;
  const loIdx = vals.length ? points.findIndex(p => p.v === lo) : -1;

  /* Your own normal band, drawn behind the bars. A reading means little
     without it: 48 ms of HRV is good or poor depending entirely on whose
     wrist it came from. */
  if (band && band.lo != null && band.hi != null) {
    const yHi = y(Math.min(band.hi, hi));
    const yLo = y(Math.max(band.lo, base));
    svg.append(svgEl('rect', {
      class: 'hband', x: 0, y: yHi.toFixed(1),
      width: w, height: Math.max(1, yLo - yHi).toFixed(1),
      fill: 'currentColor', opacity: 0.07,
    }));
  }

  points.forEach((p, i) => {
    if (p.v == null) return;
    const top = y(p.v);
    const height = Math.max(barMin, topPad + plot - top);
    const x = i * slot + (slot - bw) / 2;
    const c = colourFor ? colourFor(p.v, p)
      : (typeof colour === 'function' ? colour(p.v, p) : colour);
    const bar = svgEl('rect', {
      class: 'hbar',
      x: x.toFixed(1), y: top.toFixed(1),
      width: bw.toFixed(1), height: height.toFixed(1),
      rx: Math.min(bw / 2, 4), fill: c,
      opacity: p.dim ? 0.34 : 1,
    });
    if (p.label) {
      const t = svgEl('title'); t.textContent = p.label; bar.append(t);
    }
    svg.append(bar);

    if (!reduced()) {
      bar.setAttribute('y', String(topPad + plot));
      bar.setAttribute('height', '0');
      const settle = () => {
        bar.style.transition = `y .6s cubic-bezier(.22,1,.36,1) ${i * 12}ms, height .6s cubic-bezier(.22,1,.36,1) ${i * 12}ms`;
        bar.setAttribute('y', top.toFixed(1));
        bar.setAttribute('height', height.toFixed(1));
      };
      requestAnimationFrame(settle);
      setTimeout(settle, 500);
    }
  });

  /* Extremes labelled on the chart, where the eye already is. */
  if (showRange && hiIdx >= 0) {
    const put = (idx, val, above) => {
      const x = Math.min(w - 26, Math.max(22, idx * slot + slot / 2));
      const t = svgEl('text', {
        class: 'hc-cap', x, y: above ? y(val) - 9 : h - 6,
        'text-anchor': 'middle', fill: 'var(--text-2)',
      });
      t.textContent = fmt(val, dp) + unit;
      svg.append(t);
    };
    put(hiIdx, hi, true);
    if (loIdx >= 0 && lo !== hi) put(loIdx, lo, false);
  }
  return svg;
}

/*
 * A stacked day-part bar — sleep stages, or where the day's calories fell.
 * Same capsule language, read horizontally.
 */
export function segmentBar(segments, { h = 30, radius = 8 } = {}) {
  const total = segments.reduce((a, s) => a + (s.value || 0), 0);
  const wrap = document.createElement('div');
  wrap.className = 'stage-bar';
  wrap.style.height = h + 'px';
  wrap.style.borderRadius = radius + 'px';
  if (!total) return wrap;

  segments.forEach((s, i) => {
    if (!(s.value > 0)) return;
    const seg = document.createElement('div');
    seg.className = 'stage-seg';
    seg.style.background = s.colour;
    seg.title = `${s.label}: ${s.display ?? s.value}`;
    const pct = (s.value / total) * 100;
    seg.style.width = reduced() ? pct + '%' : '0%';
    seg.style.transitionDelay = (i * 80) + 'ms';
    wrap.append(seg);
    if (!reduced()) {
      const settle = () => { seg.style.width = pct + '%'; };
      requestAnimationFrame(settle);
      setTimeout(settle, 500);
    }
  });
  return wrap;
}


/*
 * healthLine — for quantities that are continuous.
 *
 * Bars imply a count you could have more or fewer of; weight and blood
 * markers are levels, and a level reads as a line. Apple Health makes the
 * same split, and it matters here because a bar chart of a trend weight is
 * ninety near-identical rectangles carrying one bit of information.
 *
 * The y-range hugs the data, so the axis shows the movement rather than
 * the distance from zero — which for an 85 kg person is all of it.
 */
export function healthLine(points, {
  h = 150, colour = 'var(--accent)', unit = '', dp = 1,
  showRange = true, raw = null,
} = {}) {
  const svg = svgEl('svg', { class: 'hchart hline' });
  svg.setAttribute('height', String(h));
  const pts = points.filter(p => p && p.v != null);
  if (!pts.length) return svg;

  const w = 340;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const vals = pts.map(p => p.v);
  const rawVals = (raw || []).filter(p => p && p.v != null).map(p => p.v);
  const hi = Math.max(...vals, ...rawVals);
  const lo = Math.min(...vals, ...rawVals);
  const range = (hi - lo) || Math.max(1, Math.abs(hi) * 0.02);
  const top = hi + range * 0.30;
  const bot = lo - range * 0.30;
  const span = top - bot;

  const topPad = showRange ? 18 : 8;
  const botPad = 16;
  const plot = h - topPad - botPad;
  const n = pts.length;
  const X = i => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const Y = v => topPad + plot - ((v - bot) / span) * plot;

  const gid = 'lg' + Math.random().toString(36).slice(2, 8);
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(
    svgEl('stop', { offset: '0%',   'stop-color': colour, 'stop-opacity': '.26' }),
    svgEl('stop', { offset: '100%', 'stop-color': colour, 'stop-opacity': '0' }));
  defs.append(grad); svg.append(defs);

  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)},${Y(p.v).toFixed(2)}`).join('');
  svg.append(svgEl('path', {
    d: `${d}L${X(n - 1).toFixed(2)},${(topPad + plot).toFixed(2)}L${X(0).toFixed(2)},${(topPad + plot).toFixed(2)}Z`,
    fill: `url(#${gid})`, stroke: 'none',
  }));

  // The actual readings, faint, behind the trend they were smoothed into.
  if (raw && raw.length) {
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      if (!p || p.v == null) continue;
      svg.append(svgEl('circle', {
        cx: X(i).toFixed(2), cy: Y(p.v).toFixed(2), r: 1.5,
        fill: colour, opacity: '.30',
      }));
    }
  }

  const line = svgEl('path', {
    d, fill: 'none', stroke: colour, 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke',
  });
  svg.append(line);

  if (showRange) {
    const hiI = vals.indexOf(Math.max(...vals));
    const loI = vals.indexOf(Math.min(...vals));
    const mark = (i, v, above) => {
      const t = svgEl('text', {
        x: Math.min(w - 26, Math.max(20, X(i))).toFixed(1),
        y: (Y(v) + (above ? -7 : 13)).toFixed(1),
        class: 'hlabel', 'text-anchor': 'middle',
      });
      t.textContent = v.toFixed(dp) + unit;
      svg.append(t);
    };
    mark(hiI, vals[hiI], true);
    if (loI !== hiI) mark(loI, vals[loI], false);
  }

  if (!reduced()) {
    const len = 1400;
    line.style.strokeDasharray = String(len);
    line.style.strokeDashoffset = String(len);
    let done = false;
    const settle = () => { if (done) return; done = true; line.style.strokeDashoffset = '0'; };
    requestAnimationFrame(() => {
      line.style.transition = 'stroke-dashoffset .85s cubic-bezier(.22,1,.36,1)';
      settle();
    });
    setTimeout(settle, 1200);
  }

  return svg;
}

/*
 * A sparkline small enough to sit in a table row.
 *
 * No axes, no labels, no baseline text — at this size any of those would
 * be unreadable and would only add ink. It answers one question: has this
 * been going up, down, or nowhere. The number beside it says where it is
 * now, and the detail view says everything else.
 */
export function miniSpark(values, { w = 62, h = 22, colour = 'currentColor' } = {}) {
  const svg = svgEl('svg', { class: 'mspark', viewBox: `0 0 ${w} ${h}` });
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  const vals = (values || []).filter(v => v != null && Number.isFinite(v));
  if (vals.length < 2) return svg;

  const hi = Math.max(...vals), lo = Math.min(...vals);
  /* Pad by the range, never the magnitude — a series moving 0.4 around 85
     must still show the 0.4. */
  const range = (hi - lo) || Math.max(Math.abs(hi) * 0.02, 0.001);
  const top = hi + range * 0.18, bot = lo - range * 0.18;
  const n = vals.length;
  const X = i => (i / (n - 1)) * w;
  const Y = v => h - ((v - bot) / (top - bot)) * h;

  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  svg.append(svgEl('path', {
    d, fill: 'none', stroke: colour, 'stroke-width': 1.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke',
  }));
  /* The most recent point, so the eye lands on where it ends. */
  svg.append(svgEl('circle', {
    cx: X(n - 1).toFixed(1), cy: Y(vals[n - 1]).toFixed(1), r: 1.9, fill: colour,
  }));
  return svg;
}

/*
 * A chart in the Health app's idiom.
 *
 * Apple draws a daily series in a way that is specific enough to be
 * recognised on sight, and none of it is decoration: bars are capsules on
 * a floor rather than columns in a frame; the scale is stated once at the
 * top and once at the bottom, on the right, where it cannot be mistaken
 * for data; the dates sit under the plot rather than inside it. Every
 * gridline that would have crossed the readings is gone.
 *
 * The floor is the part that carries meaning. Steps and energy start at
 * zero, because zero steps is a real day and the bar height is then the
 * count. Heart rate, oxygen and temperature do not — nobody's resting
 * heart rate lives near zero, and anchoring there would compress a real
 * 12 bpm swing into a flat row of identical bars. Those are drawn as
 * Health draws them: a capsule sitting at the reading, on a scale that
 * starts just under the lowest one.
 */
const acFmt = (v, dp) =>
  v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

const acDate = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y) return '';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export function appleChart(points, {
  colour = 'var(--accent)', unit = '', dp = 0, h = 108, zero = false, axis = true,
} = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ac';

  const vals = points.map(p => p.v).filter(v => v != null && Number.isFinite(v));
  if (!vals.length) return wrap;

  const hi = Math.max(...vals), lo = Math.min(...vals);
  /* Pad by the spread, never by the magnitude — a fortnight of blood
     oxygen moving 1.2% around 96% must still show the 1.2%. */
  const spread = (hi - lo) || Math.max(Math.abs(hi) * 0.04, 0.1);
  const top = zero ? (hi || 1) * 1.1 : hi + spread * 0.4;
  const bot = zero ? 0 : Math.max(0, lo - spread * 0.4);
  const span = (top - bot) || 1;

  const plot = document.createElement('div');
  plot.className = 'ac-plot';
  plot.style.height = h + 'px';

  for (const [v, cls] of [[top, 'ac-hi'], [bot, 'ac-lo']]) {
    const g = document.createElement('div');
    g.className = 'ac-grid ' + cls;
    const lab = document.createElement('span');
    lab.textContent = acFmt(v, dp) + (unit ? ' ' + unit : '');
    g.append(lab);
    plot.append(g);
  }

  const bars = document.createElement('div');
  bars.className = 'ac-bars';
  for (const p of points) {
    const cell = document.createElement('div');
    cell.className = 'ac-cell';
    if (p.v != null && Number.isFinite(p.v)) {
      const y = Math.max(0, Math.min(1, (p.v - bot) / span));
      const cap = document.createElement('i');
      cap.style.background = colour;
      if (zero) {
        cap.style.bottom = '0';
        cap.style.height = `max(3px, ${(y * 100).toFixed(2)}%)`;
      } else {
        /* One reading a day is a point, not a range, so Health's range
           capsule collapses to a short one sitting at the value. */
        cap.style.height = '10px';
        cap.style.bottom = `calc(${(y * 100).toFixed(2)}% - 5px)`;
      }
      cell.append(cap);
      if (p.label) cell.title = p.label;
    }
    bars.append(cell);
  }
  plot.append(bars);
  wrap.append(plot);

  if (axis) {
    const ax = document.createElement('div');
    ax.className = 'ac-axis';
    const a = document.createElement('span'), b = document.createElement('span');
    a.textContent = acDate(points[0]?.date);
    b.textContent = acDate(points[points.length - 1]?.date);
    ax.append(a, b);
    wrap.append(ax);
  }
  return wrap;
}

/*
 * The three Activity rings, as an Apple Watch draws them.
 *
 * This is the one picture a Watch owner checks every day, and it is the
 * closest thing Apple has to Whoop's recovery score: a single glance that
 * says whether today has happened yet. The Whoop view leads with a
 * recovery dial, so the Apple view leads with these.
 *
 * Each ring is its own goal, which is the whole point of there being
 * three — six hundred calories does not excuse sitting down all day, and
 * twelve stand hours is not a workout. They are never combined into one
 * score, because Apple does not combine them either.
 *
 * A ring can be overachieved. The arc stops at full so the picture stays
 * readable, and the number underneath keeps counting, which is what the
 * Watch does.
 */
const RING_DEFS = [
  ['move',     'Move',     'Cal',  '#FA114F', '#FF5E3A'],
  ['exercise', 'Exercise', 'Min',  '#76E900', '#B4FF3A'],
  ['stand',    'Stand',    'Hrs',  '#00D4E8', '#0AF0C8'],
];

export function activityRings(data, { size = 150, stroke = 15, gap = 5 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'rings';

  const present = RING_DEFS.filter(([k]) => data?.[k]?.value != null);
  if (!present.length) return wrap;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${size} ${size}`, width: size, height: size,
    class: 'rings-svg', role: 'img',
    'aria-label': present.map(([k, label, unit]) =>
      `${label} ${Math.round(data[k].value)} of ${Math.round(data[k].goal)} ${unit}`).join(', '),
  });
  const c = size / 2;

  RING_DEFS.forEach(([key, , , c1, c2], i) => {
    const d = data?.[key];
    /* Ring positions are fixed. Move is always outermost, so two people
       comparing screens are looking at the same ring in the same place
       even when one of them is not sending stand hours yet. */
    const r = c - stroke / 2 - i * (stroke + gap);
    if (r <= stroke) return;

    const track = svgEl('circle', {
      cx: c, cy: c, r, fill: 'none', 'stroke-width': stroke,
      stroke: c1, opacity: 0.18,
    });
    svg.append(track);
    if (!d || d.value == null) return;

    const grad = nextId('ring');
    const lg = svgEl('linearGradient', { id: grad, x1: '0', y1: '0', x2: '0', y2: '1' });
    lg.append(svgEl('stop', { offset: '0', 'stop-color': c2 }),
              svgEl('stop', { offset: '1', 'stop-color': c1 }));
    const defs = svgEl('defs', {});
    defs.append(lg);
    svg.append(defs);

    const frac = Math.max(0, Math.min(1, (d.value || 0) / (d.goal || 1)));
    const circ = 2 * Math.PI * r;
    const arc = svgEl('circle', {
      cx: c, cy: c, r, fill: 'none', stroke: `url(#${grad})`,
      'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': `${circ} ${circ}`,
      'stroke-dashoffset': circ * (1 - frac),
      transform: `rotate(-90 ${c} ${c})`,
    });
    if (!reduced()) {
      arc.setAttribute('stroke-dashoffset', circ);
      requestAnimationFrame(() => {
        arc.style.transition = 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)';
        arc.setAttribute('stroke-dashoffset', String(circ * (1 - frac)));
      });
    }
    svg.append(arc);
  });

  wrap.append(svg);

  const key = document.createElement('div');
  key.className = 'rings-key';
  for (const [k, label, unit, c1] of RING_DEFS) {
    const d = data?.[k];
    const row = document.createElement('div');
    row.className = 'rings-row';
    row.innerHTML = '';
    const name = document.createElement('span');
    name.className = 'rings-name';
    name.style.color = c1;
    name.textContent = label;
    const val = document.createElement('span');
    val.className = 'rings-val';
    if (!d || d.value == null) {
      val.className += ' rings-missing';
      val.textContent = 'not sent';
    } else {
      val.textContent = `${acFmt(d.value, d.dp ?? 0)}/${acFmt(d.goal, 0)}`;
      const u = document.createElement('i');
      u.textContent = ' ' + unit;
      val.append(u);
    }
    row.append(name, val);
    key.append(row);
  }
  wrap.append(key);
  return wrap;
}

/*
 * Two series on one scale, for when the comparison is the point.
 *
 * Kept separate from healthLine, which draws a raw series behind its own
 * smoothed version — same shape twice, one faint. Here the two lines are
 * different claims about the same quantity, and the gap between them is
 * the finding, so both are drawn at full strength and the band between
 * them is filled: the eye should land on the divergence, not on either
 * line's shape.
 */
export function dualLine(points, {
  h = 170, aColour = 'var(--accent)', bColour = 'var(--m-c)',
  unit = '', dp = 1,
} = {}) {
  const svg = svgEl('svg', { class: 'hchart' });
  svg.setAttribute('height', String(h));

  const usable = points.filter(p => p.a != null || p.b != null);
  if (usable.length < 2) return svg;

  const w = Math.max(320, usable.length * 9);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const all = usable.flatMap(p => [p.a, p.b]).filter(v => v != null);
  const hi = Math.max(...all), lo = Math.min(...all);
  const range = (hi - lo) || Math.max(Math.abs(hi) * 0.02, 0.2);
  const top = hi + range * 0.22, bot = lo - range * 0.22;

  const pad = 22;
  const X = i => (i / (usable.length - 1)) * w;
  const Y = v => (h - pad) - ((v - bot) / (top - bot)) * (h - pad * 1.4);

  /* The band first, so both lines sit on top of it. Drawn only across the
     stretch where both series exist — a fill that guesses across a gap
     would be inventing the very thing this chart exists to measure. */
  const both = usable.map((p, i) => ({ i, p })).filter(x => x.p.a != null && x.p.b != null);
  if (both.length > 1) {
    const up = both.map(x => `${X(x.i).toFixed(1)},${Y(x.p.a).toFixed(1)}`);
    const dn = both.slice().reverse().map(x => `${X(x.i).toFixed(1)},${Y(x.p.b).toFixed(1)}`);
    svg.append(svgEl('polygon', {
      points: [...up, ...dn].join(' '),
      fill: 'currentColor', opacity: 0.13, class: 'dl-band',
    }));
  }

  const line = (pick, colour, dash) => {
    let d = '', open = false;
    usable.forEach((p, i) => {
      const v = pick(p);
      if (v == null) { open = false; return; }
      d += `${open ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      open = true;
    });
    if (!d) return;
    svg.append(svgEl('path', {
      d, fill: 'none', stroke: colour, 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
      ...(dash ? { 'stroke-dasharray': '5 4' } : {}),
    }));
  };

  line(p => p.a, aColour, true);    /* what the log predicts */
  line(p => p.b, bColour, false);   /* what the scale says */

  const lastB = [...usable].reverse().find(p => p.b != null);
  if (lastB) {
    svg.append(svgEl('circle', {
      cx: X(usable.indexOf(lastB)).toFixed(1), cy: Y(lastB.b).toFixed(1),
      r: 3, fill: bColour,
    }));
  }
  return svg;
}
