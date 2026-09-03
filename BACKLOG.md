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
