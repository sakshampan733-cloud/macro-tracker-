# Basal — backlog

Rewritten 2026-09-02. The previous version was captured on 24 August and
opened with "nothing here is built yet", which stopped being true within a
few days and quietly became misleading — it listed medication, caffeine,
Starbucks, water on Home and the report as outstanding long after they
shipped. A backlog nobody trusts is worse than no backlog.

Everything below is checked against the code, not remembered.

---

## Yours, and blocking other people

**1. The Shortcut.** Still the only thing standing between a sibling and a
working install. One Shortcut, one automation, roughly twenty minutes.

**2. Redeploy the relay.** `npx wrangler deploy` in `relay/`. Until that
runs the relay drops `exerciseMin`, `standHours` and `moveGoal`, so the
Activity rings stay empty on real data no matter what the phone sends.

**3. Your own `activeKcal` reads 0.** The Shortcut is not sending Active
Energy, which is why the Move ring has nothing in it and why the calorie
target has been running off Whoop alone.

---

## Not built

**Seeded Indian barcodes.** The scanner works, the OCR label reader works,
and a barcode you teach it once is remembered forever — `resolveBarcode`
checks your own library before it ever asks Open Food Facts. What does not
exist is a pre-seeded table of Indian product codes, and I am not going to
invent one: a barcode mapped to the wrong food is worse than a barcode
that misses, because a miss asks you and a wrong hit does not. This wants
either a licensed dataset or codes scanned off real packets.

---

## Carry-forward — decided, and the reasoning

Added 2026-09-03, on the sleep-debt analogy: if Whoop can carry a sleep
debt, why can't the log carry a calorie one?

**Calories: yes, and it is on the honest side of the line.** Energy
balance really is cumulative. 400 under on Monday genuinely offsets 400
over on Tuesday, and weekly totals predict weight change far better than
any single day. Off by default; Settings → Targets.

**Protein, fat, carbs: refused, deliberately.** Protein is not stored.
There is no reserve to draw down and refill, and muscle protein synthesis
is a per-day process whose window closes — 40 g missed yesterday cannot be
repaid today, the extra is mostly oxidised. "You owe 40 g protein" is a
false model wearing a precise number. Fat and carbs are refused for a
different reason: going over on fat did not create a fat obligation, it
created a calorie surplus, which the energy carry already handles. Two
currencies for one mistake.

What replaced it is `macroTrend` on Detail — how many of the last seven
days came in under, and where the average sits. Same question answered,
nothing invented.

**Steps: yes, and it is the least arguable of the three.** What a deficit
notices is the week's total; a long Saturday genuinely does offset a
desk-bound Tuesday.

### The guardrails, and why each exists

- **Completeness gate.** The load-bearing one. Breakfast and lunch logged,
  dinner eaten out and never entered — the app sees a 900 kcal shortfall
  that did not happen and spends tomorrow morning telling you to eat it.
  The most common logging mistake would have become an instruction to
  overeat. So a day is carried only if you closed it via "start a new day"
  (which now stamps `closedAt`), or it has 3+ meal slots AND reaches 60% of
  target. Days that fail are named on the card, not silently dropped.
- **±400 kcal cap**, or 20% of target, whichever is smaller. Without it one
  sick day leaves you owing two thousand calories.
- **Three-day window.** A shortfall from last Tuesday is not on the books.
- **`safeFloor` backstop.** A surplus rolled forward can push a target
  under the floor. Trimmed, and the trim is reported.
- **Red-recovery days take additions only.** The recovery hold exists to
  stop a deficit that day; a carry that pushes the number back down is the
  exact thing it holds against.
- **Targets only, never the log.** What you ate stays a fact — which is
  also what keeps `adaptiveTDEE` honest, since it learns from logged
  intake rather than from what you were aiming at.

### Still open

- Training volume is the fourth place this belongs and is half-built
  already: the bands are 10–20 sets per muscle **per week**, so the model
  is weekly by definition. Missing a session genuinely does leave a muscle
  under-stimulated and Thursday genuinely can make it up.
- Water was considered and rejected. Yesterday's dehydration is not fixed
  by drinking double today.
- Sleep debt comes from Whoop already. Not duplicating it.

---

## Bug sweep — 2026-09-03

A full pass: every route x both themes x Reading on/off (32 combinations),
72 sheet-opens across both themes, 18 write-path round-trips, an empty
install, 12 band x filter states, and all 605 foods against the app's own
Atwater checker. Four real bugs, all fixed.

**1. The Quick Add meal picker never worked.** `segmented()` reads
`o.value`; that one call site built its options with `o.id`. So every tap
handed back `undefined`, no option ever rendered as pressed, and the meal
silently fell back to whatever the clock suggested. One call site out of
twenty-two had it wrong, which is exactly why nobody caught it.

**2. `addEntry` let a caller defeat its own defaults.** `...entry` came
*after* `meal:`/`method:`/`grade:`, so passing an explicitly-undefined key
overwrote the computed default with undefined. Combined with bug 1 this
produced entries with no meal, and `byMeal()` then built a group keyed
`"undefined"` — which the log renders as a meal heading reading exactly
that. Defaults now come last.

**3. "short on null (its limiting amino acid) - quality null".** The
protein sheet said this about a cup of coffee. `quality.js` deliberately
keeps `complete === null` distinct from `false` — there is a comment saying
so — but `'none'` is a truthy string, so the `cls.p ? ... : null` guard
sailed past it and the `none` class carries `complete: false`. The
aggregation had the same flaw, counting unclassified grams as incomplete
protein, so the Complete/Incomplete bars silently failed to add up to the
covered total. `none` is now unclassified, it has its own bar, and the
view branches on all three states.

**4. `.row .sub` truncated prose everywhere.** The ellipsis is right for a
long food name and wrong for everything else, and everything else is what
actually lives there. It was cutting "From your own intake and weight
trend" mid-phrase and "has all nine building blocks (complete protein)" at
roughly half its width. Subtitles now wrap; a row that genuinely needs one
line opts in with `.is-clipped`, the same way `.row .title` already did.
Checked against the 605-row reference list: average row height unchanged
at 61px, zero subtitles wrapped there.

Clean: date handling (DST, leap years, year boundaries all round-trip),
search against regex metacharacters and 500-character strings, food data
(no duplicate ids or names, no Atwater violations, no meat leaking into the
vegetarian filter), `confirmSheet` in both call shapes, and every sheet on
an empty install.

---

## Scanned foods logging 0 kcal — 2026-09-03

Reported from real use. Two separate faults stacked.

**Per-serving-only products were read as having no nutrition.** Plenty of
entries — US and Indian ones especially — carry only the `_serving` block,
because that is what their label prints. The panel is complete, just
expressed per biscuit rather than per hundred grams. `normalizeOFF` read
only `_100g`, so all of those came back null. Now derived from
`_serving` whenever the serving weight is known (`serving_quantity`, or
parsed out of `serving_size`), and `_100g` still wins when both exist.
A 190 kcal / 40 g bar now reads 475 kcal per 100 g instead of nothing.

**A null then logged as zero, silently.** `macrosFor` maps `v == null` to
0, which is right for fibre and wrong for energy. Nothing on screen said
the panel was empty: the portion sheet opened as normal, the food logged
as free, the day's total did not move, and `adaptiveTDEE` — which learns
from logged intake — was fed a meal that never happened.

The guard went into `openPortion`, the single door every food passes
through, rather than into each of the four callers. It already refused a
missing `per100`; it now also refuses one whose `kcal` is null. Deliberately
`== null` and not falsy, so black coffee and water still log at a genuine 0.

Scans that come back without a usable panel now route to the builder
pre-filled with everything the lookup did return — name, brand, barcode,
serving size, and any macros it had — so what is left is typing the numbers
off the packet, not starting from a blank form. `complete` now turns on
kcal alone (energy is the one field with no sensible default), with
`hasMacros` alongside it, because a product logging 300 kcal and 0 g
protein understates protein exactly as quietly.

---

## Your own split, and getting back to the setup screen — 2026-09-04

Three things, from handing the app to somebody who is not me.

**Draggable macro targets.** The recommendation follows the goal, and the
fastest-loss goal spends its whole budget on protein and fat: a 118 kg
person picking it got 260 g protein and 59 g carbs, 11% of calories. That
is defensible on paper and miserable to eat for months, which is how diets
get abandoned in week three. Settings -> Targets now has three sliders.
Drag one and the other two give way in proportion, so the total holds.
Type into one and nothing moves, because a typed number is a decision and
silently rebalancing it throws away the reason the screen was opened.

Typed numbers may not add up, and the app says by how much rather than
refusing. Protein under 1.6 g/kg and fat under 0.5 g/kg get a warning with
the reason; low carbs get a note saying plainly that there is no medical
minimum for carbohydrate, so it is a preference and not a deficiency. A
fixed calorie number also stands down the daily band adjustment, the
red-recovery hold and the carry — your number stays your number.

The override lives in `macroTargets`, so the stored snapshot, the readout,
the coach, the report and the planner all agree. `recommendedTargets` is
the same computation without it, which is what "Recommended" restores.

**The setup screen, reopenable.** Settings -> Targets -> Your details opens
the original six questions, seeded from what you answered, saving in place.
It keeps everything the form does not ask about — a custom split above all,
so changing your goal re-suggests without discarding numbers you set.

**Bug: "not done yet" trapped you in yesterday.** Saying it pinned openDay
to yesterday, and the app boots with `date: openDay()`, so every launch and
refresh dragged you back — even after walking forward with the arrows and
spending the morning logging today. The prompt only appears once a night,
so there was no way out. Now the two things that unambiguously mean you
have moved on both move it: stepping forward onto today, and logging
anything dated today. The day left behind is stamped closed, which is what
finishing it is and what carry-forward wants to know. Only ever forward,
and only onto today, so going back to fix Tuesday's lunch still moves
nothing.

---

## Age, sex and what the app is allowed to recommend — 2026-09-04

Prompted by the app telling a sixteen-year-old to eat 100 g of carbs on an
aggressive cut. Three separate defects underneath one bad recommendation.

**The equation was the wrong one.** Mifflin-St Jeor was derived in adults
aged 19-78 and reads low on an adolescent, who runs a higher resting burn
per kilo and is spending energy on growth besides. Under 18 now uses
Schofield, as adopted by FAO/WHO/UNU. For a 16-year-old at 95 kg that moves
resting burn from 1,924 to 2,314 kcal — and the deficit used to come off
the low figure.

**Carbohydrate was whatever was left.** Protein and fat took what they
wanted and carbs got the remainder, with a 40 g backstop no real diet would
reach. So an aggressive goal quietly pushed carbohydrate under the amount
the brain runs on, and the app presented that as its recommendation. The
RDA is 130 g for everyone over one year old and it is set by brain glucose,
not by fashion. Fat now yields toward its floor to make room; if even that
is not enough the shortfall is reported rather than printed silently.

**Protein scaled off total bodyweight.** 2.2 g/kg is right for a lean
athlete and wrong for someone carrying a lot of fat, because requirements
track lean mass and fat mass does not ask to be fed. At 118 kg it asked for
260 g — half an aggressive target — which is what left 76 g of carbs.
Protein is now also capped at 40% of energy, never below the 1.6 g/kg that
protects muscle in a deficit.

Net effect for the reported case, a 16-year-old at 95 kg picking "Lose fat":
was roughly 2,400 kcal with ~100 g carbs; is now 3,037 kcal with 365 g carbs
(48% of energy), 190 g protein, 91 g fat.

**What it says, not just what it computes.** Under 18 the app now suggests
holding weight while height catches up — the standard clinical answer to
adolescent obesity, and a genuinely better recommendation rather than a
softer one, because the ratio improves without energy being taken from
growth, bone or puberty. A deficit is still allowed and still counted
honestly; it is just never the thing the app proposed, and it comes with
the line that this is worth doing with a doctor watching. The deficit
ceiling drops from 0.55% of bodyweight a week to 0.35%, and the 1,200 kcal
adult floor does not apply — the floor is their whole resting burn.

**Goals.** Every goal has carried an explanation since the beginning and
the picker rendered labels alone, so "Recomposition" was a bare word next
to "Lose fat" and nobody wanting to get leaner without getting lighter
could tell that was the one. Hints now render under the picker, and that
goal is renamed "Lose fat, build muscle".

---

## Built since the last capture

Supplement tubs — the label parser already handled seventeen
micronutrients and the save path existed; it was reachable only from the
barcode scanner, which is not where anyone looks, so Supplements now
offers it directly · swipe to dismiss a coach note, which was wired all
along in makeDismissible ·
medication with its own segment and reference data · caffeine as a
cross-cutting nutrient with bedtime residue and last-call times ·
Starbucks as a builder · water on Home · the report with its provenance
and fabrication checks · Apple Health end to end · the Train tab, the
rotation model, exercise plans and intensity · the weigh-in prompt · the
Health card language across both bands · light and dark.

---

## Standing constraints

- The app never advises whether or when to take a prescribed medication.
- Never name hardware someone does not own.
- Whoop's HRV is RMSSD and Apple's is SDNN; they are never averaged.
- Say what is measured, what is estimated, and how wide the error is.
