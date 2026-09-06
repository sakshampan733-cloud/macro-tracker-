# Porting Basal to a native app

This is the contract. It says which parts of the codebase are the product
and must survive the port unchanged, which parts are scaffolding that the
platform replaces, and how to prove the ported build still computes the same
numbers as this one.

Read it before deciding on an approach, because the approach determines how
much of the first section you get to keep for free.

---

## 1. What must not be rewritten

These modules are Basal. They are pure computation — no DOM, no storage, no
network — and they took the longest to get right. Everything else in the repo
is a way of showing what they say.

| Module | What it holds |
|---|---|
| `docs/js/nutrition.js` | BMR (Mifflin-St Jeor / Katch-McArdle / Schofield), TDEE both predicted and adaptive, macro targets, the calorie floor, youth guidance, BMI, goal pace and feasibility, trend weight, the check-in |
| `docs/js/store.js` | Portion arithmetic, per-entry uncertainty, day totals with sigma combined in quadrature, the day boundary and rollover |
| `docs/js/carry.js` | Carry-forward: day completeness, the caps, the step spread, the macro trend that refuses to treat protein as a debt |
| `docs/js/whoop.js` | Metric definitions, series, baselines, percentile-in-your-own-history |
| `docs/js/off.js` | Open Food Facts normalisation, including the per-serving derivation |
| `docs/js/data/*.js` | The food library (607 items), micronutrients, quality map, restaurants, supplements, medications, blood markers |

They are plain ES modules with no dependencies. **In a Capacitor or React
Native port they can be used as-is.** In a Swift port they are the
specification, and `docs/test.html` is how you check your translation.

Three rules that are easy to lose and expensive to lose:

- **Absent is not zero.** A missing kcal figure, a missing micronutrient, a
  day with no weigh-in — all are `null`, and `null` must not become `0`
  anywhere. Zero calories means a food you ate for free; zero iron means a
  deficiency the app invented. Several shipped bugs were exactly this.
- **Uncertainty travels with the number.** Every entry carries a sigma from
  its logging method times its grade multiplier; days combine them in
  quadrature, not by adding. The band is shown, not decorative.
- **The log is a fact.** Targets adjust; entries never do. `adaptiveTDEE`
  learns from what was logged, so anything that quietly rewrites the log
  corrupts the model that reads it.

---

## 2. What the platform replaces

Roughly half the difficulty in this codebase exists because a web app cannot
do these things. A native app can, and the corresponding code should be
deleted rather than ported.

| Web scaffolding | Native replacement | What goes away |
|---|---|---|
| `applehealth.js`, `whooprelay.js`, `relay/worker.js`, the iOS Shortcut | HealthKit, read directly | The relay, the key, the JSON body, the 11:50pm automation, Sum-versus-Average, duplicate-source step counting — the entire fragile chain |
| `localStorage` via `store.js` persistence | CloudKit or a local database with iCloud backup | Manual export, the backup reminder, and the single worst failure mode: one "Clear Website Data" and the log is gone |
| `sw.js`, `bump-version.sh`, the cache-busting dance | The app bundle | Version skew, stale screens, hard-close-and-reopen |
| `scanner.js` (getUserMedia + jsQR) | `AVCaptureMetadataOutput` | Slow, permission-flaky scanning in a webview |
| `reminders.js` in-app nudges | Local notifications | Reminders that only fire while the app is open, which is the wrong time |
| `pulltorefresh.js`, `swipe.js`, `feedback.js` | Platform gestures and haptics | Hand-rolled physics |

**The persistence layer needs an explicit decision.** Everything currently
lives under one localStorage key, `basal.v1`, as a single JSON blob written
whole on every change. That is fine at this size and will not stay fine.
`exportJSON`/`importJSON` already define the on-disk shape, so they are the
natural migration boundary: read the blob once, write it into whatever the
native store is, keep the same field names.

---

## 3. Choosing the approach

There is no node or npm on the development machine, and no build step in the
repo. That is not incidental — it shapes the options.

**Capacitor.** Wraps the existing app. Every view, every calculation, the
whole food library and all three themes come across intact; HealthKit and
iCloud arrive as plugins. By far the least work, and the calculation layer is
literally the same files. Requires installing node.

**SwiftUI.** A real rewrite of the interface, with the modules above as the
spec. Better feel, native everything, no webview. Requires Xcode, no node.
Budget for reimplementing roughly thirty view modules.

Either way the food library is data, not code, and should move as JSON rather
than being retyped.

---

## 4. Proving the port is correct

`docs/test.html` runs 88 assertions against the modules in section 1 — the
published equations worked by hand, the rounding, the floors, the null
handling, and several specific bugs that shipped once and must not return.

Open it in any browser; no runner, no install. It reports pass/fail on the
page and sets `window.__basalTests = { pass, fail }` so a headless run can
read the result.

**For a Capacitor port**, the suite runs unchanged inside the webview. Keep it
in the bundle behind a debug route.

**For a SwiftUI port**, translate the specs. They are deliberately written as
"this equation, these inputs, this expected number, worked out in the comment"
rather than as snapshots of current behaviour, so they can be ported to XCTest
line by line and still mean something. Where a test says
`bmrMifflin(male, 80 kg, 180 cm, 30) === 1780`, that is arithmetic, not a
convention — if the Swift version disagrees, the Swift version is wrong.

Extend the suite when you touch the model. It is the only thing that will
notice a drift of forty calories in a target, and forty calories a day is
about two kilograms a year.

---

## 5. Known gaps at the time of writing

Carried over so they are not rediscovered mid-port.

- **Open Food Facts is thin on Indian products.** Scanning a local packet
  often finds nothing. A better dataset is a sourcing problem, not a code
  one, and the app correctly refuses to invent nutrition data for a barcode
  it cannot resolve.
- **No accounts, no multi-device.** Deliberate so far. Native sync makes it
  possible; whether to offer it is a product decision, not a technical one.
- **The Light skin is spot-checked, not exhaustively verified.** Roughly
  thirty view modules; a handful of screens have never been looked at in it.
  Moot if the port rebuilds the interface.
- **Whoop and Apple both report HRV, on different scales** — RMSSD and SDNN.
  They are never averaged, and must never be. `applehealth.js` documents the
  merge rules; whatever replaces it has to keep them.
