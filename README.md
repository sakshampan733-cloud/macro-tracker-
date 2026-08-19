# Basal

A macro tracker built around one idea: **every number carries a known error, and the app should tell you what it is.**

Most trackers show "1,847 kcal" as though it were a fact. It isn't. If half of that came from a scanned packet and half from eyeballing a restaurant plate, the honest reading is 1,847 ± 190. Basal tracks how you measured each thing, propagates the error, and shows you the band.

---

## Running it

```bash
python3 "$HOME/macro tracker /server.py"
```

That prints two addresses. Open the second one on your iPhone, on the same WiFi:

```
On this Mac      https://localhost:8443
On your iPhone   https://<your-mac's-lan-ip>:8443
```

Safari will warn about the certificate the first time — tap **Show Details → visit this website**. You only do this once, and it is what allows the camera scanner to run. iOS refuses camera access to any page that isn't on a secure connection.

Then **Share → Add to Home Screen**. It launches full screen, with no browser chrome, and works offline.

The Mac only needs to be running for barcode lookups and backups. Logging, scanning-by-typing, the whole reference database, and every calculation work with the server off.

---

## The measurement model

Every entry records *how you knew the amount*:

| Method | Error | When |
|---|---|---|
| **WGH** Weighed | ±2% | On a scale, in grams |
| **LBL** Label | ±5% | Packaged serving or barcode |
| **PTN** Portion | ±12% | A standard household serving |
| **EST** Estimated | ±25% | Eyeballed, or eaten out |

On top of that, each food carries a grade for how much the food itself varies. Grade A is a weighed laboratory reference; grade D is street food, where the oil is anyone's guess. The grade multiplies the method's error.

Day totals combine these **in quadrature** — `σ_total = √(Σσᵢ²)` — because independent errors don't add linearly. Logging twenty carefully weighed items doesn't make your day twenty times more uncertain.

That's what the `± 54` next to your remaining calories means, and what the hatched band on the rail is showing you.

### Reconciliation

Protein and carbohydrate yield ~4 kcal/g, fat ~9, fibre ~2. Every food is checked against its own macros. If a packet's stated calories disagree with what its macros imply, Basal says so before you save it — that's almost always a typo or the per-serving column mixed up with the per-100 g one. All 136 reference foods pass this check.

---

## Maintenance calories

Three methods, in ascending order of accuracy. The app uses the best one it has data for and always names it.

1. **Formula** — Mifflin-St Jeor, or Katch-McArdle if you enter body fat %. A population average, routinely 15% off for any individual.
2. **Whoop** — device-measured daily burn.
3. **Adaptive** — back-calculated from your own logged intake and the least-squares trend in your weight: `TDEE = mean intake − (weight slope × 7700 ÷ days)`.

Adaptive wins once it has **10 logged days and 4 weigh-ins**, because it measures *you* rather than predicting a stand-in. It reports its own error bar, driven by how noisy your scale readings are.

---

## Home-cooked food you can't track

The hard case: breakfast is weighed to the calorie, then dinner is rice and whatever dal was made, and nobody knows how much oil went in. Two tools, in order of how good the answer is.

**The Pot — exact, once per dish.** Catch the dish at the source one time: weigh what goes in, weigh what comes out. Cooking-off matters enormously, which is why the finished weight is measured rather than assumed — the same ingredients reduced to 1.15 kg instead of 1.7 kg are half again as dense. You get a real kcal-per-gram, it's saved as one of your foods, and from then on you only weigh your serving. Oil is usually a quarter of the calories in a home dal, and it's the thing eyeballing always misses.

**Home dish — honest, immediate.** Weigh your serving, name the style, and get a number with a real error bar: *200 g of regular dal, 245 ± 22 kcal*. No recipe needed. Worse than the Pot, far better than not logging it.

### What the app will not claim

It would be neat if the app could back-solve your dal's density from your weight trend. It genuinely cannot, in the common case, and it says so rather than pretending.

If you eat home food every day in similar amounts, "the dal is richer than the book" and "my metabolism is slower than I thought" predict *exactly* the same weight curve. That's one equation with two unknowns, and no amount of data fixes it — separating them would need your maintenance known to ±30 kcal, which nobody's is. The app tests for this directly and refuses to report a number it can't actually distinguish from the reference value. Use the Pot instead.

---

## What Whoop actually buys you

**You don't have to keep uploading.** Whoop publishes a developer API, so this can sync itself:

1. Register an app at **developer.whoop.com** (free, few minutes).
2. Set the redirect URI to `https://localhost:8443/api/whoop/callback`.
3. Save the two keys on the Mac as `data/whoop_credentials.json`:
   ```json
   { "client_id": "…", "client_secret": "…" }
   ```
4. Restart the server, open Body → Connect Whoop, authorise once.

Do the authorisation **on the Mac, at localhost** — Whoop matches the return address exactly, and only that one is registered. Your phone never authorises anything; it reads what the Mac already fetched. After that it tops up on its own whenever the app opens with the server running.

The keys and tokens stay in `data/`, mode 600, and never reach the phone.

**CSV still works** if you'd rather not register anything: whoop.com → Settings → Download my data, unzip, load `physiological_cycles.csv`. That route needs re-importing each time.

Three things it earns:

**Day-adjusted targets.** A flat daily number overfeeds rest days and starves training days. Basal takes the *level* from your adaptive maintenance and the *movement* from how today's Whoop burn compares to your own 28-day Whoop average. Whoop's absolute calorie figure is not trusted — it runs high — but its sense of a hard day versus an easy one is good. The adjustment is clamped so one bad sensor day can't swing your target wildly.

**Your ranges, not a population's.** Every metric shows where today sits inside your own recorded history — percentile, standard deviations from your mean, the middle-half band. "Is 58 ms of HRV good?" has no general answer; "that's your 34th percentile, below your normal" does.

**Food against next-day recovery.** Once 14 days have both a food log and a Whoop recovery the next morning, Basal correlates your intake — calories, protein, fibre, sugar, sodium, alcohol, water, how late you ate — against how you woke up. Weak associations are labelled as noise. These are correlations across your own days, not causes; use them to pick something worth testing deliberately for a fortnight.

---

## Food data

- **136 reference foods**, each stating whether it's weighed raw, dry, cooked, or as-served. This matters more than anything else: 100 g of dry rice is 360 kcal, the same rice cooked is 130. Basal never silently converts between the two.
- Household servings throughout — 1 katori, 1 roti, 1 scoop, 1 medium — because that's how food arrives.
- **Barcodes** resolve through Open Food Facts, which holds about 22,500 Indian products. Verified working on Parle-G, Maggi, Lay's India, Haldiram's. Lookups are cached to disk permanently, so a scanned barcode resolves instantly forever after and works offline.
- **Your own foods** outrank everything. Build one from a packet — name, serving weight, the panel — and it's yours permanently, barcode attached if you scanned one. Your library beats the public database on every lookup, because you may have corrected it yourself.

Scanning uses the browser's native barcode detector where available, and a bundled ZXing decoder on Safari, which has none. Every scan must read the same code twice before it's accepted — the difference between logging the right product and the one beside it on the shelf.

---

## Your data

It lives in your browser's local storage, on your device. Nothing is sent anywhere except barcode lookups, which send only the digits.

- **Export** a full JSON backup from Settings.
- **Automatic snapshots** go to `data/backup.json` on the Mac a few seconds after each meaningful change, plus a dated copy per day.

Clearing Safari's website data would erase the log, so keep the Mac backup on.

---

## Layout

```
server.py              Static server, Open Food Facts proxy, disk cache, TLS
start.sh               Convenience launcher
data/                  Certificate, barcode cache, backups
web/
  index.html
  css/app.css
  js/
    store.js           Persistence, the day model, error propagation
    nutrition.js       BMR, TDEE, adaptive maintenance, macro targets
    whoop.js           CSV import, ranges, correlations, day factor
    coach.js           Meal budgets and suggestions
    scanner.js         Camera barcode decoding
    off.js             Barcode resolution
    ui.js              DOM toolkit, the rail, charts
    data/foods.js      Reference database
    views/             Today, Add, Plan, Foods, Body, Setup
  fonts/               IBM Plex, bundled so it works offline
  vendor/zxing.min.js  Safari barcode fallback
```

No build step, no dependencies, no framework. Edit a file and reload.

---

## Design

Anything **measured** is set in mono; anything **said** is set in sans. You can tell data from prose without reading either.

The signature element is the caliper rail: a value on a scale, with the target notched and the measurement's own uncertainty hatched around the tip. It replaces the progress ring every other tracker uses, because a ring can't show you an error bar — and the error bar is the point.
