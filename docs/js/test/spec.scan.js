/*
 * Reading a barcode packet.
 *
 * Open Food Facts is contributor-typed and inconsistent by nature: some
 * products carry only per-100 g, some only per-serving, some only kilojoules,
 * some nothing at all. Every case below is one this app hit for real, and
 * the one that matters most is the last: a food with no energy figure must
 * never log as free.
 */

import { describe, it, eq, near, ok, notOk, isNull } from './harness.js';
import { normalizeOFF } from '../off.js';

const wrap = (nutriments, extra = {}) => normalizeOFF(
  { product_name: 'Test biscuit', nutriments, ...extra }, '1234567890123');

describe('Per-100 g products', () => {
  it('reads the panel straight through', () => {
    const f = wrap({
      'energy-kcal_100g': 480, 'proteins_100g': 7, 'carbohydrates_100g': 62,
      'fat_100g': 22, 'fiber_100g': 3, 'sodium_100g': 0.4,
    });
    eq(f.per100.kcal, 480);
    eq(f.per100.p, 7);
    eq(f.per100.na, 400, 'OFF stores sodium in grams; the app wants mg');
    ok(f.complete);
    ok(f.hasMacros);
  });

  it('converts kilojoules when kcal is absent', () => {
    /* 2000 kJ / 4.184 = 478.0 kcal */
    const f = wrap({ 'energy_100g': 2000 });
    near(f.per100.kcal, 478, 0.5);
    ok(f.complete);
  });
});

describe('Per-serving-only products', () => {
  /* The bug that made scanned Indian and US packets log as 0 kcal: the
     panel was complete, just expressed per biscuit. */
  it('derives per-100 g when the serving weight is known', () => {
    const f = wrap(
      { 'energy-kcal_serving': 120, 'proteins_serving': 1.75, 'carbohydrates_serving': 15.5 },
      { serving_quantity: 25 });
    /* 120 kcal per 25 g = 480 per 100 g */
    near(f.per100.kcal, 480, 0.5);
    near(f.per100.p, 7, 0.1);
    ok(f.complete, 'a per-serving panel is a complete panel');
  });

  it('reads the serving weight out of the label when the field is missing', () => {
    const f = wrap(
      { 'energy-kcal_serving': 120 },
      { serving_size: '25 g (1 biscuit)' });
    near(f.per100.kcal, 480, 0.5);
  });

  it('refuses to guess when the serving weight is unknown', () => {
    /* Without a weight there is nothing to divide by, and inventing one
       would be worse than reporting nothing. */
    const f = wrap({ 'energy-kcal_serving': 120 });
    isNull(f.per100.kcal);
    notOk(f.complete);
  });

  it('prefers the per-100 g figure when both are present', () => {
    const f = wrap(
      { 'energy-kcal_100g': 500, 'energy-kcal_serving': 120 },
      { serving_quantity: 25 });
    eq(f.per100.kcal, 500);
  });
});

describe('Products with nothing usable', () => {
  it('is marked incomplete rather than zero', () => {
    /* This is the one that matters. A food that logs at 0 kcal moves the
       day's total, teaches adaptiveTDEE from a meal that never happened,
       and looks exactly like a food you were allowed to eat for free. */
    const f = wrap({});
    isNull(f.per100.kcal);
    notOk(f.complete, 'callers must check this before logging');
  });

  it('still returns a usable record, so the app can offer to fill it in', () => {
    const f = wrap({});
    ok(f.id.startsWith('off:'));
    ok(f.n, 'has a name to show');
    ok(Array.isArray(f.missing) || f.missing === undefined);
  });

  it('names the product even when OFF has no name', () => {
    const f = normalizeOFF({ nutriments: {} }, '999');
    ok(f.n.length > 0);
  });
});

describe('Macros present but energy absent', () => {
  it('counts as incomplete, because energy is the field nothing works around', () => {
    const f = wrap({ 'proteins_100g': 7, 'carbohydrates_100g': 62, 'fat_100g': 22 });
    ok(f.hasMacros);
    notOk(f.complete, 'macros without kcal is still not loggable');
  });
});

describe('Serving sizes offered', () => {
  it('offers the serving and the whole pack when they differ', () => {
    const f = wrap({ 'energy-kcal_100g': 480 },
                   { serving_quantity: 25, quantity: '200 g' });
    eq(f.serv.length, 2);
    eq(f.serv[0].g, 25);
    eq(f.serv[1].g, 200);
  });

  it('does not offer the pack twice when it is a single serving', () => {
    const f = wrap({ 'energy-kcal_100g': 480 },
                   { serving_quantity: 200, quantity: '200 g' });
    eq(f.serv.length, 1);
  });

  it('reads kilograms and litres as grams and millilitres', () => {
    const f = wrap({ 'energy-kcal_100g': 60 }, { quantity: '1.5 l' });
    eq(f.serv[0].g, 1500);
  });
});
