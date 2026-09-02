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

**Indian barcodes, offline.** The scanner works and the OCR label reader
works, but the food library carries no barcodes of its own — every scan
goes to OpenFoodFacts, and Indian FMCG coverage there is poor. A local
barcode set for the snacks people actually scan would fix the common case,
with the label-scan path as the fallback it already is.

**Scanning a supplement tub.** The label reader handles a nutrition panel;
a supplement tub is a different shape of data and is not handled.

**Swipe to dismiss a coach note.** There is a close button; the gesture is
not wired.

---

## Built since the last capture

Medication with its own segment and reference data · caffeine as a
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
