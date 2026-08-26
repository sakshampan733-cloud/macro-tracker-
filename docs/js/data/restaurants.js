/*
 * Restaurants, the way you actually look for them.
 *
 * Two different searches are going on when someone opens a food app after
 * eating out, and the app only supported one of them. The supported one is
 * "I had a Zinger" — you know the item, you type the item. The unsupported
 * one is "I was at KFC" — you know the place, and you want its menu in
 * front of you so you can find the thing whose name you half remember.
 *
 * Zomato answers both from the same box: type a brand and you get the
 * restaurant, type a dish and you get the dish. That is all this is. The
 * brand becomes a searchable object that opens its own menu; the items
 * stay individually searchable exactly as before.
 *
 * A brand is defined by which foods belong to it rather than by a copy of
 * them, so nothing here duplicates the food data — it indexes it.
 */

import { FOODS } from './foods.js';
import { DRINK_LIST } from './starbucks.js';

/*
 * `match` decides membership. A prefix covers the chains, whose ids were
 * already namespaced; an explicit list covers the counters that are a
 * cuisine rather than a company — a momo stall has no brand, but "momos"
 * is exactly what someone types.
 */
export const RESTAURANTS = {
  starbucks: {
    name: 'Starbucks', kind: 'Cafe',
    alias: 'coffee cafe latte frappuccino cappuccino espresso mocha chai tea',
    /* Built rather than listed: every drink is a customisation. */
    drinks: true,
    blurb: 'Every drink is built — size, milk, shots, pumps.',
  },
  mcdonalds: {
    name: "McDonald's", kind: 'Fast food',
    alias: 'mcd mac maharaja mcaloo mcveggie mcchicken mcspicy fries mcflurry nuggets',
    prefix: 'mcd-',
  },
  kfc: {
    name: 'KFC', kind: 'Fast food',
    alias: 'zinger popcorn chicken hot wings rice bowl box meal fried chicken',
    prefix: 'kfc-',
  },
  dominos: {
    name: "Domino's", kind: 'Pizza',
    alias: 'pizza margherita farmhouse peppy paneer garlic bread choco lava',
    prefix: 'dom-',
  },
  burgerking: {
    name: 'Burger King', kind: 'Fast food',
    alias: 'whopper bk crispy veg chicken fries',
    prefix: 'bk-',
  },
  subway: {
    name: 'Subway', kind: 'Sandwiches',
    alias: 'sub sandwich six inch veggie delite teriyaki paneer tikka',
    prefix: 'sub-',
  },
  haldirams: {
    name: "Haldiram's", kind: 'Sweets & namkeen',
    alias: 'haldiram namkeen bhujia soan papdi kachori samosa mithai sweets thali',
    prefix: 'haldiram-',
  },
  calburrito: {
    name: 'California Burrito', kind: 'Mexican',
    alias: 'burrito bowl mexican cal burrito',
    prefix: 'calburrito-',
  },

  pizzahut: {
    name: 'Pizza Hut', kind: 'Pizza',
    alias: 'pizza pan margherita veggie supreme paneer vega chicken supreme cheesy bites wings',
    prefix: 'ph-',
  },
  wowmomo: {
    name: 'Wow! Momo', kind: 'Momos',
    alias: 'wow momo moburg steamed pan fried dumpling',
    prefix: 'wow-',
  },
  bikanervala: {
    name: 'Bikanervala', kind: 'Sweets & chaat',
    alias: 'bikano bikaner samosa chole bhature rajma chawal thali mithai',
    prefix: 'bikanervala-',
  },
  burgersingh: {
    name: 'Burger Singh', kind: 'Fast food',
    alias: 'burger singh desi burger',
    prefix: 'burger-singh-',
  },
  ccd: {
    name: 'Cafe Coffee Day', kind: 'Cafe',
    alias: 'ccd coffee day cappuccino cold coffee',
    prefix: 'ccd-',
  },
  chaayos: {
    name: 'Chaayos', kind: 'Chai',
    alias: 'chaayos chai masala tea',
    prefix: 'chaayos-',
  },
  keventers: {
    name: 'Keventers', kind: 'Shakes',
    alias: 'keventers milkshake shake',
    prefix: 'keventers-',
  },

  /* ── Counters rather than companies ── */
  pizza: {
    name: 'Pizza, any', kind: 'By the slice',
    alias: 'pizza slice cheese margherita thin crust personal',
    ids: ['pizza-cheese-slice', 'pizza-veg-slice', 'pizza-paneer-slice',
          'pizza-chicken-slice', 'pizza-thin-crust-slice', 'pizza-personal-veg'],
  },
  momos: {
    name: 'Momo stall', kind: 'Street',
    alias: 'momo momos dumpling steamed fried kurkure tandoori chutney',
    prefix: 'momo-',
  },
  chaat: {
    name: 'Chaat counter', kind: 'Street',
    alias: 'chaat golgappa pani puri bhel sev papdi dahi tikki',
    ids: ['pani-puri', 'bhel-puri', 'sev-puri', 'dahi-puri', 'aloo-tikki-chaat',
          'papdi-chaat', 'pav-bhaji', 'vada-pav'],
  },
  indochinese: {
    name: 'Indo-Chinese', kind: 'Street',
    alias: 'chinese manchurian hakka schezwan noodles chowmein chilli fried rice spring roll',
    ids: ['chilli-paneer-dry', 'chilli-paneer-gravy', 'chilli-potato', 'honey-chilli-potato',
          'chilli-chicken', 'veg-manchurian', 'gobi-manchurian', 'hakka-noodles',
          'schezwan-noodles', 'chowmein', 'fried-rice-veg', 'fried-rice-chicken',
          'spring-roll-veg', 'corn-cheese-balls', 'street-chowmein', 'street-manchurian'],
  },
  northindian: {
    name: 'North Indian restaurant', kind: 'Dine-in',
    alias: 'dhaba punjabi curry gravy tandoor thali biryani naan roti dal paneer butter chicken',
    ids: ['biryani-veg', 'biryani-paneer', 'biryani-egg', 'biryani-mutton',
          'biryani-hyderabadi', 'biryani-prawn', 'chicken-biryani',
          'paneer-butter-masala', 'shahi-paneer', 'kadai-paneer', 'matar-paneer',
          'paneer-tikka-masala', 'malai-kofta', 'navratan-korma', 'palak-paneer',
          'dum-aloo', 'jeera-aloo', 'aloo-gobi', 'bhindi-masala', 'mix-veg',
          'sarson-saag', 'dal-fry', 'dal-makhani', 'dal-tadka', 'kadhi-pakora',
          'chole', 'rajma', 'butter-chicken', 'chicken-tikka-masala', 'kadai-chicken',
          'chicken-curry', 'chicken-korma', 'rogan-josh', 'mutton-curry', 'egg-curry',
          'tandoori-chicken', 'paneer-tikka', 'seekh-kebab', 'hara-bhara-kabab',
          'chicken-tikka',
          /* Starters. A North Indian restaurant menu has a chilli paneer
             on it whatever the cuisine's origin, and looking for it under
             "Indo-Chinese" is not how anyone orders. */
          'chilli-paneer-dry', 'chilli-paneer-gravy', 'chilli-potato',
          'honey-chilli-potato', 'chilli-chicken', 'veg-manchurian',
          'gobi-manchurian', 'spring-roll-veg', 'corn-cheese-balls',
          'hakka-noodles', 'schezwan-noodles', 'fried-rice-veg', 'fried-rice-chicken',
          'naan', 'butter-naan', 'garlic-naan', 'lachha-paratha',
          'missi-roti', 'kulcha', 'butter-roti', 'tandoori-roti', 'roti',
          'jeera-rice', 'pulao-veg', 'bhature', 'chole-bhature',
          'raita-boondi', 'raita-cucumber', 'papad-roasted', 'papad-fried',
          'lassi-sweet', 'chaas', 'gajar-halwa', 'rasmalai', 'rasgulla', 'gulab-jamun', 'kheer'],
  },
  rolls: {
    name: 'Roll & frankie corner', kind: 'Street',
    alias: 'roll frankie kathi wrap shawarma',
    ids: ['veg-frankie', 'paneer-frankie', 'chicken-frankie',
          'street-chicken-roll', 'street-paneer-roll'],
  },
  cafe: {
    name: 'Cafe & bakery', kind: 'Cafe',
    alias: 'cafe pasta garlic bread cold coffee fries',
    ids: ['pasta-white-sauce', 'pasta-red-sauce', 'garlic-bread-cheese',
          'cheese-fries', 'cafe-cold-coffee'],
  },
};

/* Items on one brand's menu, resolved against the food data. */
export function menuOf(id) {
  const r = RESTAURANTS[id];
  if (!r) return [];
  if (r.prefix) return FOODS.filter(f => f.id.startsWith(r.prefix));
  if (r.ids) {
    const want = new Set(r.ids);
    /* Keep the declared order — it reads like a menu rather than like a
       database dump. */
    const byId = new Map(FOODS.filter(f => want.has(f.id)).map(f => [f.id, f]));
    return r.ids.map(x => byId.get(x)).filter(Boolean);
  }
  return [];
}

export function itemCount(id) {
  const r = RESTAURANTS[id];
  if (!r) return 0;
  return r.drinks ? DRINK_LIST.length : menuOf(id).length;
}

/*
 * Match a typed query against the brands.
 *
 * The aliases carry the dish names too, so "whopper" finds Burger King and
 * "golgappa" finds the chaat counter — someone who types a dish they half
 * remember still lands somewhere useful rather than on an empty result.
 */
export function searchRestaurants(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < 2) return [];

  const scored = [];
  for (const [id, r] of Object.entries(RESTAURANTS)) {
    const name = r.name.toLowerCase();
    let score = 0;
    if (name === needle) score = 100;
    else if (name.startsWith(needle)) score = 90;
    else if (name.includes(needle)) score = 70;
    else if (id.startsWith(needle)) score = 65;
    else {
      /* Alias words match on prefix, so "mcd" finds McDonald's but "cd"
         does not — a substring test here matched almost everything. */
      const words = (r.alias || '').split(/\s+/);
      if (words.some(w => w.startsWith(needle))) score = 45;
    }
    if (score) scored.push({ id, score, ...r, count: itemCount(id) });
  }
  return scored.sort((a, b) => b.score - a.score || b.count - a.count);
}

/* Which brand a food belongs to, for labelling a search result. */
const OWNER = (() => {
  const map = new Map();
  for (const id of Object.keys(RESTAURANTS)) {
    for (const f of menuOf(id)) if (!map.has(f.id)) map.set(f.id, id);
  }
  return map;
})();

export function brandOf(foodId) {
  const id = OWNER.get(String(foodId || '').replace(/^off:|^my:|^dish:/, ''));
  return id ? { id, ...RESTAURANTS[id] } : null;
}

/*
 * Starbucks drinks are not in FOODS — they are built, not listed — so they
 * need their own pass to stay findable by name from the main search box.
 */
export function searchDrinks(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < 2) return [];
  return DRINK_LIST
    .map(d => {
      const n = d.name.toLowerCase();
      const score = n.startsWith(needle) ? 90
        : n.split(/[\s(]+/).some(w => w.startsWith(needle)) ? 70
        : n.includes(needle) ? 50 : 0;
      return { ...d, score };
    })
    .filter(d => d.score)
    .sort((a, b) => b.score - a.score);
}
