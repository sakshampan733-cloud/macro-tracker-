/*
 * Reference food database.
 *
 * Every row is per 100 g of the food IN THE STATE NAMED BY `basis`:
 *   raw        weighed uncooked (meat, dry grains before water)
 *   dry        as sold, dry (oats, flour, pasta, whey)
 *   cooked     weighed after cooking, water absorbed
 *   as-served  a composite dish as it reaches the plate
 *
 * Getting this wrong is the single largest error source in macro tracking:
 * 100 g of dry rice is 360 kcal, 100 g of the same rice cooked is 130.
 * The app never silently converts between bases — it makes you pick.
 *
 * kcal p c f fib sug sat  grams per 100 g   na = sodium in mg per 100 g
 * grade  A = weighed lab reference (IFCT/USDA)   B = label/brand data
 *        C = composite dish, recipe-dependent    D = street/restaurant, high variance
 */

export const GROUPS = [
  'Protein', 'Grains', 'Legumes', 'Dairy & Egg', 'Vegetables',
  'Fruit', 'Fats & Nuts', 'Prepared', 'Snacks & Sweets', 'Drinks', 'Supplements',
];

const F = (id, n, grp, diet, basis, grade, kcal, p, c, f, fib, sug, sat, na, serv, alt) =>
  ({ id, n, alt: alt || '', grp, diet, basis, grade,
     per100: { kcal, p, c, f, fib, sug, sat, na }, serv: serv || [] });

export const FOODS = [

  /* ── Protein: meat, fish, eggs ─────────────────────────────────────── */
  F('chicken-breast-raw','Chicken breast, skinless','Protein','meat','raw','A',
    120,22.5,0,3.1,0,0,0.9,63,[['100 g raw',100],['1 breast (~150 g)',150]]),
  F('chicken-breast-ckd','Chicken breast, skinless, cooked','Protein','meat','cooked','A',
    165,31,0,3.6,0,0,1.0,74,[['100 g cooked',100],['1 breast (~110 g)',110]]),
  F('chicken-thigh-ckd','Chicken thigh, skinless, cooked','Protein','meat','cooked','A',
    209,26,0,10.9,0,0,3.0,88,[['1 thigh (~75 g)',75]]),
  F('chicken-mince-raw','Chicken mince (keema)','Protein','meat','raw','A',
    143,17.4,0,8.1,0,0,2.3,70,[['100 g raw',100]]),
  F('mutton-raw','Mutton / goat, lean','Protein','meat','raw','A',
    109,20.6,0,2.3,0,0,0.7,82,[['100 g raw',100]]),
  F('mutton-ckd','Mutton curry cut, cooked','Protein','meat','cooked','A',
    215,26.5,0,11.4,0,0,3.7,95,[['100 g cooked',100]]),
  F('egg-whole','Egg, whole','Dairy & Egg','egg','raw','A',
    155,12.6,1.1,10.6,0,1.1,3.3,124,[['1 large egg (50 g)',50],['1 small egg (44 g)',44]]),
  F('egg-white','Egg white','Dairy & Egg','egg','raw','A',
    52,10.9,0.7,0.2,0,0.7,0,166,[['1 white (33 g)',33]]),
  F('egg-yolk','Egg yolk','Dairy & Egg','egg','raw','A',
    322,15.9,3.6,26.5,0,0.6,9.6,48,[['1 yolk (17 g)',17]]),
  F('fish-rohu','Rohu, cooked','Protein','meat','cooked','A',
    145,16.6,0,8.2,0,0,2.2,68,[['1 piece (~90 g)',90]]),
  F('fish-surmai','Surmai / kingfish, cooked','Protein','meat','cooked','A',
    134,21.9,0,4.6,0,0,1.0,88,[['1 steak (~110 g)',110]]),
  F('fish-salmon-ckd','Salmon, cooked','Protein','meat','cooked','A',
    206,22.1,0,12.4,0,0,2.5,61,[['1 fillet (~120 g)',120]]),
  F('fish-tuna-can','Tuna, canned in water, drained','Protein','meat','as-served','B',
    116,25.5,0,0.8,0,0,0.2,320,[['1 can drained (~95 g)',95]]),
  F('prawns-ckd','Prawns, cooked','Protein','meat','cooked','A',
    99,24,0.2,0.3,0,0,0.1,111,[['100 g cooked',100]]),
  F('paneer','Paneer, full fat','Dairy & Egg','veg','as-served','A',
    296,18.3,3.4,23.6,0,2.6,14.8,18,[['1 cube (~15 g)',15],['100 g',100]]),
  F('paneer-low','Paneer, low fat / cottage','Dairy & Egg','veg','as-served','B',
    178,22.5,4.2,7.8,0,3.1,4.9,24,[['100 g',100]]),
  F('tofu-firm','Tofu, firm','Protein','veg','as-served','A',
    144,15.8,4.3,8.7,2.3,0.6,1.3,14,[['100 g',100]]),
  F('soya-chunks-dry','Soya chunks, dry','Protein','veg','dry','A',
    345,52,33,0.5,13,0,0.1,2,[['30 g dry',30]]),

  /* ── Grains, breads, cereals ───────────────────────────────────────── */
  F('rice-white-ckd','White rice, cooked','Grains','veg','cooked','A',
    130,2.7,28.2,0.3,0.4,0.1,0.1,1,[['1 katori (150 g)',150],['1 cup (185 g)',185]]),
  F('rice-white-raw','White rice, dry','Grains','veg','dry','A',
    360,6.8,78.2,0.5,1.3,0.1,0.1,5,[['50 g dry',50],['1 cup dry (185 g)',185]]),
  F('rice-basmati-ckd','Basmati rice, cooked','Grains','veg','cooked','A',
    121,3.5,25.2,0.4,0.7,0.1,0.1,1,[['1 katori (150 g)',150]]),
  F('rice-brown-ckd','Brown rice, cooked','Grains','veg','cooked','A',
    123,2.7,25.6,1.0,1.8,0.4,0.2,4,[['1 katori (150 g)',150]]),
  F('roti','Roti / chapati, whole wheat','Grains','veg','cooked','B',
    297,11.0,54.0,4.3,6.5,1.2,0.9,190,[['1 medium (40 g)',40],['1 large (55 g)',55]]),
  F('phulka','Phulka, no oil','Grains','veg','cooked','B',
    280,10.6,55.4,1.7,6.8,1.1,0.3,180,[['1 phulka (35 g)',35]]),
  F('paratha-plain','Paratha, plain','Grains','veg','cooked','C',
    330,7.5,45.0,13.5,4.8,1.3,5.4,290,[['1 paratha (70 g)',70]]),
  F('paratha-aloo','Aloo paratha','Prepared','veg','as-served','C',
    265,5.5,36.0,11.0,3.9,1.6,4.4,380,[['1 paratha (100 g)',100]]),
  F('naan','Naan','Grains','veg','cooked','C',
    310,8.9,52.0,7.0,2.3,3.5,2.4,420,[['1 naan (90 g)',90]]),
  F('tandoori-roti','Tandoori roti','Grains','veg','cooked','C',
    290,9.8,55.0,3.5,5.6,1.4,0.8,300,[['1 roti (60 g)',60]]),
  F('bhatura','Bhatura','Grains','veg','cooked','D',
    350,7.8,45.0,16.0,2.4,2.2,6.8,340,[['1 bhatura (80 g)',80]]),
  F('puri','Puri','Grains','veg','cooked','D',
    385,7.0,44.0,20.0,2.8,1.0,8.5,250,[['1 puri (25 g)',25]]),
  F('bread-white','White bread','Grains','veg','as-served','B',
    265,9.0,49.0,3.2,2.7,5.0,0.7,490,[['1 slice (27 g)',27]]),
  F('bread-brown','Brown / whole wheat bread','Grains','veg','as-served','B',
    247,10.5,44.0,3.4,6.0,4.3,0.7,455,[['1 slice (30 g)',30]]),
  F('oats-dry','Rolled oats, dry','Grains','veg','dry','A',
    389,16.9,66.3,6.9,10.6,0.0,1.2,2,[['40 g (½ cup)',40],['1 cup (80 g)',80]]),
  F('muesli','Muesli, no added sugar','Grains','veg','dry','B',
    367,10.1,66.0,6.0,7.6,15.0,1.1,25,[['50 g',50]]),
  F('poha-ckd','Poha, cooked','Prepared','veg','as-served','C',
    145,2.6,26.0,3.6,1.2,1.4,0.6,320,[['1 plate (200 g)',200]]),
  F('upma','Upma','Prepared','veg','as-served','C',
    165,3.8,24.0,6.0,1.9,1.0,1.6,380,[['1 plate (200 g)',200]]),
  F('idli','Idli','Prepared','veg','as-served','B',
    130,4.5,26.0,0.6,1.4,0.3,0.1,220,[['1 idli (40 g)',40],['2 idli',80]]),
  F('dosa-plain','Dosa, plain','Prepared','veg','as-served','C',
    168,4.0,28.0,4.5,1.5,0.4,1.6,300,[['1 dosa (80 g)',80]]),
  F('dosa-masala','Masala dosa','Prepared','veg','as-served','D',
    190,4.0,29.0,6.5,2.3,1.1,2.4,420,[['1 dosa (150 g)',150]]),
  F('khichdi','Khichdi','Prepared','veg','as-served','C',
    130,4.5,21.0,3.0,2.2,0.6,1.1,340,[['1 katori (180 g)',180]]),
  F('dalia-ckd','Dalia / broken wheat, cooked','Grains','veg','cooked','A',
    120,3.5,24.0,0.7,3.2,0.3,0.1,5,[['1 katori (150 g)',150]]),
  F('quinoa-ckd','Quinoa, cooked','Grains','veg','cooked','A',
    120,4.4,21.3,1.9,2.8,0.9,0.2,7,[['1 katori (150 g)',150]]),
  F('pasta-ckd','Pasta, cooked','Grains','veg','cooked','A',
    131,5.1,24.9,1.1,1.8,0.6,0.2,6,[['1 bowl (200 g)',200]]),
  F('pasta-dry','Pasta, dry','Grains','veg','dry','A',
    371,13.0,74.7,1.5,3.2,2.7,0.3,6,[['80 g dry',80]]),
  F('bajra-roti','Bajra roti','Grains','veg','cooked','B',
    310,11.0,61.0,5.0,11.3,1.0,1.1,180,[['1 roti (50 g)',50]]),
  F('jowar-roti','Jowar roti','Grains','veg','cooked','B',
    300,10.0,62.0,3.5,9.7,1.0,0.6,175,[['1 roti (50 g)',50]]),
  F('ragi-flour','Ragi flour','Grains','veg','dry','A',
    328,7.3,72.0,1.3,11.2,0.5,0.3,11,[['30 g',30]]),

  /* ── Legumes & dals ────────────────────────────────────────────────── */
  F('dal-toor-ckd','Toor dal, cooked plain','Legumes','veg','cooked','A',
    116,6.3,15.4,3.2,3.9,0.9,1.3,220,[['1 katori (150 g)',150]]),
  F('dal-tadka','Dal tadka','Prepared','veg','as-served','C',
    132,6.0,15.2,5.2,3.7,1.1,2.1,410,[['1 katori (150 g)',150]]),
  F('dal-makhani','Dal makhani','Prepared','veg','as-served','D',
    190,7.0,16.0,11.0,5.1,1.8,5.8,470,[['1 katori (150 g)',150]]),
  F('dal-moong-ckd','Yellow moong dal, cooked','Legumes','veg','cooked','A',
    105,6.5,15.0,2.0,3.4,0.8,0.6,200,[['1 katori (150 g)',150]]),
  F('dal-masoor-ckd','Masoor dal, cooked','Legumes','veg','cooked','A',
    110,7.2,16.0,2.0,4.1,0.7,0.4,205,[['1 katori (150 g)',150]]),
  F('rajma','Rajma masala','Prepared','veg','as-served','C',
    140,7.0,18.0,4.5,6.2,1.9,1.4,450,[['1 katori (150 g)',150]]),
  F('chole','Chole / chana masala','Prepared','veg','as-served','C',
    155,7.5,20.0,5.5,6.8,2.6,1.3,510,[['1 katori (150 g)',150]]),
  F('chana-boiled','Kala chana, boiled','Legumes','veg','cooked','A',
    164,8.9,27.4,2.6,7.6,4.8,0.3,7,[['1 katori (140 g)',140]]),
  F('sprouts-moong','Moong, sprouted (germinated whole)','Legumes','veg','raw','A',
    108,8.0,19.7,0.4,5.3,2.0,0.1,6,[['1 katori (100 g)',100]]),
  F('sambar','Sambar','Prepared','veg','as-served','C',
    85,3.8,11.0,3.0,2.9,1.6,0.9,430,[['1 katori (150 g)',150]]),
  F('peanut-butter','Peanut butter, natural','Fats & Nuts','veg','as-served','B',
    588,25.1,19.6,50.4,6.0,9.2,10.3,17,[['1 tbsp (16 g)',16],['2 tbsp (32 g)',32]]),

  /* ── Dairy ─────────────────────────────────────────────────────────── */
  F('milk-full','Milk, full cream','Dairy & Egg','veg','as-served','B',
    67,3.4,5.0,4.1,0,5.0,2.6,44,[['1 glass (250 ml)',250],['100 ml',100]]),
  F('milk-toned','Milk, toned','Dairy & Egg','veg','as-served','B',
    58,3.2,4.8,3.0,0,4.8,1.9,44,[['1 glass (250 ml)',250]]),
  F('milk-skim','Milk, double toned / skim','Dairy & Egg','veg','as-served','B',
    38,3.4,5.0,0.5,0,5.0,0.3,46,[['1 glass (250 ml)',250]]),
  F('curd','Curd / dahi, full fat','Dairy & Egg','veg','as-served','A',
    61,3.5,4.7,3.3,0,4.7,2.1,46,[['1 katori (150 g)',150]]),
  F('greek-yogurt','Greek yogurt, plain 0%','Dairy & Egg','veg','as-served','B',
    59,10.2,3.6,0.4,0,3.2,0.1,36,[['1 cup (170 g)',170],['100 g',100]]),
  F('chaas','Chaas / buttermilk','Drinks','veg','as-served','C',
    40,1.7,4.5,1.5,0,4.0,0.9,180,[['1 glass (200 ml)',200]]),
  F('cheese-slice','Cheese, processed slice','Dairy & Egg','veg','as-served','B',
    350,20.0,4.0,28.0,0,2.0,17.5,1300,[['1 slice (20 g)',20]]),
  F('ghee','Ghee','Fats & Nuts','veg','as-served','A',
    900,0,0,100,0,0,62.0,2,[['1 tsp (5 g)',5],['1 tbsp (14 g)',14]]),
  F('butter','Butter','Fats & Nuts','veg','as-served','A',
    717,0.9,0.1,81.1,0,0.1,51.4,11,[['1 tsp (5 g)',5],['1 tbsp (14 g)',14]]),

  /* ── Prepared dishes ───────────────────────────────────────────────── */
  F('palak-paneer','Palak paneer','Prepared','veg','as-served','D',
    180,8.0,7.0,13.5,3.0,2.4,6.5,520,[['1 katori (150 g)',150]]),
  F('paneer-bhurji','Paneer bhurji','Prepared','veg','as-served','C',
    230,14.0,6.0,17.0,1.6,3.2,8.9,480,[['1 katori (150 g)',150]]),
  F('paneer-tikka','Paneer tikka','Prepared','veg','as-served','C',
    250,17.0,7.0,17.0,1.4,3.6,9.1,540,[['6 pieces (~120 g)',120]]),
  F('butter-chicken','Butter chicken','Prepared','meat','as-served','D',
    240,15.0,7.0,17.5,1.2,4.1,8.4,560,[['1 katori (180 g)',180]]),
  F('chicken-curry','Chicken curry, home style','Prepared','meat','as-served','C',
    180,16.0,5.0,10.5,1.3,2.2,3.1,470,[['1 katori (180 g)',180]]),
  F('tandoori-chicken','Tandoori chicken','Prepared','meat','as-served','C',
    185,26.5,3.0,7.2,0.5,1.8,2.3,590,[['1 leg (~150 g)',150]]),
  F('chicken-biryani','Chicken biryani','Prepared','meat','as-served','D',
    190,9.0,22.0,7.5,1.4,1.5,2.6,520,[['1 plate (350 g)',350]]),
  F('egg-bhurji','Egg bhurji','Prepared','egg','as-served','C',
    190,11.0,4.0,14.5,0.8,2.0,4.4,430,[['2-egg portion (140 g)',140]]),
  F('omelette-2egg','Omelette, 2 egg','Prepared','egg','as-served','C',
    196,12.8,1.6,15.4,0.2,1.0,4.6,320,[['1 omelette (120 g)',120]]),
  F('aloo-gobi','Aloo gobi','Prepared','veg','as-served','C',
    110,2.5,13.0,5.5,3.1,2.4,1.1,380,[['1 katori (150 g)',150]]),
  F('bhindi-masala','Bhindi masala','Prepared','veg','as-served','C',
    105,2.0,9.0,7.0,3.4,2.1,1.4,360,[['1 katori (150 g)',150]]),
  F('mixed-veg','Mixed vegetable sabzi','Prepared','veg','as-served','C',
    100,2.5,11.0,5.0,3.3,3.2,1.0,370,[['1 katori (150 g)',150]]),
  F('salad-kachumber','Salad, cucumber-tomato-onion','Vegetables','veg','as-served','B',
    25,1.0,5.0,0.2,1.4,3.0,0.0,8,[['1 bowl (150 g)',150]]),

  /* ── Vegetables ────────────────────────────────────────────────────── */
  F('potato-boiled','Potato, boiled','Vegetables','veg','cooked','A',
    87,1.9,20.1,0.1,1.8,0.9,0.0,4,[['1 medium (120 g)',120]]),
  F('sweet-potato','Sweet potato, boiled','Vegetables','veg','cooked','A',
    86,1.6,20.1,0.1,3.0,6.5,0.0,55,[['1 medium (130 g)',130]]),
  F('spinach-raw','Spinach, raw','Vegetables','veg','raw','A',
    23,2.9,3.6,0.4,2.2,0.4,0.1,79,[['1 cup (30 g)',30],['100 g',100]]),
  F('broccoli-ckd','Broccoli, cooked','Vegetables','veg','cooked','A',
    35,2.4,7.2,0.4,3.3,1.4,0.1,41,[['1 cup (155 g)',155]]),
  F('cauliflower-raw','Cauliflower, raw','Vegetables','veg','raw','A',
    25,1.9,5.0,0.3,2.0,1.9,0.1,30,[['100 g',100]]),
  F('tomato','Tomato','Vegetables','veg','raw','A',
    18,0.9,3.9,0.2,1.2,2.6,0.0,5,[['1 medium (120 g)',120]]),
  F('onion','Onion','Vegetables','veg','raw','A',
    40,1.1,9.3,0.1,1.7,4.2,0.0,4,[['1 medium (110 g)',110]]),
  F('cucumber','Cucumber','Vegetables','veg','raw','A',
    15,0.7,3.6,0.1,0.5,1.7,0.0,2,[['1 medium (200 g)',200]]),
  F('mushroom-raw','Mushrooms, raw','Vegetables','veg','raw','A',
    22,3.1,3.3,0.3,1.0,2.0,0.1,5,[['100 g',100]]),
  F('bell-pepper','Capsicum / bell pepper','Vegetables','veg','raw','A',
    26,1.0,6.0,0.3,2.1,4.2,0.0,4,[['1 medium (120 g)',120]]),

  /* ── Fruit ─────────────────────────────────────────────────────────── */
  F('banana','Banana','Fruit','veg','raw','A',
    89,1.1,22.8,0.3,2.6,12.2,0.1,1,[['1 medium (118 g)',118],['1 large (136 g)',136]]),
  F('apple','Apple','Fruit','veg','raw','A',
    52,0.3,13.8,0.2,2.4,10.4,0.0,1,[['1 medium (180 g)',180]]),
  F('mango','Mango','Fruit','veg','raw','A',
    60,0.8,15.0,0.4,1.6,13.7,0.1,1,[['1 medium (200 g)',200]]),
  F('papaya','Papaya','Fruit','veg','raw','A',
    43,0.5,10.8,0.3,1.7,7.8,0.1,8,[['1 bowl (150 g)',150]]),
  F('guava','Guava','Fruit','veg','raw','A',
    68,2.6,14.3,1.0,5.4,8.9,0.3,2,[['1 medium (100 g)',100]]),
  F('orange','Orange','Fruit','veg','raw','A',
    47,0.9,11.8,0.1,2.4,9.4,0.0,0,[['1 medium (140 g)',140]]),
  F('pomegranate','Pomegranate','Fruit','veg','raw','A',
    83,1.7,18.7,1.2,4.0,13.7,0.1,3,[['1 bowl (150 g)',150]]),
  F('watermelon','Watermelon','Fruit','veg','raw','A',
    30,0.6,7.6,0.2,0.4,6.2,0.0,1,[['1 bowl (200 g)',200]]),
  F('grapes','Grapes','Fruit','veg','raw','A',
    69,0.7,18.1,0.2,0.9,15.5,0.1,2,[['1 bowl (150 g)',150]]),
  F('dates','Dates','Fruit','veg','raw','A',
    282,2.5,75.0,0.4,8.0,63.4,0.0,2,[['1 date (8 g)',8]]),
  F('avocado','Avocado','Fats & Nuts','veg','raw','A',
    160,2.0,8.5,14.7,6.7,0.7,2.1,7,[['½ medium (68 g)',68]]),

  /* ── Fats, nuts, seeds ─────────────────────────────────────────────── */
  F('almonds','Almonds','Fats & Nuts','veg','raw','A',
    579,21.2,21.6,49.9,12.5,4.4,3.8,1,[['10 pieces (12 g)',12],['30 g',30]]),
  F('cashew','Cashew','Fats & Nuts','veg','raw','A',
    553,18.2,30.2,43.9,3.3,5.9,7.8,12,[['10 pieces (16 g)',16]]),
  F('walnut','Walnut','Fats & Nuts','veg','raw','A',
    654,15.2,13.7,65.2,6.7,2.6,6.1,2,[['4 halves (12 g)',12]]),
  F('peanuts-roast','Peanuts, roasted','Fats & Nuts','veg','as-served','A',
    567,25.8,16.1,49.2,8.5,4.7,6.8,6,[['30 g',30]]),
  F('pista','Pistachio','Fats & Nuts','veg','raw','A',
    560,20.2,27.2,45.3,10.6,7.7,5.6,1,[['20 pieces (20 g)',20]]),
  F('chia','Chia seeds','Fats & Nuts','veg','dry','A',
    486,16.5,42.1,30.7,34.4,0,3.3,16,[['1 tbsp (12 g)',12]]),
  F('flax','Flax seeds','Fats & Nuts','veg','dry','A',
    534,18.3,28.9,42.2,27.3,1.6,3.7,30,[['1 tbsp (10 g)',10]]),
  F('oil-generic','Cooking oil (any)','Fats & Nuts','veg','as-served','A',
    884,0,0,100,0,0,14.0,0,[['1 tsp (5 g)',5],['1 tbsp (14 g)',14]]),
  F('olive-oil','Olive oil','Fats & Nuts','veg','as-served','A',
    884,0,0,100,0,0,13.8,2,[['1 tbsp (14 g)',14]]),

  /* ── Snacks & sweets ───────────────────────────────────────────────── */
  F('samosa','Samosa','Snacks & Sweets','veg','as-served','D',
    300,5.0,32.0,17.0,2.6,1.8,7.2,420,[['1 samosa (60 g)',60]]),
  F('pakora','Pakora','Snacks & Sweets','veg','as-served','D',
    315,7.0,28.0,19.0,3.4,2.0,8.1,520,[['1 plate (100 g)',100]]),
  F('dhokla','Dhokla','Snacks & Sweets','veg','as-served','C',
    160,6.0,22.0,5.0,2.4,4.0,1.0,480,[['2 pieces (80 g)',80]]),
  F('momos-veg','Momos, veg steamed','Snacks & Sweets','veg','as-served','D',
    175,5.0,28.0,4.5,2.0,1.6,1.2,390,[['1 piece (25 g)',25],['6 pieces',150]]),
  F('bhel-puri','Bhel puri','Snacks & Sweets','veg','as-served','D',
    240,5.0,36.0,8.0,3.5,6.0,2.1,690,[['1 plate (120 g)',120]]),
  F('vada-pav','Vada pav','Snacks & Sweets','veg','as-served','D',
    290,7.0,40.0,11.0,3.0,3.5,4.4,640,[['1 vada pav (130 g)',130]]),
  F('gulab-jamun','Gulab jamun','Snacks & Sweets','veg','as-served','D',
    330,4.0,45.0,15.0,0.3,38.0,7.5,90,[['1 piece (40 g)',40]]),
  F('rasgulla','Rasgulla','Snacks & Sweets','veg','as-served','D',
    186,4.0,33.0,4.0,0,31.0,2.4,60,[['1 piece (50 g)',50]]),
  F('jalebi','Jalebi','Snacks & Sweets','veg','as-served','D',
    400,2.0,60.0,16.0,0.2,48.0,7.5,70,[['1 piece (30 g)',30]]),
  F('kheer','Kheer','Snacks & Sweets','veg','as-served','D',
    145,4.0,22.0,4.5,0.4,17.0,2.6,80,[['1 katori (150 g)',150]]),
  F('dark-choc-70','Dark chocolate, 70%','Snacks & Sweets','veg','as-served','B',
    598,7.8,45.9,42.6,10.9,24.0,24.5,20,[['1 square (10 g)',10],['1 bar (50 g)',50]]),

  /* ── Drinks ────────────────────────────────────────────────────────── */
  F('chai-sugar','Chai, with milk and sugar','Drinks','veg','as-served','C',
    90,2.0,12.0,3.5,0,11.0,2.2,25,[['1 cup (150 ml)',150]]),
  F('chai-nosugar','Chai, milk no sugar','Drinks','veg','as-served','C',
    45,2.0,3.0,2.6,0,3.0,1.6,25,[['1 cup (150 ml)',150]]),
  F('coffee-black','Coffee, black','Drinks','veg','as-served','A',
    2,0.3,0,0,0,0,0,5,[['1 cup (240 ml)',240]]),
  F('coffee-milk','Coffee with milk and sugar','Drinks','veg','as-served','C',
    75,2.2,10.5,2.8,0,10.0,1.8,30,[['1 cup (180 ml)',180]]),
  F('coconut-water','Coconut water','Drinks','veg','as-served','A',
    19,0.7,3.7,0.2,1.1,2.6,0.2,105,[['1 glass (250 ml)',250]]),
  F('cola','Cola, regular','Drinks','veg','as-served','B',
    42,0,10.6,0,0,10.6,0,4,[['1 can (330 ml)',330]]),
  F('beer','Beer, 5%','Drinks','veg','as-served','B',
    43,0.5,3.6,0,0,0,0,4,[['1 pint (500 ml)',500],['1 bottle (330 ml)',330]]),
  F('whisky','Whisky / vodka, 40%','Drinks','veg','as-served','A',
    231,0,0,0,0,0,0,1,[['1 peg (30 ml)',30],['1 large peg (60 ml)',60]]),
  F('wine-red','Wine, red','Drinks','veg','as-served','B',
    85,0.1,2.6,0,0,0.6,0,4,[['1 glass (150 ml)',150]]),

  /* ── Supplements ───────────────────────────────────────────────────── */
  F('whey-conc','Whey protein concentrate','Supplements','veg','dry','B',
    400,76.0,10.0,6.0,0,4.0,3.5,320,[['1 scoop (30 g)',30]]),
  F('whey-isolate','Whey protein isolate','Supplements','veg','dry','B',
    373,86.7,3.3,1.7,0,1.7,1.0,270,[['1 scoop (30 g)',30]]),
  F('casein','Casein protein','Supplements','veg','dry','B',
    367,76.7,10.0,3.3,0,3.3,2.0,480,[['1 scoop (30 g)',30]]),
  F('mass-gainer','Mass gainer','Supplements','veg','dry','B',
    380,15.0,75.0,3.0,1.5,20.0,1.5,220,[['1 scoop (75 g)',75]]),
  F('creatine','Creatine monohydrate','Supplements','veg','dry','A',
    0,0,0,0,0,0,0,0,[['1 scoop (5 g)',5]]),
  F('electrolyte','Electrolyte drink, sugar free','Supplements','veg','as-served','B',
    4,0,1.0,0,0,0,0,400,[['1 serving (500 ml)',500]]),
];

/*
 * Ethanol, in grams per 100 ml.
 *
 * Alcohol carries ~7 kcal/g and is most of the energy in a drink, but it is
 * not protein, carbohydrate or fat, so a spirit looks like 231 kcal of
 * nothing. Without these figures the reconciliation check calls every drink
 * a data error. Grams = ABV × 0.789 (the density of ethanol).
 */
const ETHANOL_G_PER_100ML = {
  beer: 3.9,        // 5%
  'wine-red': 10.3, // 13%
  whisky: 31.6,     // 40%
};

for (const f of FOODS) {
  const alc = ETHANOL_G_PER_100ML[f.id];
  if (alc) f.per100.alc = alc;
}

/* Fast lookup by id. */
export const BY_ID = Object.fromEntries(FOODS.map(f => [f.id, f]));

/*
 * Atwater reconciliation.
 *
 * Protein and carbohydrate yield ~4 kcal/g, fat ~9, alcohol ~7. If a food's
 * stated calories disagree with its own macros by more than a few percent,
 * something is wrong — a mistyped label, a rounded panel, or a hidden
 * ingredient. Basal refuses to let that pass silently.
 */
export function atwater(per100) {
  const p = +per100.p || 0, c = +per100.c || 0, f = +per100.f || 0;
  const fib = +per100.fib || 0, alc = +per100.alc || 0;
  // Fibre is carbohydrate by difference but yields ~2 kcal/g, not 4.
  const net = Math.max(0, c - fib);
  const derived = p * 4 + net * 4 + fib * 2 + f * 9 + alc * 7;
  const stated = +per100.kcal || 0;
  const delta = stated ? (stated - derived) / stated : 0;
  return {
    derived: Math.round(derived),
    stated: Math.round(stated),
    delta,                                  // signed fraction
    // Relative error alone is meaningless on low-calorie foods: 12% of a
    // 25 kcal vegetable is 3 kcal, well inside the source table's rounding.
    off: Math.abs(delta) > 0.12 && Math.abs(stated - derived) > 8 && stated > 20,
  };
}
