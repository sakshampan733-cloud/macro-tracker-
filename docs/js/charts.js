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

  // fill and count up together, once the element is actually on screen
  requestAnimationFrame(() => {
    arc.setAttribute('stroke-dashoffset', String(c * (1 - pct)));
    if (value != null) countUp(big, value, dp, unit);
  });

  return wrap;
}

/*
 * Count a number up to its value.
 *
 * Eased rather than linear so it decelerates into place; a linear count
 * reads like a loading spinner rather than a measurement settling.
 */
export function countUp(node, target, dp = 0, unit = '', ms = 900) {
  if (reduced()) { node.textContent = fmt(target, dp) + unit; return; }
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = fmt(target * eased, dp) + unit;
    if (p < 1) requestAnimationFrame(step);
    else node.textContent = fmt(target, dp) + unit;
  };
  requestAnimationFrame(step);
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
    requestAnimationFrame(() => { stroke.style.strokeDashoffset = '0'; });
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
      requestAnimationFrame(() => { seg.style.width = (s.value / total * 100) + '%'; });
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
    if (!reduced()) requestAnimationFrame(() => { fill.style.height = pct + '%'; });
  });
  return wrap;
}
