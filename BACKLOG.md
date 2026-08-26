# Basal — backlog

Captured 2026-08-24. Nothing here is built yet unless marked otherwise.
Order within each section is roughly the order worth building in, not priority
between sections.

---

## 1. Medication

A separate segment, sitting alongside supplements rather than inside it.
Medication is not a supplement: it is prescribed, it is timed, and being late
matters in a way that being late with creatine does not.

### What the user enters

- **Name** — the real one (`Sertraline`), a **nickname** (`the blue one`), or
  both. Some people know their medication only by sight.
- **What it is for**, in their words.
- **Dose in mg**, and how many units per dose.
- **Timing** — the times of day it is meant to be taken.
- **Barcode**, scanned off the box where one exists.

### What the app tells them

- What the medication does — **only where we are certain**. A wrong answer here
  is worse than no answer, so an unknown drug says "not in the reference"
  rather than guessing from a similar name.
- **How their day might look** on it: the ordinary, well-established effects —
  drowsiness, appetite change, hypoglycaemia risk around meals, and so on.

### What the app must never do

- Never advise **whether** to take a prescribed medication.
- Never advise **when**, or suggest moving a prescribed time. The prescriber
  set that. The app reports; it does not counsel.
- Never flag, warn, or editorialise about a prescription.
- Nothing that reads as a substitute for the prescriber.

### Reference data to gather

Common classes, with the effects that are genuinely well established:

- antidepressants (SSRIs, SNRIs)
- diabetes — metformin, sulfonylureas, insulin
- cardiac — beta blockers, statins, ACE inhibitors, anticoagulants
- thyroid, PPIs, antihistamines, corticosteroids

Store confidence alongside each entry. Only "certain" entries produce a
description; everything else records the medication without commentary.

### Adherence

- Reminder at the scheduled time.
- A second reminder if it has not been marked taken within the window.
- Track skips and how closely actual times matched scheduled ones.
- All of it flows into the report.

---

## 2. Caffeine as a cross-cutting nutrient

The current split is wrong: coffee is a supplement in the data and a drink in
real life. Logging a coffee as food should also register its caffeine.

- **One caffeine total per day**, fed by anything that contains caffeine —
  coffee logged as food, pre-workout logged as a supplement, an energy drink,
  tea, cola.
- A **daily ceiling**, with the day's running total against it.
- A **cutoff time derived from bedtime**, not a fixed hour. The app already
  knows the typical bed hour from the wake-time model in `coachwhoop.js`, so it
  can say: *"Your usual bedtime is 23:40. Caffeine after about 17:30 is still
  in you at lights-out."*
- The same treatment for anything else that moves sleep — energy drinks
  especially, since the dose is large and people do not think of them as
  coffee.
- This is a **statement of consequence, not a prohibition**: it says what the
  night will look like, and lets the person decide.

---

## 3. Starbucks India, with customisation

The whole Indian Starbucks menu, plus a free hand at the counter — because
nobody orders the menu item as written.

- shot count (single / double / extra)
- syrup pumps, and which syrup
- milk choice (full fat, skim, soy, almond, oat)
- size (Tall / Grande / Venti)
- whipped cream on or off
- the blended drinks by name — Double Chocolate Chip and the rest

Each customisation moves the macros **and** the caffeine, so this ties directly
into section 2.

---

## 4. Scanning

- **Indian snacks frequently do not scan.** Expand what is scannable: a wider
  offline barcode set for Indian FMCG, and a graceful path when the barcode is
  genuinely unknown — enter the label once, keep it forever, and have it
  recognised next time.
- **Supplements**: scan the tub.
- **Label recognition (OCR)**: a multivitamin label has thirty rows on the back
  and nobody is typing that in. Photograph the panel, read it, let the person
  correct it. This is the only realistic way multivitamins get logged
  accurately.

---

## 5. Notifications

- **Swipe to dismiss.** The morning "you haven't eaten since you woke up" note
  did its job the moment it was read; it should not sit there afterwards.
- Applies to every coach note, not just that one.

---

## 6. Water on Home

Logging water currently means going into Detail. It belongs on Home, where the
rest of the fast logging lives.

---

## 7. Food library

Keep widening the Indian street-food and restaurant coverage — Zomato-shaped:
what people actually order, under the name they order it by.

Already added (2026-08-24): 46 street-food and restaurant-side items, then 47
more covering biryanis and the North Indian restaurant menu — 313 foods total,
no duplicate ids, all Atwater-consistent, all classified for quality.

Still worth adding: South Indian restaurant staples, Mughlai, Bengali sweets,
Punjabi dhaba items, regional breakfast.

---

## 8. The report

The report a friend showed was calories and nothing else. This one should be
the week, in full.

**Every feature above has to surface here.** Concretely:

- intake, macros, and the quality breakdown already built (refined carb, seed
  oil, protein completeness)
- measurement uncertainty on the week's totals, combined in quadrature
- adaptive TDEE and where the weight trend actually went
- **plan versus actual** — what was planned, what was eaten, what changed
- **medication adherence** — taken, skipped, how far off the scheduled times
- **caffeine** — daily totals against the ceiling, and how often it landed past
  the bedtime cutoff
- **vitals with their sources named** — which readings were Whoop's and which
  were Apple's, never blended
- meal timing against wake time
- water

The rule going forward: a new feature is not finished until it appears in the
report.

---

## Standing constraints

- **Do not deploy without being told.** Explicit, repeated instruction.
- No long-press gestures — on iOS Safari a long press selects the page instead.
- Whoop HRV (RMSSD) and Apple HRV (SDNN) are never averaged or interchanged.
- Whoop's API does not return step counts; Apple fills that gap and only that
  gap when both bands are worn.
