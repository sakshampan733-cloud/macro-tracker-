/* Application shell: routing, the tab bar, and first-run. */

/*
 * Bump this whenever something ships. It shows in Settings, so when the
 * phone and the laptop disagree about what the app can do, you can see
 * which one is stale instead of guessing.
 */
export const VERSION = '2026.08.20-foods';

import { el, clear, icon, toast, $ } from './ui.js';
import { get, subscribe, dayKey, pushBackup, setDishDensities } from './store.js';
import { solveDensities } from './dishes.js';
import { bestTDEE } from './nutrition.js';
import { renderToday } from './views/today.js';
import { renderAdd } from './views/add.js';
import { renderPlan } from './views/plan.js';
import { renderBody } from './views/body.js';
import { renderFoods } from './views/foods.js';
import { renderOnboarding, renderSettings } from './views/setup.js';
import { autoSyncWhoop } from './views/body.js';

const TABS = [
  { id: 'today', label: 'Today', icon: 'today', render: renderToday },
  { id: 'add',   label: 'Add',   icon: 'plus',  render: renderAdd },
  { id: 'plan',  label: 'Plan',  icon: 'coach', render: renderPlan },
  { id: 'foods', label: 'Foods', icon: 'foods', render: renderFoods },
  { id: 'body',  label: 'Body',  icon: 'body',  render: renderBody },
];

const ROUTES = Object.fromEntries(TABS.map(t => [t.id, t.render]));
ROUTES.settings = renderSettings;

const ctx = {
  route: 'today',
  date: dayKey(),
  tab: 'mine',
  go(route, props = {}) {
    ctx.route = route;
    Object.assign(ctx, props);
    location.hash = route === 'today' && props.date === undefined ? '' : '#' + route;
    draw();
    scroller.scrollTo({ top: 0, behavior: 'instant' });
  },
  refresh() { draw(); },
};

const main = document.getElementById('app');
const nav = document.getElementById('tabs');
const scroller = document.getElementById('scroller');

/* The pill shrinks aside while the page is moving and settles once it stops. */
let settle;
scroller.addEventListener('scroll', () => {
  nav.classList.add('scrolling');
  clearTimeout(settle);
  settle = setTimeout(() => nav.classList.remove('scrolling'), 220);
}, { passive: true });

function drawNav() {
  clear(nav);
  for (const t of TABS) {
    nav.append(el('button', {
      'aria-current': ctx.route === t.id ? 'page' : null,
      onclick: () => ctx.go(t.id, t.id === 'today' ? { date: dayKey() } : {}),
    }, icon(t.icon, 21), el('span', {}, t.label)));
  }
}

function drawHeader() {
  const s = get();
  return el('div.topbar', {},
    el('div.brand', {}, 'BAS', el('span', {}, 'AL')),
    el('div.grow'),
    s.profile ? el('button.x-btn', {
      'aria-label': 'Settings',
      onclick: () => ctx.go('settings'),
    }, icon('gear', 17)) : null,
  );
}

/*
 * Re-solve the home-dish densities before drawing.
 *
 * Entries store grams and a style, so every screen values them from this.
 * Refreshing here means a newly logged weigh-in improves what last month's
 * dinners were worth, rather than leaving them frozen at a first guess.
 */
function refreshDensities() {
  const s = get();
  if (!s.profile) return;
  try {
    const tdeeGuess = bestTDEE(s, s.profile).kcal || 2400;
    const solved = solveDensities(s, { tdeeGuess });
    setDishDensities(solved.ready
      ? Object.fromEntries(Object.entries(solved.styles).map(([k, v]) => [k, { mean: v.mean, sd: v.sd }]))
      : {});
  } catch (e) {
    console.warn('density solve failed', e);
    setDishDensities({});
  }
}

function draw() {
  const s = get();
  refreshDensities();
  clear(main);

  if (!s.profile) {
    nav.classList.add('hide');
    renderOnboarding(main, ctx);
    return;
  }

  nav.classList.remove('hide');
  main.append(drawHeader());

  const view = el('div');
  main.append(view);

  const render = ROUTES[ctx.route] || renderToday;
  try {
    render(view, ctx);
  } catch (e) {
    console.error(e);
    view.append(el('div.tile', {},
      el('h3', {}, 'That screen failed to draw'),
      el('p', { style: { color: 'var(--muted)', fontSize: '13px' } }, String(e && e.message)),
      el('button.btn.sm', { onclick: () => ctx.go('today') }, 'Back to today')));
  }
  drawNav();
}

/* Storage errors are the one background failure worth interrupting for. */
subscribe((evt, payload) => {
  if (evt === 'error') toast(payload, 'err');
});

window.addEventListener('hashchange', () => {
  const r = location.hash.slice(1);
  if (r && ROUTES[r] && r !== ctx.route) { ctx.route = r; draw(); }
});

/* The day rolls over while the app sits open on a phone overnight. */
setInterval(() => {
  const today = dayKey();
  if (ctx.route === 'today' && ctx.date !== today && ctx.date === dayKey(new Date(Date.now() - 86400000))) {
    ctx.date = today;
    draw();
  }
}, 60000);

let backupTimer;
subscribe(evt => {
  if (['entry:add', 'entry:remove', 'weight', 'whoop', 'library'].includes(evt)) {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(pushBackup, 8000);
  }
});

/*
 * Keep the installed app current.
 *
 * A home-screen PWA keeps its own copy of everything so it works offline,
 * which also means it can happily run last week's code forever. So: check
 * for a new worker on every launch, and when one takes over, reload once so
 * the running page is not left half-old.
 */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.update().catch(() => {});
    setInterval(() => reg.update().catch(() => {}), 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => {});

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

/* Top up from Whoop in the background; redraw only if something arrived. */
if (get().profile) {
  autoSyncWhoop().then(changed => { if (changed) draw(); });
}

const initial = location.hash.slice(1);
if (initial && ROUTES[initial]) ctx.route = initial;
draw();
