/*
 * One restaurant's menu.
 *
 * Opened by searching its name. Inside, the same box narrows the menu
 * rather than the whole library — which is the behaviour people already
 * have from every delivery app, and the reason "search Starbucks, then
 * search mocha inside it" needs no explaining.
 */

import { el, clear, sheet, icon, replaceKids, append } from '../ui.js';
import { dayKey, get } from '../store.js';
import { RESTAURANTS, menuOf } from '../data/restaurants.js';
import { DRINK_LIST, defaultBuild, buildMacros } from '../data/starbucks.js';
import { openPortion } from './portion.js';
import { openBuilder as openDrinkBuilder } from './starbucks.js';
import { toItem } from '../search.js';

/*
 * Group a menu into readable sections.
 *
 * Order is the whole algorithm: the first pattern to match wins, so the
 * specific ones have to come before the loose ones. Getting this backwards
 * filed "Garlic naan" under Pizza & sides — because the pizza rule looks
 * for the word garlic — and "Spring roll" under Burgers, because the
 * burger rule looks for roll. Breads and starters therefore go first.
 */
const SECTIONS = [
  ['Breads', /naan|\broti\b|chapati|paratha|kulcha|bhatur|missi|phulka/i],
  ['Biryani & rice', /biryani|pulao|\brice\b/i],
  /* "tikka" is a starter; "tikka masala" is a curry. */
  ['Starters & tandoor', /tikka(?! masala)|kebab|kabab|manchurian|chilli|pakora|spring roll|corn cheese|seekh|tandoori (?!roti)/i],
  ['Curries', /masala|curry|paneer|\bdal\b|korma|kofta|saag|gobi|bhindi|rajma|chole|josh|kadhi|dum aloo|jeera aloo|mixed veg|butter chicken/i],
  ['Noodles & Chinese', /noodle|chowmein|hakka|schezwan|fried rice/i],
  ['Burgers & mains', /burger|whopper|zinger|maharaja|wrap|frankie|\broll\b|sandwich|inch|burrito|bowl/i],
  ['Chicken', /chicken|wings|popcorn|nuggets/i],
  ['Pizza & sides', /pizza|margherita|farmhouse|peppy|garlic|fries|bread/i],
  ['Chaat & snacks', /chaat|puri|bhel|\bsev\b|tikki|\bpav\b|vada|samosa|kachori|bhujia|namkeen|papad|thali/i],
  ['Sweets', /gulab|rasgulla|rasmalai|halwa|kheer|katli|soan|lava|mcflurry|cake|jamun/i],
  ['Drinks', /lassi|chaas|coffee|\btea\b|shake|cola|energy/i],
];

function sectionFor(name) {
  for (const [label, re] of SECTIONS) if (re.test(name)) return label;
  return 'Everything else';
}

export function openRestaurant(brandId, ctx, { dateKey = null } = {}) {
  const r = RESTAURANTS[brandId];
  if (!r) return null;
  const key = dateKey || ctx?.date || dayKey();

  const results = el('div');
  const search = el('input', {
    type: 'search', autocomplete: 'off',
    placeholder: `Search ${r.name}`,
    oninput: e => draw(e.target.value),
  });

  /* ── Starbucks is a builder, everything else is a portion ── */
  const drinkCell = d => {
    const m = buildMacros(defaultBuild(d.id, 'grande'));
    return el('button.food-cell', {
      onclick: () => { sh.close(); openDrinkBuilder(d.id, key, ctx); },
    },
      el('span.fc-name', {}, d.name),
      el('span.fc-kcal', {}, `${m.kcal} kcal · ${m.caffeine} mg`));
  };

  const foodCell = f => el('button.food-cell', {
    onclick: () => {
      sh.close();
      openPortion(toItem(f), { dateKey: key, onSaved: ctx?.refresh });
    },
  },
    el('span.fc-name', {}, f.n),
    el('span.fc-kcal', {}, `${Math.round(f.per100?.kcal || 0)} · ${Math.round(f.per100?.p || 0)}P`));

  function draw(q) {
    clear(results);
    const needle = (q || '').trim().toLowerCase();

    if (r.drinks) {
      const list = needle.length >= 2
        ? DRINK_LIST.filter(d => d.name.toLowerCase().includes(needle))
        : DRINK_LIST;
      if (!list.length) {
        results.append(el('div.fine', {}, `Nothing on the menu matches “${q}”.`));
        return;
      }
      if (needle.length >= 2) {
        results.append(el('div.food-grid', {}, ...list.map(drinkCell)));
        return;
      }
      const KINDS = [['espresso', 'Espresso'], ['frapp', 'Frappuccino'],
                     ['brewed', 'Brewed & cold brew'], ['tea', 'Teavana & chai'],
                     ['other', 'No coffee']];
      for (const [kind, label] of KINDS) {
        const group = list.filter(d => d.kind === kind);
        if (!group.length) continue;
        results.append(
          el('div.section-label', {}, el('span.micro', {}, label)),
          el('div.food-grid', {}, ...group.map(drinkCell)));
      }
      return;
    }

    let items = menuOf(brandId, get().settings?.diet);
    if (needle.length >= 2) {
      items = items.filter(f => (f.n + ' ' + (f.alt || '')).toLowerCase().includes(needle));
      results.append(items.length
        ? el('div.food-grid', {}, ...items.map(foodCell))
        : el('div.fine', {}, `Nothing on this menu matches “${q}”.`));
      return;
    }

    /* Sectioned, in the order the sections are declared, so a long menu
       reads like a menu instead of an alphabetical list. */
    const groups = new Map();
    for (const f of items) {
      const sec = sectionFor(f.n);
      if (!groups.has(sec)) groups.set(sec, []);
      groups.get(sec).push(f);
    }
    const order = [...SECTIONS.map(s => s[0]), 'Everything else'];
    for (const sec of order) {
      const g = groups.get(sec);
      if (!g?.length) continue;
      results.append(
        el('div.section-label', {}, el('span.micro', {}, sec)),
        el('div.food-grid', {}, ...g.map(foodCell)));
    }
  }

  draw('');

  const sh = sheet({
    title: r.name,
    body: el('div', {},
      r.blurb ? el('div.fine', { style: { marginBottom: '10px' } }, r.blurb) : null,
      el('div.field', {}, search),
      results),
  });
  return sh;
}

/* A tappable brand row for the main search results. */
export function restaurantCell(brand, ctx, onOpen) {
  return el('button.rest-cell', {
    onclick: () => { onOpen?.(); openRestaurant(brand.id, ctx); },
  },
    /* A monogram rather than an icon: one generic glyph repeated down a
       list tells you nothing, and the first letter of the name is the
       thing your eye is already looking for. */
    el('span.rest-mark', {}, brand.name.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase()),
    el('span.grow', {},
      el('span.rest-name', {}, brand.name),
      el('span.micro', {}, `${brand.kind} · ${brand.count} item${brand.count === 1 ? '' : 's'}`)),
    icon('chevron', 14));
}
