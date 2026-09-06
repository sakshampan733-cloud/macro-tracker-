/*
 * Turn the food library from code into data.
 *
 * foods.js is the source of truth and stays that way — it is easier to read
 * and to review as code, with the F() helper keeping each row on two lines
 * instead of twenty. This writes the same rows out as JSON so the app can
 * fetch them at runtime.
 *
 * The point is the update path. Baked into the bundle, adding one Indian
 * dish means a new build and a store review — call it three days to add
 * aloo kachori. Fetched, it is a push and the next time anybody opens the
 * app they have it.
 *
 * Run:  node scripts/build-foods.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { FOODS, GROUPS, FOODS_VERSION } from '../docs/js/data/foods.js';

mkdirSync(new URL('../docs/data/', import.meta.url), { recursive: true });

const payload = {
  /* Bumped by hand in foods.js when the list changes. The app compares this
     against what it has and only replaces on a genuine increase, so a
     cached copy is never overwritten by an older one. */
  version: FOODS_VERSION,
  generated: new Date().toISOString(),
  count: FOODS.length,
  groups: GROUPS,
  foods: FOODS,
};

const out = new URL('../docs/data/foods.json', import.meta.url);
writeFileSync(out, JSON.stringify(payload));

const bytes = JSON.stringify(payload).length;
console.log(`wrote docs/data/foods.json — ${FOODS.length} foods, v${FOODS_VERSION}, ${(bytes / 1024).toFixed(0)} KB`);
