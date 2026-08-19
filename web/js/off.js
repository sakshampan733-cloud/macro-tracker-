/*
 * Barcode resolution.
 *
 * Order matters: your own library beats a public database every time,
 * because you may have corrected the label yourself. Then the local cache,
 * then Open Food Facts through the server proxy.
 */

import { get, cacheFood } from './store.js';

export async function resolveBarcode(code) {
  const s = get();

  const mine = Object.values(s.library).find(f => f.barcode === code);
  if (mine) return { ...mine, found: true, from: 'library' };

  if (s.cache[code]) return { ...s.cache[code], found: true, from: 'cache' };

  try {
    const r = await fetch(`/api/product/${encodeURIComponent(code)}`);
    const food = await r.json();
    if (food.found) {
      food.from = food.cached ? 'cache' : 'openfoodfacts';
      cacheFood(food);
    }
    return food;
  } catch (e) {
    return { found: false, offline: true, barcode: code, error: String(e) };
  }
}

export async function searchProducts(q, { indiaOnly = true, page = 1 } = {}) {
  const params = new URLSearchParams({ q, page: String(page) });
  if (!indiaOnly) params.set('all', '1');
  try {
    const r = await fetch(`/api/search?${params}`);
    return await r.json();
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
