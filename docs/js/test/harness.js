/*
 * A test runner with no build step, because this project has none.
 *
 * There is no node on the machine this app is developed on and no bundler
 * in the repo, which rules out every mainstream runner. What there is, is a
 * browser that already loads these exact ES modules — so the tests run
 * there, against the real files, with nothing standing in between.
 *
 * That constraint turns out to be an advantage for what these tests are
 * for. They are the contract for the native port: the numbers Basal
 * produces today, written down and checked. A runner that also runs inside
 * a WKWebView means the same suite can be pointed at the ported build and
 * asked whether it still computes the same answers — which is the only
 * question that matters when the interface is being rewritten around a
 * calculation layer that must not move.
 *
 * Deliberately tiny: describe, it, and a handful of assertions. Anything
 * more would be a framework to maintain alongside the app.
 */

const suites = [];
let current = null;

export function describe(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function it(name, fn) {
  if (!current) throw new Error(`it("${name}") outside describe()`);
  current.tests.push({ name, fn });
}

/* ── assertions ──────────────────────────────────────────────────────── */

class Failed extends Error {}

const show = v =>
  typeof v === 'number' ? String(v)
  : typeof v === 'string' ? JSON.stringify(v)
  : v === null ? 'null'
  : v === undefined ? 'undefined'
  : Array.isArray(v) ? `[${v.map(show).join(', ')}]`
  : JSON.stringify(v);

export function eq(actual, expected, why = '') {
  if (actual !== expected) {
    throw new Failed(`expected ${show(expected)}, got ${show(actual)}${why ? ` — ${why}` : ''}`);
  }
}

/*
 * Numbers, with a tolerance.
 *
 * Most of what this suite checks is arithmetic that ends in a rounding
 * step, and a port that arrives at 2,574 where this one says 2,575 has not
 * broken anything. Exactness is demanded only where the value is a
 * definition rather than a computation — the carb RDA, the calorie floor —
 * and those use eq.
 */
export function near(actual, expected, tol = 1, why = '') {
  if (typeof actual !== 'number' || Number.isNaN(actual)) {
    throw new Failed(`expected a number near ${expected}, got ${show(actual)}${why ? ` — ${why}` : ''}`);
  }
  if (Math.abs(actual - expected) > tol) {
    throw new Failed(`expected ${expected} ±${tol}, got ${actual}${why ? ` — ${why}` : ''}`);
  }
}

export function ok(value, why = '') {
  if (!value) throw new Failed(`expected truthy, got ${show(value)}${why ? ` — ${why}` : ''}`);
}

export function notOk(value, why = '') {
  if (value) throw new Failed(`expected falsy, got ${show(value)}${why ? ` — ${why}` : ''}`);
}

export function isNull(value, why = '') {
  if (value !== null) throw new Failed(`expected null, got ${show(value)}${why ? ` — ${why}` : ''}`);
}

/* Between, inclusive. For figures that are allowed a range rather than a
   point — a protein target, say, where the rule is "at least this much". */
export function within(actual, lo, hi, why = '') {
  if (!(actual >= lo && actual <= hi)) {
    throw new Failed(`expected ${lo}–${hi}, got ${show(actual)}${why ? ` — ${why}` : ''}`);
  }
}

export function throws(fn, why = '') {
  try { fn(); } catch { return; }
  throw new Failed(`expected a throw${why ? ` — ${why}` : ''}`);
}

/* ── running ─────────────────────────────────────────────────────────── */

export async function run(report) {
  let pass = 0, fail = 0;
  for (const suite of suites) {
    report.suite(suite.name);
    for (const t of suite.tests) {
      try {
        await t.fn();
        pass++;
        report.pass(t.name);
      } catch (e) {
        fail++;
        report.fail(t.name, e instanceof Failed ? e.message : (e.stack || String(e)));
      }
    }
  }
  report.done(pass, fail);
  return { pass, fail };
}
