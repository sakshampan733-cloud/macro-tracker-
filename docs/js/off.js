/*
 * Barcode resolution.
 *
 * The app runs in two places: served by the Python helper on the Mac, and
 * as a static page on GitHub Pages with no server behind it at all. Both
 * have to work, so lookups take the best route available.
 *
 * Order: your own library first — you may have corrected a label yourself —
 * then the local cache, then the Mac's proxy if it is reachable, and
 * finally Open Food Facts direct from the browser. OFF sends
 * `access-control-allow-origin: *`, which is what makes the serverless path
 * possible; without it a proxy would be mandatory.
 *
 * Every successful lookup is cached on the device, so the second scan of a
 * product never needs any of this.
 */

import { get, cacheFood } from './store.js';

const OFF = 'https://world.openfoodfacts.org';
const FIELDS = [
  'code', 'product_name', 'product_name_en', 'generic_name', 'brands',
  'quantity', 'serving_size', 'serving_quantity', 'nutriments',
  'image_front_small_url', 'nova_group',
].join(',');

/* Relative, deliberately. Under the Mac server the app sits at the root so
   this resolves to /api/…; on Pages it resolves inside the project path and
   404s, which is exactly the signal we want. */
const api = path => `api/${path}`;

let serverKnown = null;

export async function haveServer() {
  if (serverKnown !== null) return serverKnown;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1800);
    const r = await fetch(api('health'), { signal: ctl.signal });
    clearTimeout(t);
    serverKnown = r.ok && (r.headers.get('content-type') || '').includes('json');
  } catch {
    serverKnown = false;
  }
  return serverKnown;
}

/* Let the UI say which mode it is in without probing again. */
export function serverMode() { return serverKnown; }

const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/*
 * Flatten an Open Food Facts product into the app's shape.
 * Mirrors the server's version so both routes produce identical records.
 */
export function normalizeOFF(product, code) {
  const n = product.nutriments || {};

  const name = (product.product_name || product.product_name_en
             || product.generic_name || '').trim();

  let servingG = num(product.serving_quantity);
  const servingLabel = (product.serving_size || '').trim();
  if (servingG == null && servingLabel) {
    const m = servingLabel.match(/([\d.]+)\s*(g|ml)/i);
    if (m) servingG = num(m[1]);
  }

  /*
   * Per-serving is a legitimate second source, not a last resort.
   *
   * Plenty of products — US and Indian ones especially — carry only the
   * `_serving` block, because that is what their label prints. The panel
   * is complete, it is simply expressed per biscuit rather than per
   * hundred grams, and OFF hands it over exactly as the contributor typed
   * it. Reading only `_100g` treated all of those as having no nutrition
   * at all, and a scan of a perfectly well-documented packet logged zero.
   *
   * The conversion is only safe when the serving weight is known, so the
   * scale is a real number rather than an assumption about what "1 bar"
   * weighs. Without it there is nothing to divide by and the field stays
   * null, which is the honest answer.
   */
  const per = servingG > 0 ? 100 / servingG : null;
  const pick = (base, unit100, unitServ) => {
    const direct = num(n[unit100 || base + '_100g']);
    if (direct != null) return direct;
    if (per == null) return null;
    const s = num(n[unitServ || base + '_serving']);
    return s == null ? null : Math.round(s * per * 100) / 100;
  };

  let kcal = pick(null, 'energy-kcal_100g', 'energy-kcal_serving');
  if (kcal == null) {
    const kj = pick(null, 'energy_100g', 'energy_serving')
            ?? pick(null, 'energy-kj_100g', 'energy-kj_serving');
    if (kj != null) kcal = Math.round((kj / 4.184) * 10) / 10;
  }

  const sodium = pick('sodium');
  const per100 = {
    kcal,
    p: pick('proteins'),
    c: pick('carbohydrates'),
    f: pick('fat'),
    fib: pick('fiber'),
    sug: pick('sugars'),
    sat: pick(null, 'saturated-fat_100g', 'saturated-fat_serving'),
    na: sodium != null ? Math.round(sodium * 1000) : null,   // OFF stores grams
  };

  let packG = null;
  const q = (product.quantity || '').trim();
  if (q) {
    const m = q.match(/([\d.]+)\s*(kg|g|ml|l)\b/i);
    if (m) {
      const v = num(m[1]), unit = m[2].toLowerCase();
      if (v != null) packG = (unit === 'kg' || unit === 'l') ? v * 1000 : v;
    }
  }

  const serv = [];
  if (servingG) serv.push({ l: servingLabel || `1 serving (${servingG} g)`, g: servingG });
  if (packG && (!servingG || Math.abs(packG - servingG) > 1)) {
    serv.push({ l: `whole pack (${q})`, g: packG });
  }

  return {
    id: 'off:' + code,
    barcode: code,
    n: name || `Unknown product ${code}`,
    brand: (product.brands || '').split(',')[0].trim(),
    per100,
    serv,
    img: product.image_front_small_url,
    nova: product.nova_group,
    src: 'openfoodfacts',
    /*
     * Energy is the one field the app cannot work around. A missing
     * protein figure costs you one number in a breakdown; a missing kcal
     * silently logs the food as free, moves the day's total, and teaches
     * adaptiveTDEE from a figure that never happened. So `complete` turns
     * on kcal alone, and callers are expected to check it before logging.
     */
    complete: per100.kcal != null,
    hasMacros: per100.p != null && per100.c != null && per100.f != null,
    /* Which fields the panel actually carried, so the builder can say what
       it is asking you to fill in rather than presenting a blank form. */
    missing: ['kcal', 'p', 'c', 'f'].filter(k => per100[k] == null),
  };
}

async function offDirect(code) {
  const r = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (!r.ok) throw new Error(`Open Food Facts returned ${r.status}`);
  const raw = await r.json();
  if (raw.status !== 1 || !raw.product) return { found: false, barcode: code };
  const food = normalizeOFF(raw.product, code);
  food.found = true;
  return food;
}

export async function resolveBarcode(code) {
  const s = get();

  const mine = Object.values(s.library).find(f => f.barcode === code);
  if (mine) return { ...mine, found: true, from: 'library' };

  if (s.cache[code]) return { ...s.cache[code], found: true, from: 'cache' };

  if (await haveServer()) {
    try {
      const food = await (await fetch(api(`product/${encodeURIComponent(code)}`))).json();
      if (food.found) {
        food.from = food.cached ? 'cache' : 'openfoodfacts';
        cacheFood(food);
      }
      return food;
    } catch { /* fall through to the direct route */ }
  }

  try {
    const food = await offDirect(code);
    if (food.found) { food.from = 'openfoodfacts'; cacheFood(food); }
    return food;
  } catch (e) {
    return { found: false, offline: true, barcode: code, error: String(e) };
  }
}

export async function searchProducts(q, { indiaOnly = true, page = 1 } = {}) {
  if (await haveServer()) {
    try {
      const params = new URLSearchParams({ q, page: String(page) });
      if (!indiaOnly) params.set('all', '1');
      return await (await fetch(`${api('search')}?${params}`)).json();
    } catch { /* fall through */ }
  }

  const params = new URLSearchParams({
    search_terms: q,
    page_size: '24',
    page: String(page),
    fields: FIELDS,
  });
  if (indiaOnly) params.set('countries_tags_en', 'india');

  try {
    const r = await fetch(`${OFF}/api/v2/search?${params}`);
    if (!r.ok) throw new Error(`search returned ${r.status}`);
    const raw = await r.json();
    const products = (raw.products || [])
      .map(p => normalizeOFF(p, p.code || ''))
      .filter(f => f.complete);
    products.forEach(f => { if (f.barcode) cacheFood({ ...f, found: true }); });
    return { products, count: raw.count ?? products.length };
  } catch (e) {
    return { products: [], offline: true, error: String(e) };
  }
}

/*
 * EAN-13 check digit. Catches a mistyped or misread barcode before it turns
 * into a fruitless lookup.
 */
export function validEAN(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

export const isIndian = code => /^890/.test(code);
