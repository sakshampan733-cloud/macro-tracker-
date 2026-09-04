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

**Follow-up: existing profiles.** Nobody has to redo setup — the live
target is recomputed on every render, so it moves on the next app open.
But `s.targets` is a frozen copy written at profile-save time that a few
older screens still read, so after this change the live number and the
frozen one disagreed by six hundred calories with no way to reconcile them
short of re-saving. It is now recomputed at boot and rewritten only when it
actually differs. A split set by hand survives, since macroTargets applies
that too.

The reasoning also moved to where the number is read. It was only on the
setup screen, which is no use to somebody who chose their goal last month
and has just watched the app move their target; it now appears on Detail
alongside the other target explanations. And the "that is brisk" note no
longer quotes the adult 1%-a-week line to a fifteen-year-old whose ceiling
is a third of that — reading as permission up to a number they should not
go near was worse than saying nothing.

**Follow-up: match the calculators.** The Schofield switch made the app
disagree with every calorie calculator on the internet by several hundred
kcal, and a number that disagrees with every other number a person can find
is a number they stop believing. Mifflin-St Jeor (or Katch-McArdle when
body fat is known) is what those sites use, so it is what the app uses now,
for every age. Verified identical to a reference implementation across
seven age/sex/weight/body-fat profiles, BMR and TDEE both.

Schofield is still computed for under-18s and reported alongside — "the
equation meant for your age would put it nearer 2,314 kcal" — because
informing beats overruling. None of the guardrails depended on the
equation: the 130 g carbohydrate RDA, the protein ceiling, the slower
deficit limit and the resting-burn floor are about what the app is willing
to recommend, not about which formula produced the starting figure. The
sixteen-year-old case is 2,502 kcal with 265 g of carbs — the carb problem
was never the equation, it was carbs being the leftover.

**BMI.** On the Body tab, under the weight card, computed from what the
app already holds — asking for height and weight again would be asking you
to retype something it is tracking. Read off the trend weight rather than
this morning's number, since a kilo of water swinging BMI by 0.3 is noise
reported as a change. Shows the figure, the adult category, and what the
healthy band works out to in kilos at your height, which is the question
people are actually asking when they look BMI up.

Under 18 it shows the number and no category. Adolescent BMI is read as a
percentile against age and sex off a growth chart, and the adult bands are
simply wrong there — a fourteen-year-old and a forty-year-old at BMI 24 are
not in comparable situations. Rather than embed percentile tables from
memory the app says where it is properly read. A wrong category on a
teenager is worse than no category, and it would be the same mistake as
using an adult equation on a growing body.

It also says what BMI cannot do. A lifter at 12% body fat reads
"Overweight" at 27.2, so when the app knows a body fat percentage it says
to treat that as the real number instead.

**Bug: loading demo data destroyed the real profile.** The demo carries its
own body — birth year 1996, 178 cm, its own weight — and it was written
straight over the profile with `{...st.profile, ...demo.profile}`, so every
key it holds won. Anyone who tapped "Load demo data" ended up calculating
against the demo's body instead of their own, which is why two people who
both tried it saw *identical* maintenance figures that matched neither of
their calculators. Clearing the demo did not undo it: it wiped days, whoop,
blood, meals and library, and left the profile as the demo's, permanently.

The real profile and the settings the demo overwrites (healthSource,
sleepGoal, workoutHour) are now kept in `settings.preDemo` before the
overwrite and handed back on clear. Verified: a real 16-year-old profile at
172 cm / 88 kg becomes the demo's 178 cm / 84.4 kg on load and comes back
intact on clear, with maintenance returning from the demo's 2,809 to his
own 2,585.

While the demo is loaded, Detail now says so where the number is actually
doubted — "these are the demo's numbers, not yours" — rather than only in a
collapsed group in Settings, which is not where anybody looks when their
figure disagrees with a calculator.

**Goals, in more detail — 2026-09-04.** Nine of them now, sorted into
Lose / Hold / Gain so you pick the question before the pace, which is the
order people decide in. The three loss rates are the ones every calorie
calculator offers — a quarter, a half and a full kilo a week — so somebody
arriving from one finds the option they came for instead of guessing which
vague label matches what they picked elsewhere. Same on the gain side.

Including the aggressive ones is not the app endorsing them. A kilo a week
trips the pace warning as *severe*, lands on the resting-burn floor, and
sets carbFloored so the "this pace does not leave room to eat well" note
fires. On a sixteen-year-old it trips the growth guidance too. The option
exists, the arithmetic is honest about it, and the person decides.

And a Pace field: type your own kg-a-week if you want something between the
presets — 0.6 because a coach said so, or 0.4 because 0.5 was too much last
time. Picking a goal sets it, typing overrides it, and it now says what the
pace costs a day (`660 kcal under maintenance every day. At 0.6 kg a week
that is about 2.6 kg a month, if you hold it`), which is the number that
makes a rate mean anything.

Bug found while building it: `read()` reset the rate unconditionally on
first-run onboarding, so a typed pace was overwritten the moment anything
else on the form was touched. It now only fills a missing value.

**The two goals become one — 2026-09-04.** The app had a goal picker in
Settings that drove the calorie target, and a separate dated goal widget
("82 kg by 14 March") that was stored, drawn on a card, checked for
feasibility, and had *no effect whatsoever* on the calories. Two goals, one
of them decorative, and nothing on screen to say which was which. Setting a
target weight and a date changed nothing you could see, which is exactly
what it looked like.

`goalRate()` derives the pace from the dated goal — distance still to go
over weeks still left — and `app.js` writes it into `profile.rate` on every
launch, which is what `macroTargets` already reads. So the goal now governs
the food rather than describing it, and it self-corrects: fall behind and
the pace steepens, get ahead and it eases.

Which is why it needs a ceiling. A goal you have slipped on would otherwise
quietly demand 1.66 kg a week and the app would set a target to match with
nobody having decided that. Capped at 1 kg a week or 1.25% of bodyweight,
whichever is lower; past that the pace holds and the date is what gives.

The editor is now the single detailed place. A real date field replaces the
1/2/3/6-month chips, because people are aiming at a wedding or a check-up
rather than at "2 months". Pace chips (Slow / Steady / Fast, as shares of
bodyweight) fill the date in rather than being a separate setting — "how
fast" and "by when" are two ways of asking one question, and the app used
to ask both in different places and let only one touch the calories. The
resulting calorie target is shown live before you save.

Settings no longer offers a competing Pace control once a dated goal
exists; it shows what the goal is doing and links to it.

Verified: rate derivation across on-track, behind, impossible, ahead,
arrived, expired and gaining goals; the cap holding at -1.0 where -1.66 and
-5.0 were demanded; setting a goal moving the day's target from 2,498 to
2,144; 36 route x theme x goal-present combinations and the editor in both
themes with and without an existing goal.

**Onboarding asks for the destination too.** The goal picker and the typed
pace are gone from the first-run form and from Settings -> Body and goal.
In their place, the same question the goal editor asks: lose / hold / gain,
then a target weight, a pace chip that fills in a date, and a real date
field. Nobody thinks in kilos per week — they think "78 by March" — and
that framing is also the only one that stays true as time passes, because
the pace can be recomputed from how far there still is to go.

Holding weight keeps its own branch (Just maintain / Build muscle at this
weight), because "stay here and get stronger" has no target weight to aim
at and never did.

Saving writes `s.goal` rather than a rate on the profile, so the goal card,
the feasibility check and the boot-time pace refresh all read one record.
The weekly rate is derived in three places now — onboarding, the goal
editor, `goalRate()` — from the same arithmetic, so they agree instead of
each keeping a copy of the answer. Settings' Body and goal group keeps the
goal card and nothing else.

Verified: a first run setting 95 -> 85 kg on the Steady chip produces
0.62 kg/wk, 681 kcal under maintenance, a starting target of 2,292 against
a 2,973 maintenance, and a stored goal that survives reload with the rate
recomputed to the same figure.

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
