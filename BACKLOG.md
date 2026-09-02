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
