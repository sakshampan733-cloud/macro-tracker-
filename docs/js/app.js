/* Application shell: routing, the tab bar, and first-run. */

/*
 * Bump this whenever something ships. It shows in Settings, so when the
 * phone and the laptop disagree about what the app can do, you can see
 * which one is stale instead of guessing.
 */
export const VERSION = '2026.09.04-goalhome';

import { el, clear, icon, toast, $, setExplanations } from './ui.js';
import { get, commit, subscribe, dayKey, openDay, noteAppOpen, pushBackup, setDishDensities, flush } from './store.js';
import { applyOrb } from './theme.js';
import { solveDensities } from './dishes.js';
import { bestTDEE, macroTargets, goalRate } from './nutrition.js';
import { renderToday } from './views/today.js';
import { renderHome } from './views/home.js';
import { renderAdd } from './views/add.js';
import { renderPlan } from './views/plan.js';
import { renderTrain } from './views/train.js';
import { renderBody } from './views/body.js';
import { renderFoods } from './views/foods.js';
import { renderOnboarding, renderSettings } from './views/setup.js';
import { autoSyncWhoop } from './views/body.js';
import { autoSyncApple, repairSleepUnits } from './applehealth.js';
import { installFeedback } from './feedback.js';
import { installPullToRefresh, refreshEverything } from './pulltorefresh.js';
import { startReminders } from './reminders.js';
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
  /* Train replaces Plan. Plan was advice already read; this answers a
     question that changes daily. The old screen stays reachable so its
     content is not lost, it simply no longer holds a tab. */
  { id: 'train',  label: 'Train',  icon: 'barbell', render: renderTrain },
];

const ROUTES = Object.fromEntries(TABS.map(t => [t.id, t.render]));
ROUTES.settings = renderSettings;
ROUTES.add = renderAdd;      // no tab; kept for old links and the shortcut
ROUTES.foods = renderFoods;  // reached from Settings, not a tab of its own
ROUTES.plan = renderPlan;    // no longer a tab; still reachable from Body and old links
ROUTES.today = renderToday;  // old bookmarks land on Detail
/* The opening questions, reachable again from Settings. Same screen, same
   order, seeded from what you already answered. */
ROUTES.profile = (root, c) => renderOnboarding(root, c, { editing: true });

/* Screens that pin their own header. The brand bar scrolls away on these
   so two sticky bars never fight for the same few pixels. */
const STICKY_ROUTES = new Set(['add', 'home']);

/* Home draws its own header — a date you can change — so the wordmark bar
   would only repeat the gear and take the best strip of the screen. */
const OWN_HEADER = new Set(['home']);

/* Before anything reads the open day: midnight cannot be noticed unless
   the app has written down which day it last ran on. */
noteAppOpen();

/*
 * Bring the stored target snapshot in line with what this build computes.
 *
 * `s.targets` is a copy written when the profile was last saved, and a few
 * older screens still read it rather than recomputing. Any release that
 * changes the maths therefore leaves them quoting the previous version's
 * numbers — after the age-aware update a sixteen-year-old's live target
 * moved by six hundred calories while the frozen copy kept insisting on
 * the old split, and the two disagreed on screen with no way to reconcile
 * them short of re-saving the profile.
 *
 * Recomputed at boot, and only written when it actually differs, so this
 * costs nothing on the overwhelming majority of launches. A split the
 * person set by hand survives, because macroTargets applies it too.
 */
(() => {
  const s = get();
  if (!s.profile) return;

  /*
   * A dated goal sets the pace, and the pace is recomputed every launch.
   *
   * The rate has to live on the profile because that is what macroTargets
   * reads, but it must not be a stale copy of what the goal implied on the
   * day it was set — a week later you are a week closer to the date and
   * some distance closer to the weight, and the pace that gets you there
   * has moved. Recomputing at boot is what makes the goal actually govern
   * the calories rather than merely describe them.
   */
  const gr = goalRate(s, s.profile);
  if (gr && !gr.done && !gr.arrived && s.profile.rate !== gr.rate) {
    commit(st => { st.profile.rate = gr.rate; }, 'profile');
  }

  const s2 = get();
  if (!s2.targets) return;
  const fresh = macroTargets(s2.profile, bestTDEE(s2, s2.profile).kcal);
  const moved = ['kcal', 'p', 'c', 'f'].some(k => fresh[k] !== s2.targets[k]);
  if (moved) commit(st => { st.targets = fresh; }, 'targets');
})();

const ctx = {
  route: 'home',
  /* The day being logged, which after midnight may still be yesterday. */
  date: openDay(),
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
      onclick: () => ctx.go(t.id, t.id === 'today' ? { date: openDay() } : {}),
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
 * Light is back, and it is a different thing from the one that was removed:
 * that was a cream paper metaphor which made every colour on top of it look
 * muddy. This is Health's own light — a cool near-white page with white
 * cards on it — and the ring palette holds up on both grounds.
 *
 * 'auto' resolves to a real attribute rather than leaving it unset. The
 * stylesheet has rules scoped to the light theme, and none of them can
 * match while the attribute is absent; the result was light tokens wearing
 * dark corrections.
 */
function applyTheme(pref) {
  const root = document.documentElement;
  const resolved = (!pref || pref === 'auto')
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches === false ? 'light' : 'dark')
    : pref;

  root.setAttribute('data-theme', resolved);
  /*
   * The resolved scheme, never "light dark".
   *
   * Advertising both on System told the browser to paint its own furniture
   * — scrollbars, form controls, the overscroll gutter — from the OS
   * setting, while the attribute above had already committed the page to
   * one theme. On a light Mac with the app in dark that came out split
   * down the middle: dark content in a white frame. It follows the
   * resolved value now, and the media listener still tracks the OS.
   */
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#000000' : '#F2F2F7');

  applyOrb(get().settings?.orb || 'none', resolved);

}

/* The system flipping while the app is open, on 'auto'. */
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
  /* Lets CSS react to which screen you are on. */
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

/*
 * The day rolls over while the app sits open on a phone overnight.
 *
 * This used to ask "is the open day yesterday?" and move you to today if
 * so. But yesterday is exactly the day you land on when you deliberately
 * go back one to fix a meal you forgot to log — so within sixty seconds
 * this dragged you to today and redrew the screen underneath you, and
 * editing a previous day was effectively impossible.
 *
 * Rolling over is an event, not a state. Watch for midnight actually
 * passing, and only follow the clock for someone who was sitting on the
 * day that just ended.
 */
let lastToday = dayKey();
setInterval(() => {
  const today = dayKey();
  if (today === lastToday) return;
  const ended = lastToday;
  lastToday = today;
  /* Redraw so the "start a new day" prompt appears, but do not move the
     day underneath someone who may still be eating. */
  if (ctx.route === 'home' || ctx.route === 'detail') draw();
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

  /*
   * Apple runs for everyone, not only for people without Whoop.
   *
   * This sat in the else branch, so the one group who most needs it —
   * somebody wearing both, whose steps only Apple can supply — was the
   * one group it never ran for. Their steps arrived on a manual pull and
   * were never refreshed again.
   */
  if (repairSleepUnits()) draw();
  autoSyncApple().then(changed => { if (changed) draw(); }).catch(() => {});
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

/* Pull down at the top of any screen to re-sync the band and pick up a new
   build. A service-worker app otherwise waits for every tab to close
   before a new version takes over, which on a phone can be days. */
installPullToRefresh(scroller, () => refreshEverything({ redraw: () => draw() }));
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
