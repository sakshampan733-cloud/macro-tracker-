/*
 * Micronutrients.
 *
 * A separate table, deliberately not merged into foods.js. That file's
 * calories and macros are the app's best-tested numbers; keeping this apart
 * means adding it can never disturb them, and it makes the honesty explicit
 * — a food with no row here has no micronutrient data, full stop, rather
 * than silently reading as zero of everything.
 *
 * Values are per 100 g, on the SAME basis each food already declares in
 * foods.js (raw, dry, cooked or as-served) — so a gram of this food scales
 * exactly the way its calories already do.
 *
 * Units: iron mg, B12 mcg, vitamin D mcg, calcium mg, folate mcg DFE,
 * zinc mg, magnesium mg, potassium mg, vitamin C mg, vitamin A mcg RAE.
 *
 * These are typical reference figures — the same tier of accuracy as the
 * rest of the food database, not a lab analysis of your specific carrot.
 * See What to trust in Settings.
 */

export const NUTRIENTS = {
  fe:  { label: 'Iron',       unit: 'mg',  dp: 1 },
  b12: { label: 'B12',        unit: 'µg',  dp: 1 },
  vd:  { label: 'Vitamin D',  unit: 'µg',  dp: 1 },
  ca:  { label: 'Calcium',    unit: 'mg',  dp: 0 },
  fol: { label: 'Folate',     unit: 'µg',  dp: 0 },
  zn:  { label: 'Zinc',       unit: 'mg',  dp: 1 },
  mg:  { label: 'Magnesium',  unit: 'mg',  dp: 0 },
  k:   { label: 'Potassium',  unit: 'mg',  dp: 0 },
  vc:  { label: 'Vitamin C',  unit: 'mg',  dp: 0 },
  va:  { label: 'Vitamin A',  unit: 'µg',  dp: 0 },
};

/*
 * Adult daily reference intakes (NIH Office of Dietary Supplements). Iron,
 * zinc, magnesium, potassium and vitamin A have a real sex difference —
 * menstrual iron loss alone roughly doubles the RDA — so those five read
 * the profile; the rest are close enough between sexes not to bother.
 *
 * These are general population references, not a target set for any
 * specific person's bloodwork. Treated with the same caution as everything
 * else under What to trust.
 */
export function nutrientTargets(profile) {
  const female = profile?.sex === 'female';
  return {
    fe:  female ? 18 : 8,
    b12: 2.4,
    vd:  15,
    ca:  1000,
    fol: 400,
    zn:  female ? 8 : 11,
    mg:  female ? 310 : 400,
    k:   female ? 2600 : 3400,
    vc:  female ? 75 : 90,
    va:  female ? 700 : 900,
  };
}

export const MICROS = {
  'chicken-breast-raw': { fe:0.4, b12:0.3, vd:0.1, ca:5, fol:4, zn:0.7, mg:22, k:220, vc:0, va:6 },
  'chicken-breast-ckd': { fe:0.4, b12:0.3, vd:0.1, ca:6, fol:4, zn:0.9, mg:25, k:256, vc:0, va:5 },
  'chicken-thigh-ckd': { fe:0.8, b12:0.3, vd:0.1, ca:10, fol:6, zn:1.9, mg:20, k:210, vc:0, va:30 },
  'chicken-mince-raw': { fe:0.9, b12:0.3, vd:0.1, ca:10, fol:5, zn:1.5, mg:18, k:240, vc:0, va:20 },
  'mutton-raw': { fe:1.6, b12:2.1, vd:0.1, ca:10, fol:5, zn:3.0, mg:20, k:280, vc:0, va:0 },
  'mutton-ckd': { fe:2.0, b12:2.6, vd:0.1, ca:12, fol:6, zn:3.7, mg:22, k:290, vc:0, va:0 },
  'egg-whole': { fe:1.8, b12:0.9, vd:2.0, ca:50, fol:47, zn:1.3, mg:12, k:138, vc:0, va:160 },
  'egg-white': { fe:0.1, b12:0.1, vd:0, ca:7, fol:4, zn:0.0, mg:11, k:163, vc:0, va:0 },
  'egg-yolk': { fe:2.7, b12:2.0, vd:5.4, ca:129, fol:146, zn:3.1, mg:5, k:109, vc:0, va:381 },
  'fish-rohu': { fe:0.9, b12:2.0, vd:5, ca:30, fol:10, zn:0.9, mg:25, k:300, vc:0, va:20 },
  'fish-surmai': { fe:1.0, b12:4.0, vd:8, ca:30, fol:10, zn:0.7, mg:30, k:350, vc:0, va:30 },
  'fish-salmon-ckd': { fe:0.5, b12:3.2, vd:11, ca:12, fol:26, zn:0.6, mg:29, k:384, vc:0, va:50 },
  'fish-tuna-can': { fe:1.0, b12:2.5, vd:1, ca:11, fol:2, zn:0.4, mg:27, k:250, vc:0, va:20 },
  'prawns-ckd': { fe:0.4, b12:1.4, vd:0, ca:70, fol:4, zn:1.6, mg:39, k:260, vc:0, va:30 },
  'paneer': { fe:0.2, b12:0.5, vd:0, ca:208, fol:10, zn:1.0, mg:20, k:138, vc:0, va:200 },
  'paneer-low': { fe:0.2, b12:0.5, vd:0, ca:250, fol:10, zn:1.0, mg:15, k:100, vc:0, va:50 },
  'tofu-firm': { fe:5.4, b12:0, vd:0, ca:350, fol:15, zn:0.8, mg:30, k:121, vc:0, va:0 },
  'soya-chunks-dry': { fe:20.0, b12:0, vd:0, ca:350, fol:130, zn:4.9, mg:210, k:1800, vc:0, va:1 },
  'rice-white-ckd': { fe:0.2, b12:0, vd:0, ca:10, fol:3, zn:0.4, mg:12, k:35, vc:0, va:0 },
  'rice-white-raw': { fe:0.5, b12:0, vd:0, ca:10, fol:8, zn:1.1, mg:25, k:86, vc:0, va:0 },
  'rice-basmati-ckd': { fe:0.2, b12:0, vd:0, ca:8, fol:3, zn:0.4, mg:10, k:30, vc:0, va:0 },
  'rice-brown-ckd': { fe:0.4, b12:0, vd:0, ca:10, fol:4, zn:0.6, mg:43, k:79, vc:0, va:0 },
  'roti': { fe:2.7, b12:0, vd:0, ca:20, fol:20, zn:1.4, mg:60, k:200, vc:0, va:0 },
  'phulka': { fe:2.5, b12:0, vd:0, ca:20, fol:20, zn:1.3, mg:55, k:190, vc:0, va:0 },
  'paratha-plain': { fe:2.2, b12:0, vd:0, ca:30, fol:18, zn:1.2, mg:40, k:150, vc:0, va:10 },
  'paratha-aloo': { fe:1.8, b12:0, vd:0, ca:30, fol:20, zn:1.0, mg:35, k:250, vc:5, va:5 },
  'naan': { fe:1.5, b12:0.1, vd:0, ca:50, fol:20, zn:0.8, mg:25, k:120, vc:0, va:10 },
  'tandoori-roti': { fe:2.3, b12:0, vd:0, ca:20, fol:18, zn:1.2, mg:50, k:180, vc:0, va:0 },
  'bhatura': { fe:1.5, b12:0.1, vd:0, ca:30, fol:15, zn:0.8, mg:25, k:100, vc:0, va:5 },
  'puri': { fe:1.6, b12:0, vd:0, ca:25, fol:15, zn:0.9, mg:25, k:100, vc:0, va:5 },
  'bread-white': { fe:3.6, b12:0, vd:0, ca:150, fol:100, zn:0.7, mg:25, k:115, vc:0, va:0 },
  'bread-brown': { fe:2.5, b12:0, vd:0, ca:100, fol:60, zn:1.5, mg:65, k:230, vc:0, va:0 },
  'oats-dry': { fe:4.7, b12:0, vd:0, ca:54, fol:56, zn:4.0, mg:177, k:429, vc:0, va:0 },
  'muesli': { fe:3.5, b12:0, vd:0, ca:60, fol:40, zn:2.0, mg:100, k:350, vc:5, va:0 },
  'poha-ckd': { fe:1.5, b12:0, vd:0, ca:15, fol:10, zn:0.5, mg:20, k:60, vc:5, va:20 },
  'upma': { fe:1.0, b12:0, vd:0, ca:20, fol:8, zn:0.5, mg:25, k:90, vc:5, va:30 },
  'idli': { fe:0.6, b12:0, vd:0, ca:15, fol:10, zn:0.5, mg:15, k:60, vc:0, va:0 },
  'dosa-plain': { fe:0.8, b12:0, vd:0, ca:15, fol:12, zn:0.6, mg:20, k:70, vc:0, va:0 },
  'dosa-masala': { fe:1.0, b12:0, vd:0, ca:20, fol:15, zn:0.6, mg:25, k:150, vc:8, va:30 },
  'khichdi': { fe:1.3, b12:0, vd:0, ca:20, fol:15, zn:0.7, mg:25, k:100, vc:3, va:15 },
  'dalia-ckd': { fe:1.5, b12:0, vd:0, ca:15, fol:12, zn:0.8, mg:30, k:90, vc:0, va:0 },
  'quinoa-ckd': { fe:1.5, b12:0, vd:0, ca:17, fol:42, zn:1.1, mg:64, k:172, vc:0, va:0 },
  'pasta-ckd': { fe:0.5, b12:0, vd:0, ca:7, fol:20, zn:0.5, mg:18, k:44, vc:0, va:0 },
  'pasta-dry': { fe:1.3, b12:0, vd:0, ca:20, fol:50, zn:1.2, mg:50, k:120, vc:0, va:0 },
  'bajra-roti': { fe:3.5, b12:0, vd:0, ca:25, fol:20, zn:1.5, mg:100, k:200, vc:0, va:0 },
  'jowar-roti': { fe:3.0, b12:0, vd:0, ca:25, fol:15, zn:1.3, mg:90, k:190, vc:0, va:0 },
  'ragi-flour': { fe:3.9, b12:0, vd:0, ca:344, fol:20, zn:2.3, mg:137, k:408, vc:0, va:0 },
  'dal-toor-ckd': { fe:1.5, b12:0, vd:0, ca:20, fol:30, zn:0.9, mg:25, k:200, vc:0, va:2 },
  'dal-tadka': { fe:1.6, b12:0, vd:0, ca:25, fol:28, zn:1.0, mg:25, k:210, vc:2, va:5 },
  'dal-makhani': { fe:1.8, b12:0.1, vd:0, ca:60, fol:25, zn:1.1, mg:30, k:220, vc:2, va:20 },
  'dal-moong-ckd': { fe:1.4, b12:0, vd:0, ca:25, fol:60, zn:0.8, mg:25, k:190, vc:0, va:2 },
  'dal-masoor-ckd': { fe:1.9, b12:0, vd:0, ca:15, fol:90, zn:1.0, mg:20, k:220, vc:0, va:0 },
  'rajma': { fe:2.5, b12:0, vd:0, ca:40, fol:90, zn:1.0, mg:40, k:280, vc:3, va:5 },
  'chole': { fe:2.2, b12:0, vd:0, ca:45, fol:80, zn:1.2, mg:35, k:280, vc:3, va:5 },
  'chana-boiled': { fe:2.9, b12:0, vd:0, ca:49, fol:172, zn:1.5, mg:48, k:291, vc:1, va:1 },
  'sprouts-moong': { fe:1.0, b12:0, vd:0, ca:13, fol:61, zn:0.4, mg:21, k:149, vc:13, va:2 },
  'sambar': { fe:1.0, b12:0, vd:0, ca:20, fol:15, zn:0.5, mg:20, k:150, vc:5, va:40 },
  'peanut-butter': { fe:1.9, b12:0, vd:0, ca:43, fol:87, zn:2.9, mg:168, k:649, vc:0, va:0 },
  'milk-full': { fe:0.03, b12:0.4, vd:0, ca:120, fol:5, zn:0.4, mg:12, k:150, vc:1, va:46 },
  'milk-toned': { fe:0.05, b12:0.4, vd:0, ca:125, fol:5, zn:0.4, mg:12, k:155, vc:1, va:30 },
  'milk-skim': { fe:0.05, b12:0.4, vd:0, ca:125, fol:5, zn:0.4, mg:12, k:155, vc:1, va:5 },
  'curd': { fe:0.1, b12:0.4, vd:0, ca:120, fol:5, zn:0.5, mg:12, k:150, vc:1, va:30 },
  'greek-yogurt': { fe:0.1, b12:0.7, vd:0, ca:110, fol:7, zn:0.5, mg:11, k:141, vc:0, va:5 },
  'chaas': { fe:0.1, b12:0.2, vd:0, ca:80, fol:3, zn:0.3, mg:8, k:100, vc:1, va:15 },
  'cheese-slice': { fe:0.4, b12:0.8, vd:0.2, ca:700, fol:15, zn:3.0, mg:25, k:90, vc:0, va:250 },
  'ghee': { fe:0, b12:0, vd:0.2, ca:4, fol:0, zn:0, mg:0, k:5, vc:0, va:840 },
  'butter': { fe:0.02, b12:0.1, vd:0.6, ca:24, fol:3, zn:0.1, mg:2, k:24, vc:0, va:684 },
  'palak-paneer': { fe:2.0, b12:0.2, vd:0, ca:200, fol:60, zn:1.0, mg:40, k:350, vc:15, va:400 },
  'paneer-bhurji': { fe:0.6, b12:0.3, vd:0, ca:180, fol:20, zn:1.2, mg:25, k:180, vc:5, va:150 },
  'paneer-tikka': { fe:0.5, b12:0.3, vd:0, ca:180, fol:15, zn:1.2, mg:25, k:200, vc:8, va:100 },
  'butter-chicken': { fe:0.8, b12:0.5, vd:0.1, ca:60, fol:8, zn:1.2, mg:20, k:250, vc:3, va:100 },
  'chicken-curry': { fe:0.9, b12:0.4, vd:0.1, ca:30, fol:10, zn:1.3, mg:22, k:260, vc:3, va:60 },
  'tandoori-chicken': { fe:0.7, b12:0.4, vd:0.1, ca:20, fol:6, zn:1.5, mg:25, k:280, vc:2, va:30 },
  'chicken-biryani': { fe:1.0, b12:0.3, vd:0, ca:25, fol:15, zn:0.9, mg:25, k:180, vc:2, va:20 },
  'egg-bhurji': { fe:1.6, b12:0.7, vd:1.5, ca:45, fol:30, zn:1.0, mg:12, k:130, vc:3, va:120 },
  'omelette-2egg': { fe:1.7, b12:0.8, vd:1.8, ca:45, fol:40, zn:1.2, mg:11, k:130, vc:0, va:140 },
  'aloo-gobi': { fe:0.9, b12:0, vd:0, ca:30, fol:40, zn:0.5, mg:20, k:350, vc:25, va:15 },
  'bhindi-masala': { fe:0.8, b12:0, vd:0, ca:60, fol:45, zn:0.6, mg:45, k:280, vc:15, va:30 },
  'mixed-veg': { fe:0.8, b12:0, vd:0, ca:40, fol:40, zn:0.5, mg:25, k:300, vc:20, va:300 },
  'salad-kachumber': { fe:0.4, b12:0, vd:0, ca:15, fol:25, zn:0.3, mg:12, k:200, vc:10, va:20 },
  'potato-boiled': { fe:0.3, b12:0, vd:0, ca:8, fol:9, zn:0.3, mg:20, k:379, vc:8, va:0 },
  'sweet-potato': { fe:0.6, b12:0, vd:0, ca:27, fol:6, zn:0.3, mg:20, k:337, vc:20, va:700 },
  'spinach-raw': { fe:2.7, b12:0, vd:0, ca:99, fol:194, zn:0.5, mg:79, k:558, vc:28, va:469 },
  'broccoli-ckd': { fe:0.7, b12:0, vd:0, ca:40, fol:108, zn:0.4, mg:21, k:293, vc:65, va:31 },
  'cauliflower-raw': { fe:0.4, b12:0, vd:0, ca:22, fol:57, zn:0.3, mg:15, k:299, vc:48, va:0 },
  'tomato': { fe:0.3, b12:0, vd:0, ca:10, fol:15, zn:0.2, mg:11, k:237, vc:14, va:42 },
  'onion': { fe:0.2, b12:0, vd:0, ca:23, fol:19, zn:0.2, mg:10, k:146, vc:7, va:0 },
  'cucumber': { fe:0.3, b12:0, vd:0, ca:16, fol:7, zn:0.2, mg:13, k:147, vc:3, va:5 },
  'mushroom-raw': { fe:0.5, b12:0, vd:0.2, ca:3, fol:17, zn:0.5, mg:9, k:318, vc:2, va:0 },
  'bell-pepper': { fe:0.4, b12:0, vd:0, ca:7, fol:46, zn:0.3, mg:12, k:211, vc:128, va:18 },
  'banana': { fe:0.3, b12:0, vd:0, ca:5, fol:20, zn:0.2, mg:27, k:358, vc:9, va:3 },
  'apple': { fe:0.1, b12:0, vd:0, ca:6, fol:3, zn:0.0, mg:5, k:107, vc:5, va:3 },
  'mango': { fe:0.2, b12:0, vd:0, ca:11, fol:43, zn:0.1, mg:10, k:168, vc:36, va:54 },
  'papaya': { fe:0.3, b12:0, vd:0, ca:20, fol:37, zn:0.1, mg:21, k:182, vc:61, va:47 },
  'guava': { fe:0.3, b12:0, vd:0, ca:18, fol:49, zn:0.2, mg:22, k:417, vc:228, va:31 },
  'orange': { fe:0.1, b12:0, vd:0, ca:40, fol:30, zn:0.1, mg:10, k:181, vc:53, va:11 },
  'pomegranate': { fe:0.3, b12:0, vd:0, ca:10, fol:38, zn:0.4, mg:12, k:236, vc:10, va:0 },
  'watermelon': { fe:0.2, b12:0, vd:0, ca:7, fol:3, zn:0.1, mg:10, k:112, vc:8, va:28 },
  'grapes': { fe:0.4, b12:0, vd:0, ca:10, fol:2, zn:0.1, mg:7, k:191, vc:4, va:3 },
  'dates': { fe:0.9, b12:0, vd:0, ca:39, fol:15, zn:0.4, mg:43, k:656, vc:0, va:0 },
  'avocado': { fe:0.6, b12:0, vd:0, ca:12, fol:81, zn:0.6, mg:29, k:485, vc:10, va:7 },
  'almonds': { fe:3.7, b12:0, vd:0, ca:269, fol:44, zn:3.1, mg:270, k:733, vc:0, va:0 },
  'cashew': { fe:6.7, b12:0, vd:0, ca:37, fol:25, zn:5.8, mg:292, k:660, vc:0, va:0 },
  'walnut': { fe:2.9, b12:0, vd:0, ca:98, fol:98, zn:3.1, mg:158, k:441, vc:1, va:1 },
  'peanuts-roast': { fe:2.3, b12:0, vd:0, ca:54, fol:145, zn:3.3, mg:176, k:705, vc:0, va:0 },
  'pista': { fe:3.9, b12:0, vd:0, ca:105, fol:51, zn:2.2, mg:121, k:1025, vc:5, va:8 },
  'chia': { fe:7.7, b12:0, vd:0, ca:631, fol:49, zn:4.6, mg:335, k:407, vc:1.6, va:1 },
  'flax': { fe:5.7, b12:0, vd:0, ca:255, fol:87, zn:4.3, mg:392, k:813, vc:0.6, va:0 },
  'oil-generic': { fe:0, b12:0, vd:0, ca:0, fol:0, zn:0, mg:0, k:0, vc:0, va:0 },
  'olive-oil': { fe:0.6, b12:0, vd:0, ca:1, fol:0, zn:0, mg:0, k:1, vc:0, va:0 },
  'samosa': { fe:1.2, b12:0, vd:0, ca:25, fol:15, zn:0.6, mg:20, k:200, vc:3, va:10 },
  'pakora': { fe:1.5, b12:0, vd:0, ca:30, fol:20, zn:0.7, mg:25, k:220, vc:5, va:15 },
  'dhokla': { fe:1.0, b12:0, vd:0, ca:30, fol:25, zn:0.6, mg:20, k:150, vc:2, va:5 },
  'momos-veg': { fe:0.8, b12:0, vd:0, ca:20, fol:15, zn:0.5, mg:15, k:120, vc:5, va:10 },
  'bhel-puri': { fe:1.2, b12:0, vd:0, ca:30, fol:20, zn:0.6, mg:25, k:220, vc:5, va:10 },
  'vada-pav': { fe:1.3, b12:0, vd:0, ca:30, fol:20, zn:0.6, mg:25, k:250, vc:5, va:5 },
  'gulab-jamun': { fe:0.3, b12:0.1, vd:0, ca:60, fol:3, zn:0.2, mg:10, k:80, vc:0, va:20 },
  'rasgulla': { fe:0.1, b12:0.1, vd:0, ca:50, fol:3, zn:0.2, mg:8, k:60, vc:0, va:10 },
  'jalebi': { fe:0.3, b12:0, vd:0, ca:20, fol:3, zn:0.1, mg:5, k:40, vc:0, va:0 },
  'kheer': { fe:0.1, b12:0.1, vd:0, ca:90, fol:4, zn:0.3, mg:10, k:120, vc:0, va:30 },
  'dark-choc-70': { fe:11.9, b12:0, vd:0, ca:73, fol:14, zn:3.3, mg:228, k:715, vc:0, va:3 },
  'chai-sugar': { fe:0.1, b12:0.1, vd:0, ca:40, fol:2, zn:0.2, mg:6, k:60, vc:0, va:10 },
  'chai-nosugar': { fe:0.1, b12:0.1, vd:0, ca:40, fol:2, zn:0.2, mg:6, k:60, vc:0, va:10 },
  'coffee-black': { fe:0.01, b12:0, vd:0, ca:2, fol:1, zn:0.02, mg:3, k:49, vc:0, va:0 },
  'coffee-milk': { fe:0.05, b12:0.1, vd:0, ca:35, fol:2, zn:0.2, mg:6, k:70, vc:0, va:10 },
  'coconut-water': { fe:0.3, b12:0, vd:0, ca:24, fol:3, zn:0.1, mg:25, k:250, vc:2, va:0 },
  'cola': { fe:0, b12:0, vd:0, ca:4, fol:0, zn:0, mg:1, k:1, vc:0, va:0 },
  'beer': { fe:0.02, b12:0, vd:0, ca:4, fol:6, zn:0.02, mg:6, k:27, vc:0, va:0 },
  'whisky': { fe:0, b12:0, vd:0, ca:0, fol:0, zn:0, mg:0, k:1, vc:0, va:0 },
  'wine-red': { fe:0.5, b12:0, vd:0, ca:8, fol:2, zn:0.1, mg:10, k:92, vc:0, va:0 },
  'whey-conc': { fe:0.5, b12:0.5, vd:0, ca:400, fol:10, zn:2.0, mg:60, k:400, vc:0, va:0 },
  'whey-isolate': { fe:0.3, b12:0.5, vd:0, ca:150, fol:5, zn:1.0, mg:20, k:200, vc:0, va:0 },
  'casein': { fe:0.3, b12:0.4, vd:0, ca:700, fol:8, zn:2.0, mg:30, k:300, vc:0, va:0 },
  'mass-gainer': { fe:5.0, b12:1.0, vd:2, ca:300, fol:100, zn:5.0, mg:100, k:400, vc:20, va:200 },
  'creatine': { fe:0, b12:0, vd:0, ca:0, fol:0, zn:0, mg:0, k:0, vc:0, va:0 },
  'electrolyte': { fe:0, b12:0, vd:0, ca:20, fol:0, zn:0, mg:20, k:200, vc:0, va:0 },
};