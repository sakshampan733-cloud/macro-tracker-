import Foundation
import Capacitor
import HealthKit

/*
 * Reading Apple Health directly.
 *
 * This replaces the entire relay chain: the Shortcut with its dozen Find
 * Health Samples blocks, the Cloudflare worker, the shared key, the 11:50pm
 * automation, and the Sum-versus-Average guessing that made a resting heart
 * rate read 140 when two samples happened to exist. All of that was
 * scaffolding to get numbers out of a phone that the phone was willing to
 * hand over the whole time — a web page just could not ask.
 *
 * Written by hand rather than taken off the shelf because the published
 * plugins stop at steps, calories and weight. The readings that made Basal
 * worth using on an Apple Watch — HRV, resting heart rate, sleep stages,
 * blood oxygen, respiratory rate, wrist temperature — are not in any of
 * them, and a partial integration would have left the Shortcut in place,
 * which is the thing being removed.
 *
 * Two rules carried over from the relay, because they were learned the hard
 * way and are easy to lose in a rewrite:
 *
 *   A missing reading is absent, not zero. Every field here is optional and
 *   simply does not appear when HealthKit has nothing. A zero would render
 *   as "Move 0/500" — a verdict on the person rather than a gap in the data
 *   — and would poison the trend underneath it.
 *
 *   Statistics are chosen per metric, not uniformly. Things that accumulate
 *   through the day are summed; rates are averaged; spot readings take the
 *   most recent sample. Summing a heart rate is meaningless, and it is
 *   exactly the mistake the Shortcut kept making.
 */

@objc(BasalHealth)
public class BasalHealth: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BasalHealth"
    public let jsName = "BasalHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDay", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    // MARK: - types

    private var quantityTypes: [HKQuantityType] {
        var ids: [HKQuantityTypeIdentifier] = [
            .stepCount, .activeEnergyBurned, .basalEnergyBurned, .appleExerciseTime,
            .restingHeartRate, .heartRateVariabilitySDNN, .oxygenSaturation,
            .respiratoryRate, .bodyMass, .vo2Max, .bodyFatPercentage,
        ]
        if #available(iOS 16.0, *) { ids.append(.appleSleepingWristTemperature) }
        return ids.compactMap { HKQuantityType.quantityType(forIdentifier: $0) }
    }

    private var readTypes: Set<HKObjectType> {
        var set = Set<HKObjectType>(quantityTypes)
        if let stand = HKCategoryType.categoryType(forIdentifier: .appleStandHour) { set.insert(stand) }
        if let sleep = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) { set.insert(sleep) }
        return set
    }

    // MARK: - entry points

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false, "reason": "no health data on this device"])
            return
        }
        /*
         * iOS never tells an app what was granted for reads — by design, so
         * that a refusal is indistinguishable from having no data, and apps
         * cannot infer what you declined to share. So this reports only that
         * the sheet was shown. Whether anything was actually granted is
         * answered by reading and seeing what comes back.
         */
        store.requestAuthorization(toShare: [], read: readTypes) { ok, error in
            if let error = error {
                call.reject("Health permission failed: \(error.localizedDescription)")
            } else {
                call.resolve(["granted": ok, "asked": true])
            }
        }
    }

    @objc func readDay(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device")
            return
        }

        let cal = Calendar.current
        let day: Date
        if let iso = call.getString("date"), let parsed = Self.dayFormatter.date(from: iso) {
            day = parsed
        } else {
            day = Date()
        }
        let start = cal.startOfDay(for: day)
        let end = min(cal.date(byAdding: .day, value: 1, to: start) ?? Date(), Date())

        var out: [String: Any] = ["date": Self.dayFormatter.string(from: start)]
        let group = DispatchGroup()
        let lock = NSLock()

        func put(_ key: String, _ value: Double?) {
            guard let v = value, v.isFinite else { return }
            lock.lock(); out[key] = v; lock.unlock()
        }

        // Things that accumulate through the day.
        sum(.stepCount, .count(), start, end, group) { put("steps", $0) }
        sum(.activeEnergyBurned, .kilocalorie(), start, end, group) { put("activeKcal", $0) }
        sum(.basalEnergyBurned, .kilocalorie(), start, end, group) { put("basalKcal", $0) }
        sum(.appleExerciseTime, .minute(), start, end, group) { put("exerciseMin", $0) }

        // Rates: averaged over the day, never summed.
        average(.restingHeartRate, HKUnit.count().unitDivided(by: .minute()), start, end, group) { put("rhr", $0) }
        average(.heartRateVariabilitySDNN, .secondUnit(with: .milli), start, end, group) { put("hrv", $0) }
        average(.respiratoryRate, HKUnit.count().unitDivided(by: .minute()), start, end, group) { put("resp", $0) }

        // Spot readings: the most recent one, because "now" is the question.
        latest(.oxygenSaturation, .percent(), start, end, group) { put("spo2", $0.map { $0 * 100 }) }
        latest(.bodyMass, .gramUnit(with: .kilo), start, end, group) { put("weightKg", $0) }
        latest(.bodyFatPercentage, .percent(), start, end, group) { put("bodyFatPct", $0.map { $0 * 100 }) }
        latest(.vo2Max, HKUnit(from: "ml/kg*min"), start, end, group) { put("vo2max", $0) }
        if #available(iOS 16.0, *) {
            latest(.appleSleepingWristTemperature, .degreeCelsius(), start, end, group) { put("temp", $0) }
        }

        standHours(start, end, group) { put("standHours", $0) }
        sleep(start, group) { total, rem, deep in
            put("sleepH", total); put("remH", rem); put("swsH", deep)
        }

        group.notify(queue: .main) { call.resolve(out) }
    }

    // MARK: - queries

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private func predicate(_ start: Date, _ end: Date) -> NSPredicate {
        HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    }

    private func statistic(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit,
                           _ start: Date, _ end: Date, _ option: HKStatisticsOptions,
                           _ group: DispatchGroup, _ done: @escaping (Double?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { done(nil); return }
        group.enter()
        let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate(start, end),
                                  options: option) { _, stats, _ in
            let quantity = option == .cumulativeSum ? stats?.sumQuantity() : stats?.averageQuantity()
            done(quantity?.doubleValue(for: unit))
            group.leave()
        }
        store.execute(q)
    }

    private func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ s: Date, _ e: Date,
                     _ g: DispatchGroup, _ done: @escaping (Double?) -> Void) {
        statistic(id, unit, s, e, .cumulativeSum, g, done)
    }

    private func average(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ s: Date, _ e: Date,
                         _ g: DispatchGroup, _ done: @escaping (Double?) -> Void) {
        statistic(id, unit, s, e, .discreteAverage, g, done)
    }

    /*
     * The most recent sample, looking back a week.
     *
     * Deliberately wider than the day being asked about. Blood oxygen, VO2
     * max and a weigh-in are not daily events, and reporting nothing because
     * today happens not to contain one would be showing a gap where there is
     * a perfectly good recent reading. The value is what it is; the day it
     * belongs to is the day it was taken.
     */
    private func latest(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ start: Date, _ end: Date,
                        _ group: DispatchGroup, _ done: @escaping (Double?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { done(nil); return }
        group.enter()
        let from = Calendar.current.date(byAdding: .day, value: -7, to: start) ?? start
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: type, predicate: predicate(from, end),
                              limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            let v = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)
            done(v)
            group.leave()
        }
        store.execute(q)
    }

    /* Stand hours are a category, not a quantity: count the hours in which
       you actually stood, which is what the ring counts. */
    private func standHours(_ start: Date, _ end: Date, _ group: DispatchGroup,
                            _ done: @escaping (Double?) -> Void) {
        guard let type = HKCategoryType.categoryType(forIdentifier: .appleStandHour) else { done(nil); return }
        group.enter()
        let q = HKSampleQuery(sampleType: type, predicate: predicate(start, end),
                              limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            guard let rows = samples as? [HKCategorySample] else { done(nil); group.leave(); return }
            if rows.isEmpty { done(nil); group.leave(); return }
            let stood = rows.filter { $0.value == HKCategoryValueAppleStandHour.stood.rawValue }
            done(Double(stood.count))
            group.leave()
        }
        store.execute(q)
    }

    /*
     * Last night, in hours.
     *
     * The window runs from 6pm the previous evening so a night that began
     * before midnight is not cut in half. Only asleep states count — time in
     * bed awake is not sleep, and counting it is how sleep trackers flatter
     * people. Core, REM and deep are reported separately where the watch
     * distinguished them; an older watch reports undifferentiated "asleep"
     * and the stages are simply absent rather than guessed at.
     */
    private func sleep(_ start: Date, _ group: DispatchGroup,
                       _ done: @escaping (Double?, Double?, Double?) -> Void) {
        guard let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else {
            done(nil, nil, nil); return
        }
        group.enter()
        let cal = Calendar.current
        let from = cal.date(byAdding: .hour, value: -6, to: start) ?? start
        let to = cal.date(byAdding: .hour, value: 18, to: start) ?? Date()
        let q = HKSampleQuery(sampleType: type, predicate: predicate(from, to),
                              limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            guard let rows = samples as? [HKCategorySample], !rows.isEmpty else {
                done(nil, nil, nil); group.leave(); return
            }
            var total = 0.0, rem = 0.0, deep = 0.0
            for r in rows {
                let hours = r.endDate.timeIntervalSince(r.startDate) / 3600
                if #available(iOS 16.0, *) {
                    switch r.value {
                    case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                        rem += hours; total += hours
                    case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                        deep += hours; total += hours
                    case HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                         HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                        total += hours
                    default:
                        break   // inBed and awake are not sleep
                    }
                } else if r.value == HKCategoryValueSleepAnalysis.asleep.rawValue {
                    total += hours
                }
            }
            done(total > 0 ? total : nil,
                 rem > 0 ? rem : nil,
                 deep > 0 ? deep : nil)
            group.leave()
        }
        store.execute(q)
    }
}
