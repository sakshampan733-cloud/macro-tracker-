/* Small DOM toolkit. No framework — this app is a few thousand lines and a
   dependency-free build stays instant on a phone and never goes stale. */

export function el(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') {
      /* Object.assign silently drops custom properties — style['--x'] = v
         is a no-op on a CSSStyleDeclaration, which is why colour swatches
         passed as --swatch rendered with no colour at all. */
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) continue;
        if (sk.startsWith('--')) node.style.setProperty(sk, String(sv));
        else node.style[sk] = sv;
      }
    }
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && k !== 'list' && typeof v !== 'object') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }

  const add = c => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return node;
}

export const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

/*
 * Explanations you can switch off.
 *
 * The teaching text earns its place the first few times and becomes clutter
 * once you know what a limiting amino acid is. This gates the paragraphs
 * that explain concepts — never the ones that report your data, which stay
 * regardless.
 */
let explanationsOn = true;
export function setExplanations(v) { explanationsOn = v !== false; }
export function explanationsEnabled() { return explanationsOn; }

export function explain(text, opts = {}) {
  if (!explanationsOn) return null;
  return el('div.fine', { style: opts.style || { marginTop: '10px' } }, text);
}

export function explainNote(title, text, tone = 'info') {
  if (!explanationsOn) return null;
  return el('div', { class: 'note ' + tone },
    el('div', {}, title ? el('b', {}, title) : null,
      el('div.fine', { style: { marginTop: title ? '3px' : '0' } }, text)));
}

/* Element.append() renders null as the literal text "null". Always go
   through this when the child list has conditionals in it. */
export const append = (node, ...kids) => {
  kids.flat().forEach(k => { if (k != null && k !== false) node.append(k); });
  return node;
};
/* replaceChildren has the same flaw as append: a null child becomes the
   literal text "null". Anywhere the child list has conditionals in it,
   go through this instead. */
export const replaceKids = (node, ...kids) => {
  node.replaceChildren();
  kids.flat().forEach(k => { if (k != null && k !== false) node.append(k); });
  return node;
};

/*
 * A tile that redraws itself.
 *
 * Folding "Keep under" open used to call ctx.refresh(), which rebuilds the
 * whole screen — so a disclosure triangle behaved like a page reload,
 * losing your scroll position and flashing every other tile. Nothing about
 * opening a fold requires any of that.
 *
 * `live()` returns a host element that rerenders only its own contents,
 * and resubscribes to the store so a change made elsewhere still reaches
 * it. The subscription unhooks itself the moment the host leaves the
 * document, which is what keeps a route change from leaving listeners
 * behind.
 */
export const live = (build, { on = null, subscribe = null, cls = '' } = {}) => {
  const host = cls ? el('div.' + cls) : el('div');
  let off = null;

  const paint = () => {
    /* Detachment is the signal that this tile is gone for good. */
    if (off && !host.isConnected) { off(); off = null; return; }
    replaceKids(host, build(paint));
  };

  paint();

  if (subscribe) {
    off = subscribe(evt => {
      if (on && !on.includes(evt)) return;
      if (!host.isConnected) { off?.(); off = null; return; }
      paint();
    });
  }
  return host;
};


export const $ = (s, r = document) => r.querySelector(s);

/* ── Formatting ─────────────────────────────────────────────────────── */

export const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round((+n || 0) * f) / f;
};
export const kcal = n => Math.round(+n || 0).toLocaleString('en-IN');
export const g = (n, d = 0) => round(n, d).toFixed(d);

export function grams(n) {
  const v = +n || 0;
  if (v === 0) return '0';
  return v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(0) : v.toFixed(1);
}

export function clock(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function hourLabel(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function dateLabel(key) {
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date(key + 'T12:00:00');
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return 'Today';
  if (key === y.toISOString().slice(0, 10)) return 'Yesterday';
  /*
   * The year, once it is not this one.
   *
   * Dropping it is right for a weigh-in last Tuesday and badly wrong for a
   * projection: a goal moving at 0.06 kg a week genuinely lands in 2028,
   * and "Sun 17 Sept" read as a fortnight away. The date was correct the
   * whole time; only the label was lying.
   */
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(140, (a / b) * 100)) : 0);

/* ── Toast ──────────────────────────────────────────────────────────── */

let toastTimer;
export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(t);
  }
  t.textContent = msg;
  t.className = kind === 'err' ? 'err show' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), kind === 'err' ? 4200 : 2400);
}

/* ── Sheet ──────────────────────────────────────────────────────────── */

let openSheets = [];

export function sheet({ title, body, foot, onClose, wide }) {
  const scrim = el('div.scrim');
  const panel = el('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Panel' });

  const close = () => {
    scrim.remove(); panel.remove();
    openSheets = openSheets.filter(s => s.panel !== panel);
    if (!openSheets.length) document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    onClose && onClose();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };

  // append(), not panel.append() — a sheet with no footer was rendering the
  // literal string "null" at the bottom, because Element.append stringifies
  // it. Same trap as the rail had.
  append(panel,
    el('div.sheet-grip'),
    el('div.sheet-head', {},
      el('h2', {}, title || ''),
      el('button.x-btn', { onclick: close, 'aria-label': 'Close' },
        icon('x'))),
    el('div.sheet-body', {}, body),
    foot ? el('div.sheet-foot', {}, foot) : null,
  );

  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(scrim, panel);
  openSheets.push({ panel, close });

  const focusable = panel.querySelector('input, button, select, textarea');
  if (focusable && !('ontouchstart' in window)) setTimeout(() => focusable.focus(), 60);

  return { close, panel, body: panel.querySelector('.sheet-body') };
}

/*
 * Confirm something, either way round.
 *
 * This was promise-only — `await confirmSheet({ message, confirmLabel })` —
 * and five call sites had been written in the other obvious shape, passing
 * `body`, `confirm` and an `onConfirm` callback. Nothing warned them: the
 * dialog opened, the prose was blank because `message` was undefined, the
 * button read "Confirm" because `confirmLabel` was, and pressing it closed
 * the sheet and did nothing at all, because the callback was never
 * looked at.
 *
 * Removing a workout, deleting a weigh-in, deleting a workout type and
 * removing a medication were all silently inert. Rather than rewrite five
 * call sites and leave the trap armed for the sixth, both shapes work: the
 * promise still resolves, and an `onConfirm` is called if one was given.
 */
export function confirmSheet({
  title, message, body, confirmLabel, confirm, danger, onConfirm,
}) {
  const prose = message ?? body ?? '';
  const label = confirmLabel ?? confirm ?? 'Confirm';
  return new Promise(resolve => {
    let done = false;
    const finish = ok => {
      done = true;
      s.close();
      if (ok) onConfirm?.();
      resolve(ok);
    };
    const s = sheet({
      title,
      body: el('p', { style: { margin: '4px 0 0', color: 'var(--text-2)', lineHeight: '1.5' } }, prose),
      foot: el('div.btn-row', {},
        el('button.btn.ghost', { onclick: () => finish(false) }, 'Cancel'),
        el('button', { class: danger ? 'btn danger' : 'btn primary',
          onclick: () => finish(true) }, label)),
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

/* ── Icons ──────────────────────────────────────────────────────────── */

const PATHS = {
  today:   'M3 9h18M7 3v3M17 3v3M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  plus:    'M12 5v14M5 12h14',
  scan:    'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10.5 8v8M14 8v8M17 8v8',
  coach:   'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  body:    'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 10l6-2 6 2M12 8v7M9 21l3-6 3 6',
  foods:   'M4 4h16v4H4zM4 12h16v8H4zM8 12v8M4 8v4M20 8v4',
  x:       'M18 6 6 18M6 6l12 12',
  chevron: 'm9 18 6-6-6-6',
  'chevron-left': 'm15 18-6-6 6-6',
  back:    'm15 18-6-6 6-6',
  star: 'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  trash:   'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  edit:    'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  drop:    'M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z',
  search:  'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  bolt:    'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  check:   'm5 13 4 4L19 7',
  upload:  'M12 16V4M7 9l5-5 5 5M4 20h16',
  info:    'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  pot:     'M4 9h16v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9zM2 9h2M20 9h2M8 6c0-1 1-1 1-2M12 6c0-1 1-1 1-2M16 6c0-1 1-1 1-2',
  /* A crescent, for sleep. */
  moon:    'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z',
  /* A takeaway cup, for the counter. */
  cup:     'M6 8h12l-1.2 11.2A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.8zM5 5h14l-.4 3H5.4zM10 11v6M14 11v6',
  /* A capsule, tilted — the one shape nobody mistakes for anything else. */
  pill:    'M10.5 3.5a4.95 4.95 0 0 1 7 7l-7 7a4.95 4.95 0 0 1-7-7zM7 7l7 7',
  gear:    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',

  /* Health-category glyphs. Apple files a reading under a category before
     it shows you the number, and the category is carried by its icon —
     a heart, a pair of lungs, a bed — so the Apple view needs them. */
  /* Two figures mid-lift: a barbell. The Body tab already owns the
     standing figure, and two tabs sharing a glyph is two tabs nobody can
     tell apart at a glance. */
  barbell: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10M2 11v2M22 11v2',
  heart:   'M12 20.3 4.6 13a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6A4.8 4.8 0 0 1 19.4 13z',
  lungs:   'M12 3v9M9 12c0-2-1.6-3.6-3-3.6S3 9.7 3 12v4a3 3 0 0 0 4.6 2.5L9 17.6zM15 12c0-2 1.6-3.6 3-3.6S21 9.7 21 12v4a3 3 0 0 1-4.6 2.5L15 17.6z',
  steps:   'M8 3.6c1.6 0 2.4 1.2 2.4 3 0 1.7-.5 3-.5 4.4 0 1.4.4 2.2.4 3.3 0 1.4-.8 2.2-2.3 2.2s-2.4-.9-2.4-2.4c0-1.3.3-2 .3-3.2 0-1.5-.5-2.6-.5-4.3 0-1.8.9-3 2.6-3zM16.4 8c1.4 0 2.2 1 2.2 2.6 0 1.5-.5 2.6-.5 3.8 0 1.2.4 1.9.4 2.9 0 1.2-.8 2-2.1 2s-2.2-.8-2.2-2.1c0-1.1.3-1.8.3-2.8 0-1.3-.5-2.3-.5-3.8 0-1.6.9-2.6 2.4-2.6z',
  flame:   'M12 3s.8 3 2.6 4.6C16.7 9.5 18 11.2 18 13.6A6 6 0 0 1 6 13.6c0-2 .9-3.3 2-4.4.5 1 1.2 1.6 1.9 1.8-.3-2.4.7-5.6 2.1-8z',
  bed:     'M3 18v-8M3 13h13a4 4 0 0 1 4 4v1M21 18v-1M6.5 10.5h2.2M3 18h18',
  thermo:  'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v6.5',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', PATHS[name] || PATHS.info);
  svg.append(p);
  return svg;
}

/* ── The rail ───────────────────────────────────────────────────────── */

/*
 * value  what you've had
 * target what you're aiming at
 * sigma  one standard deviation of measurement error, in the same units
 *
 * The scale runs to 125% of target so overshoot is visible rather than
 * pinned at the end, which would hide exactly the thing you need to see.
 */
export function rail({ value, target, sigma = 0, hue, compact, over }) {
  const scale = target * 1.25 || 1;
  const toPct = v => Math.max(0, Math.min(100, (v / scale) * 100));

  const node = el('div', { class: 'rail' + (compact ? ' compact' : '') + (over ? ' over' : '') });
  node.style.setProperty('--fill', toPct(value) + '%');
  node.style.setProperty('--target', toPct(target) + '%');
  node.style.setProperty('--lo', toPct(Math.max(0, value - sigma)) + '%');
  node.style.setProperty('--hi', toPct(value + sigma) + '%');
  // Over target, the warning colour has to win, so leave --hue to the
  // stylesheet rather than pinning it inline.
  if (hue && !over) node.style.setProperty('--hue', hue);

  append(node,
    el('div.rail-track', {}, el('div.rail-fill')),
    sigma > 0 ? el('div.rail-band') : null,
    el('div.rail-target', { title: 'Target' }),
  );
  return node;
}

export function macroRail({ name, value, target, hue, unit = 'g' }) {
  const over = value > target * 1.02;
  return el('div.macro-row', {},
    el('div.macro-head', {},
      el('span.macro-name', { style: { color: hue } }, name),
      el('span.macro-val', {},
        el('b', {}, grams(value)),
        el('span.of', {}, ` / ${Math.round(target)}${unit}`))),
    rail({ value, target, hue, compact: true, over }),
  );
}

/* ── Charts ─────────────────────────────────────────────────────────── */

export function sparkline(points, { w = 320, h = 64, trend = null, pad = 6 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chart');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('height', h);
  if (!points.length) return svg;

  const vals = points.map(p => p.v);
  const extra = trend ? trend.map(p => p.v) : [];
  const lo = Math.min(...vals, ...extra), hi = Math.max(...vals, ...extra);
  const span = hi - lo || 1;
  const x = i => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = v => h - pad - ((v - lo) / span) * (h - pad * 2);

  const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  const mk = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  svg.append(mk('path', { class: 'line', d: path(points) }));
  if (trend && trend.length) svg.append(mk('path', { class: 'line trend', d: path(trend) }));
  const last = points[points.length - 1];
  svg.append(mk('circle', { class: 'dot', cx: x(points.length - 1), cy: y(last.v), r: 2.6 }));
  return svg;
}

/* Where one reading sits within the whole distribution of your own data. */
export function distribution({ stats, value, dp = 0 }) {
  const lo = stats.min, hi = stats.max, span = hi - lo || 1;
  const p = v => ((v - lo) / span) * 100;

  const wrap = el('div.dist');
  const iqr = el('div.dist-iqr');
  iqr.style.left = p(stats.p25) + '%';
  iqr.style.width = (p(stats.p75) - p(stats.p25)) + '%';
  const med = el('div.dist-med'); med.style.left = p(stats.p50) + '%';
  const now = el('div.dist-now'); now.style.left = `calc(${Math.max(0, Math.min(100, p(value)))}% - 1.5px)`;

  wrap.append(el('div.dist-bar'), iqr, med, now);
  return el('div', {}, wrap,
    el('div.dist-scale', {},
      el('span.micro', {}, lo.toFixed(dp)),
      el('span.micro', {}, 'median ' + stats.p50.toFixed(dp)),
      el('span.micro', {}, hi.toFixed(dp))));
}

/* ── Misc ───────────────────────────────────────────────────────────── */

export function segmented(options, current, onPick, { wrap = false } = {}) {
  const box = el('div', { class: 'seg' + (wrap ? ' wrap' : ''), role: 'group' });
  for (const o of options) {
    const b = el('button', {
      type: 'button',
      'aria-pressed': String(o.value === current),
      onclick: () => {
        [...box.children].forEach(c => c.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onPick(o.value);
      },
    }, o.label);
    box.append(b);
  }
  return box;
}

export function field(label, input, help) {
  return el('div.field', {},
    el('label', { for: input.id || undefined }, label),
    input,
    help ? el('div.help', {}, help) : null);
}

export function empty(title, message, action) {
  return el('div.empty', {}, el('h3', {}, title), el('p', {}, message), action || null);
}

