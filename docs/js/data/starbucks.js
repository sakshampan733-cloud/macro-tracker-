/*
 * Starbucks India, as a build rather than a menu item.
 *
 * Nobody orders the menu as written. A Grande Latte is a starting point,
 * and what actually gets drunk is a Grande Latte with an extra shot, on
 * skim, with two pumps instead of four — a drink whose calories and
 * caffeine are nothing like the number on the board. A fixed food entry
 * for "Caffe Latte, grande" is therefore wrong for most of the people
 * ordering it, and wrong in the direction that matters, because the
 * customisations people make are exactly the ones that move the figure.
 *
 * So the drink is assembled the way the barista assembles it: a base, a
 * size, a milk, a shot count, a pump count, whip on or off. The panel
 * falls out of the build, and so does the caffeine — which is the whole
 * reason this is worth doing properly, since the shot count is the thing
 * the ceiling and the bedtime maths care about.
 */

/* Cup volumes in ml. Cold cups are larger at the same name. */
export const SIZES = {
  tall:   { label: 'Tall',   hot: 354, cold: 354 },
  grande: { label: 'Grande', hot: 473, cold: 473 },
  venti:  { label: 'Venti',  hot: 591, cold: 709 },
};

/* Per 100 ml. Indian Starbucks pours toned milk as standard. */
export const MILKS = {
  whole:   { label: 'Full fat',   kcal: 62, p: 3.2, c: 4.8, f: 3.3, sat: 2.1 },
  skim:    { label: 'Skim',       kcal: 35, p: 3.4, c: 5.0, f: 0.2, sat: 0.1 },
  soy:     { label: 'Soy',        kcal: 54, p: 3.3, c: 6.0, f: 1.8, sat: 0.3 },
  almond:  { label: 'Almond',     kcal: 24, p: 0.5, c: 3.0, f: 1.1, sat: 0.1 },
  oat:     { label: 'Oat',        kcal: 60, p: 1.0, c: 10.0, f: 1.5, sat: 0.2 },
  coconut: { label: 'Coconut',    kcal: 30, p: 0.2, c: 3.0, f: 2.0, sat: 1.8 },
  none:    { label: 'No milk',    kcal: 0,  p: 0,   c: 0,   f: 0,   sat: 0 },
};

/* One pump. Sauces are heavier than syrups because they carry cocoa fat. */
export const PUMPS = {
  classic:     { label: 'Classic',        kcal: 20, c: 5.0, sug: 5.0, f: 0,   sat: 0 },
  vanilla:     { label: 'Vanilla',        kcal: 20, c: 5.0, sug: 5.0, f: 0,   sat: 0 },
  caramel:     { label: 'Caramel',        kcal: 20, c: 5.0, sug: 5.0, f: 0,   sat: 0 },
  hazelnut:    { label: 'Hazelnut',       kcal: 20, c: 5.0, sug: 5.0, f: 0,   sat: 0 },
  mocha:       { label: 'Mocha sauce',    kcal: 27, c: 6.0, sug: 5.0, f: 0.6, sat: 0.4 },
  whitemocha:  { label: 'White mocha',    kcal: 30, c: 5.5, sug: 5.5, f: 1.0, sat: 0.8 },
  chai:        { label: 'Chai concentrate', kcal: 22, c: 5.5, sug: 5.0, f: 0, sat: 0 },
  matcha:      { label: 'Matcha blend',   kcal: 28, c: 6.5, sug: 6.0, f: 0,   sat: 0 },
  none:        { label: 'None',           kcal: 0,  c: 0,   sug: 0,   f: 0,   sat: 0 },
};

/* Whipped cream, by cup size. */
const WHIP = { tall: { kcal: 60, f: 6, sat: 4, c: 1 },
               grande: { kcal: 80, f: 8, sat: 5, c: 1.5 },
               venti: { kcal: 100, f: 10, sat: 6.5, c: 2 } };

export const SHOT_ML = 30;
export const SHOT_CAFFEINE = 75;

/*
 * The menu. `shots` and `pumps` are the standard build at each size — the
 * numbers a barista uses when you say nothing — and everything about them
 * is adjustable afterwards.
 */
export const DRINKS = {
  /* ── Espresso ── */
  'espresso':        { name: 'Espresso', kind: 'espresso', iced: false,
                       shots: { tall: 1, grande: 2, venti: 3 }, milk: 0, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 }, fixedMl: 30 },
  'americano':       { name: 'Caffe Americano', kind: 'espresso', iced: false,
                       shots: { tall: 2, grande: 3, venti: 4 }, milk: 0, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 } },
  'cappuccino':      { name: 'Cappuccino', kind: 'espresso', iced: false,
                       shots: { tall: 1, grande: 2, venti: 2 }, milk: 0.55, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 } },
  'latte':           { name: 'Caffe Latte', kind: 'espresso', iced: false,
                       shots: { tall: 1, grande: 2, venti: 2 }, milk: 0.80, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 } },
  'flat-white':      { name: 'Flat White', kind: 'espresso', iced: false,
                       shots: { tall: 2, grande: 3, venti: 3 }, milk: 0.78, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 } },
  'cortado':         { name: 'Cortado', kind: 'espresso', iced: false,
                       shots: { tall: 2, grande: 2, venti: 3 }, milk: 0.5, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 }, fixedMl: 177 },
  'macchiato-esp':   { name: 'Espresso Macchiato', kind: 'espresso', iced: false,
                       shots: { tall: 2, grande: 2, venti: 3 }, milk: 0.15, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 }, fixedMl: 90 },
  'caramel-macchiato': { name: 'Caramel Macchiato', kind: 'espresso', iced: false,
                       shots: { tall: 1, grande: 2, venti: 2 }, milk: 0.78, syrup: 'vanilla',
                       pumps: { tall: 3, grande: 4, venti: 5 }, drizzle: true },
  'mocha':           { name: 'Caffe Mocha', kind: 'espresso', iced: false,
                       shots: { tall: 1, grande: 2, venti: 2 }, milk: 0.74, syrup: 'mocha',
                       pumps: { tall: 3, grande: 4, venti: 5 }, whip: true },
  'white-mocha':     { name: 'White Chocolate Mocha', kind: 'espresso', iced: false,
                       shots: { tall: 1, grande: 2, venti: 2 }, milk: 0.74, syrup: 'whitemocha',
                       pumps: { tall: 3, grande: 4, venti: 5 }, whip: true },
  'vanilla-latte':   { name: 'Vanilla Latte', kind: 'espresso', iced: false,
                       shots: { tall: 1, grande: 2, venti: 2 }, milk: 0.79, syrup: 'vanilla',
                       pumps: { tall: 3, grande: 4, venti: 5 } },
  'hazelnut-latte':  { name: 'Hazelnut Latte', kind: 'espresso', iced: false,
                       shots: { tall: 1, grande: 2, venti: 2 }, milk: 0.79, syrup: 'hazelnut',
                       pumps: { tall: 3, grande: 4, venti: 5 } },

  /* ── Iced and brewed ── */
  'iced-latte':      { name: 'Iced Caffe Latte', kind: 'espresso', iced: true,
                       shots: { tall: 1, grande: 2, venti: 3 }, milk: 0.6, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 } },
  'iced-americano':  { name: 'Iced Americano', kind: 'espresso', iced: true,
                       shots: { tall: 2, grande: 3, venti: 4 }, milk: 0, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 } },
  'brewed':          { name: 'Brewed Coffee (Pike Place)', kind: 'brewed', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 },
                       baseCaffeine: { tall: 235, grande: 310, venti: 410 } },
  'cold-brew':       { name: 'Cold Brew', kind: 'brewed', iced: true,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 },
                       baseCaffeine: { tall: 155, grande: 205, venti: 310 } },
  'vsc-cold-brew':   { name: 'Vanilla Sweet Cream Cold Brew', kind: 'brewed', iced: true,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.15, syrup: 'vanilla',
                       pumps: { tall: 2, grande: 3, venti: 4 },
                       baseCaffeine: { tall: 155, grande: 205, venti: 310 } },
  'filter-kaapi':    { name: 'Filter Kaapi', kind: 'brewed', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.5, syrup: 'classic',
                       pumps: { tall: 2, grande: 2, venti: 3 },
                       baseCaffeine: { tall: 120, grande: 160, venti: 200 } },

  /* ── Frappuccino ── */
  'frapp-coffee':    { name: 'Coffee Frappuccino', kind: 'frapp', iced: true,
                       shots: { tall: 1, grande: 1, venti: 2 }, milk: 0.5, syrup: 'classic',
                       pumps: { tall: 2, grande: 3, venti: 4 } },
  'frapp-caramel':   { name: 'Caramel Frappuccino', kind: 'frapp', iced: true,
                       shots: { tall: 1, grande: 1, venti: 2 }, milk: 0.5, syrup: 'caramel',
                       pumps: { tall: 2, grande: 3, venti: 4 }, whip: true, drizzle: true },
  'frapp-mocha':     { name: 'Mocha Frappuccino', kind: 'frapp', iced: true,
                       shots: { tall: 1, grande: 1, venti: 2 }, milk: 0.5, syrup: 'mocha',
                       pumps: { tall: 2, grande: 3, venti: 4 }, whip: true },
  'frapp-java-chip': { name: 'Java Chip Frappuccino', kind: 'frapp', iced: true,
                       shots: { tall: 1, grande: 1, venti: 2 }, milk: 0.5, syrup: 'mocha',
                       pumps: { tall: 2, grande: 3, venti: 4 }, whip: true, chips: true },
  'frapp-dcc':       { name: 'Double Chocolate Chip Crème Frappuccino', kind: 'frapp', iced: true,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.55, syrup: 'mocha',
                       pumps: { tall: 3, grande: 4, venti: 5 }, whip: true, chips: true,
                       baseCaffeine: { tall: 10, grande: 15, venti: 20 } },
  'frapp-vanilla':   { name: 'Vanilla Crème Frappuccino', kind: 'frapp', iced: true,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.6, syrup: 'vanilla',
                       pumps: { tall: 3, grande: 4, venti: 5 }, whip: true },
  'frapp-cookie':    { name: 'Cookie Crumble Frappuccino', kind: 'frapp', iced: true,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.55, syrup: 'mocha',
                       pumps: { tall: 3, grande: 4, venti: 5 }, whip: true, chips: true },
  'frapp-matcha':    { name: 'Green Tea Crème Frappuccino', kind: 'frapp', iced: true,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.6, syrup: 'matcha',
                       pumps: { tall: 3, grande: 4, venti: 5 }, whip: true,
                       baseCaffeine: { tall: 55, grande: 80, venti: 110 } },

  /* ── Teavana and India-specific ── */
  'chai-latte':      { name: 'Chai Tea Latte', kind: 'tea', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.5, syrup: 'chai',
                       pumps: { tall: 3, grande: 4, venti: 5 },
                       baseCaffeine: { tall: 70, grande: 95, venti: 120 } },
  'masala-chai':     { name: 'Masala Chai Tea Latte', kind: 'tea', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.55, syrup: 'chai',
                       pumps: { tall: 3, grande: 4, venti: 5 },
                       baseCaffeine: { tall: 70, grande: 95, venti: 120 } },
  'iced-chai':       { name: 'Iced Chai Tea Latte', kind: 'tea', iced: true,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.45, syrup: 'chai',
                       pumps: { tall: 3, grande: 4, venti: 5 },
                       baseCaffeine: { tall: 70, grande: 95, venti: 120 } },
  'matcha-latte':    { name: 'Matcha Green Tea Latte', kind: 'tea', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.85, syrup: 'matcha',
                       pumps: { tall: 2, grande: 3, venti: 4 },
                       baseCaffeine: { tall: 55, grande: 80, venti: 110 } },
  'english-breakfast': { name: 'English Breakfast Tea', kind: 'tea', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 },
                       baseCaffeine: { tall: 40, grande: 60, venti: 90 } },
  'mint-tea':        { name: 'Mint Blend Herbal Tea', kind: 'tea', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 } },

  /* ── No coffee at all ── */
  'hot-chocolate':   { name: 'Signature Hot Chocolate', kind: 'other', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.9, syrup: 'mocha',
                       pumps: { tall: 4, grande: 5, venti: 6 }, whip: true,
                       baseCaffeine: { tall: 25, grande: 30, venti: 40 } },
  'steamed-milk':    { name: 'Steamed Milk', kind: 'other', iced: false,
                       shots: { tall: 0, grande: 0, venti: 0 }, milk: 0.95, syrup: 'none',
                       pumps: { tall: 0, grande: 0, venti: 0 } },
};

/* The build a barista would hand you if you said only the drink's name. */
export function defaultBuild(id, size = 'grande') {
  const d = DRINKS[id];
  if (!d) return null;
  return {
    id, size,
    milk: d.milk > 0 ? 'whole' : 'none',
    shots: d.shots[size] ?? 0,
    syrup: d.syrup || 'none',
    pumps: d.pumps[size] ?? 0,
    whip: !!d.whip,
    chips: !!d.chips,
    drizzle: !!d.drizzle,
  };
}

/*
 * Turn a build into a nutrition panel.
 *
 * Volumes first: the cup is a fixed size, the shots and the syrup take
 * their share of it, and what remains is milk. That is why an extra shot
 * in a latte lowers its calories slightly — there is less room for milk —
 * and it is the kind of detail a fixed menu entry cannot express.
 */
export function buildMacros(build) {
  const d = DRINKS[build.id];
  if (!d) return null;

  const size = SIZES[build.size] ? build.size : 'grande';
  const cup = d.fixedMl || SIZES[size][d.iced ? 'cold' : 'hot'];
  /* A cold cup is a third ice by volume. */
  const liquid = d.iced && !d.fixedMl ? cup * 0.68 : cup;

  const shotMl = (build.shots || 0) * SHOT_ML;
  const pumpMl = (build.pumps || 0) * 7;
  const milkShare = d.milk || 0;
  const milkMl = milkShare > 0
    ? Math.max(0, Math.min(liquid - shotMl - pumpMl, liquid * milkShare))
    : 0;

  const M = MILKS[build.milk] || MILKS.none;
  const P = PUMPS[build.syrup] || PUMPS.none;

  let kcal = (M.kcal * milkMl) / 100 + P.kcal * (build.pumps || 0);
  let p    = (M.p * milkMl) / 100;
  let c    = (M.c * milkMl) / 100 + P.c * (build.pumps || 0);
  let f    = (M.f * milkMl) / 100 + P.f * (build.pumps || 0);
  let sat  = (M.sat * milkMl) / 100 + P.sat * (build.pumps || 0);
  let sug  = (M.c * milkMl) / 100 + P.sug * (build.pumps || 0);

  if (build.whip) {
    const w = WHIP[size] || WHIP.grande;
    kcal += w.kcal; f += w.f; sat += w.sat; c += w.c; sug += w.c;
  }
  if (build.chips)   { kcal += 70; f += 3.5; sat += 2.2; c += 10; sug += 8; }
  if (build.drizzle) { kcal += 30; f += 0.5; c += 6.5; sug += 6; }

  /* Frappuccino base syrup, which is in every blended drink. */
  if (d.kind === 'frapp') { kcal += 60; c += 15; sug += 14; }

  const caffeine = (build.shots || 0) * SHOT_CAFFEINE
    + (d.baseCaffeine?.[size] || 0);

  const total = Math.round(liquid + (build.whip ? 25 : 0));
  return {
    ml: total,
    kcal: Math.round(kcal), p: +p.toFixed(1), c: +c.toFixed(1), f: +f.toFixed(1),
    sat: +sat.toFixed(1), sug: +sug.toFixed(1), fib: 0, na: Math.round(milkMl * 0.5),
    caffeine: Math.round(caffeine),
  };
}

/* A build, written the way you would say it out loud. */
export function buildName(build) {
  const d = DRINKS[build.id];
  if (!d) return 'Starbucks drink';
  const bits = [SIZES[build.size]?.label || '', d.name];
  const extra = [];
  const std = defaultBuild(build.id, build.size);
  if (build.shots !== std.shots) extra.push(`${build.shots} shot${build.shots === 1 ? '' : 's'}`);
  if (build.milk !== std.milk && build.milk !== 'none') extra.push(MILKS[build.milk].label.toLowerCase());
  if (build.pumps !== std.pumps) extra.push(`${build.pumps} pump${build.pumps === 1 ? '' : 's'}`);
  if (build.whip !== std.whip) extra.push(build.whip ? 'whip' : 'no whip');
  return bits.filter(Boolean).join(' ') + (extra.length ? ` (${extra.join(', ')})` : '');
}

export const DRINK_LIST = Object.entries(DRINKS)
  .map(([id, d]) => ({ id, ...d }))
  .sort((a, b) => a.name.localeCompare(b.name));
