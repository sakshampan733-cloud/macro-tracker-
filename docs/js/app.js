/* Application shell: routing, the tab bar, and first-run. */

/*
 * Bump this whenever something ships. It shows in Settings, so when the
 * phone and the laptop disagree about what the app can do, you can see
 * which one is stale instead of guessing.
 */
export const VERSION = '2026.08.26';

import { el, clear, icon, toast, $, setExplanations } from './ui.js';
import { get, subscribe, dayKey, pushBackup, setDishDensities, flush } from './store.js';
import { solveDensities } from './dishes.js';
import { bestTDEE } from './nutrition.js';
import { renderToday } from './views/today.js';
import { renderHome } from './views/home.js';
import { renderAdd } from './views/add.js';
import { renderPlan } from './views/plan.js';
import { renderBody } from './views/body.js';
import { renderFoods } from './views/foods.js';
import { renderOnboarding, renderSettings } from './views/setup.js';
import { autoSyncWhoop } from './views/body.js';
import { installFeedback } from './feedback.js';
import { startReminders } from './reminders.js';
import { applyOrb } from './theme.js';
import { installSwipe } from './swipe.js';
import { maybeShowGuide } from './views/guide.js';
import { guard } from './boot.js';
import { captureFromUrl, isConnected, relayUrl, syncWhoop } from './whooprelay.js';

/*
 * Two apps in one, plus the passive screens.
 *
 * Home is for logging and nothing else. Detail is the same day with every
 * layer of analysis on it. Splitting them means the common action — add a
 * food — never scrolls past an explanation you have already read, and the
 * depth is still one tap away rather than deleted.
 */
const TABS = [
  { id: 'home',   label: 'Home',   icon: 'plus',  render: renderHome },
  { id: 'detail', label: 'Detail', icon: 'today', render: renderToday },
  { id: 'body',   label: 'Body',   icon: 'body',  render: renderBody },
  { id: 'plan',   label: 'Plan',   icon: 'coach', render: renderPlan },
];

const ROUTES = Object.fromEntries(TABS.map(t => [t.id, t.render]));
ROUTES.settings = renderSettings;
ROUTES.add = renderAdd;      // no tab; kept for old links and the shortcut
ROUTES.foods = renderFoods;  // reached from Settings, not a tab of its own
ROUTES.today = renderToday;  // old bookmarks land on Detail

/* Screens that pin their own header. The brand bar scrolls away on these
   so two sticky bars never fight for the same few pixels. */
const STICKY_ROUTES = new Set(['add', 'home']);

/* Home draws its own header — a date you can change — so the wordmark bar
   would only repeat the gear and take the best strip of the screen. */
const OWN_HEADER = new Set(['home']);

const ctx = {
  route: 'home',
  date: dayKey(),
  tab: 'mine',
  go(route, props = {}) {
    ctx.route = route;
    Object.assign(ctx, props);
    location.hash = route === 'home' && props.date === undefined ? '' : '#' + route;
    draw();
    scroller.scrollTo({ top: 0, behavior: 'instant' });
  },
  refresh() { draw(); },
};

const main = document.getElementById('app');
const nav = document.getElementById('tabs');
const scroller = document.getElementById('scroller');

/* The pill shrinks aside while the page is moving and settles once it stops.
   The brand bar picks up a hairline once anything has scrolled behind it. */
let settle;
scroller.addEventListener('scroll', () => {
  nav.classList.add('scrolling');
  clearTimeout(settle);
  settle = setTimeout(() => nav.classList.remove('scrolling'), 220);

  const bar = main.querySelector('.topbar');
  if (bar) bar.classList.toggle('scrolled', scroller.scrollTop > 4);
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
  if (OWN_HEADER.has(ctx.route)) return null;
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
 * Theme.
 *
 * 'auto' used to mean "set no attribute and let prefers-color-scheme
 * decide". That worked for the colour tokens and nothing else: the app
 * has 32 rules scoped to [data-theme="light"] — the header edge, the
 * grain level, pane shadows, the orb tint — and none of them can match
 * while the attribute is absent. The result was light tokens wearing dark
 * corrections, which is the mixed appearance System mode showed.
 *
 * So auto RESOLVES now. The stored preference stays 'auto' and keeps
 * following the system, but the attribute on the root is always a real
 * 'dark' or 'light', and every rule in the stylesheet works as written.
 */
function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

function applyTheme(pref) {
  const root = document.documentElement;
  const resolved = (!pref || pref === 'auto')
    ? (systemPrefersDark() ? 'dark' : 'light')
    : pref;

  root.setAttribute('data-theme', resolved);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#000000' : '#EFEFF1');

  /* colorScheme still advertises both on auto, so scrollbars and form
     controls keep tracking the system rather than being pinned. */
  root.style.colorScheme = (!pref || pref === 'auto') ? 'light dark' : resolved;

  applyOrb(get().settings?.orb || 'red', resolved);
}

/* React to the system flipping while the app is open, on 'auto'. */
window.matchMedia?.('(prefers-color-scheme: dark)')
  .addEventListener?.('change', () => {
    if ((get().settings?.theme || 'dark') === 'auto') applyTheme('auto');
  });

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
  applyTheme(s.settings?.theme || 'dark');
  setExplanations(s.settings?.explain !== false);
  refreshDensities();
  clear(main);

  if (!s.profile) {
    nav.classList.add('hide');
    renderOnboarding(main, ctx);
    return;
  }

  nav.classList.remove('hide');
  main.classList.toggle('has-sticky', STICKY_ROUTES.has(ctx.route));
  /* Lets CSS react to which screen you are on — the orb only beats on Body. */
  document.documentElement.setAttribute('data-route', ctx.route);
  const head = drawHeader();
  if (head) main.append(head);   /* null on screens that draw their own */

  const view = el('div');
  main.append(view);

  const render = ROUTES[ctx.route] || renderHome;
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
  /* Home is the empty hash — ctx.go writes '' for it so the address bar
     stays clean. Requiring a non-empty route here meant the back button
     and any link to '#' silently did nothing, leaving you on whatever
     screen you were already on. */
  const r = location.hash.slice(1) || 'home';
  if (ROUTES[r] && r !== ctx.route) { ctx.route = r; draw(); }
});

/* The day rolls over while the app sits open on a phone overnight. */
setInterval(() => {
  const today = dayKey();
  if ((ctx.route === 'home' || ctx.route === 'detail') && ctx.date !== today && ctx.date === dayKey(new Date(Date.now() - 86400000))) {
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

/*
 * Coming back from the Whoop authorisation: the tokens arrive in the URL
 * fragment. Grab them before anything renders, then sync straight away so
 * the first thing seen after connecting is actual data.
 */
const justConnected = captureFromUrl();

if (get().profile) {
  if (relayUrl() && isConnected()) {
    syncWhoop({ days: justConnected ? 365 : 120 })
      .then(() => draw())
      .catch(() => { /* offline or expired; the Body screen explains */ });
  } else {
    // the Mac helper route, for when the server is running
    autoSyncWhoop().then(changed => { if (changed) draw(); });
  }
}

const initial = location.hash.slice(1);
/*
 * Persist before the system can suspend us. Both events, because Safari
 * fires pagehide on navigation and visibilitychange on backgrounding, and
 * neither one alone covers being swiped away mid-log.
 */
guard(VERSION);

addEventListener('pagehide', flush);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

installFeedback();
startReminders();
maybeShowGuide();

/*
 * Swipe between the four tabs. Only the tab order — settings, foods and
 * the report are destinations you enter and leave, not places in a row.
 */
installSwipe({
  surface: main,
  order: TABS.map(t => t.id),
  current: () => ctx.route,
  go: id => ctx.go(id),
});

if (initial && ROUTES[initial]) ctx.route = initial;
draw();
