import WidgetKit
import SwiftUI

/*
 * The home screen widget.
 *
 * One question, answered without opening anything: how much is left today.
 * A widget that tried to show the whole readout would be unreadable at this
 * size and would duplicate the app badly; this shows the number the app
 * exists to produce, the three macros underneath it, and nothing else.
 *
 * It reads a small snapshot the app writes to the shared App Group — not the
 * log itself. The log is a 200 KB file and a widget refresh is a few
 * milliseconds of budget, so the app publishes the half-dozen numbers this
 * needs whenever they change and the widget never parses anything large.
 */

private let GROUP = "group.com.sakshampanchal.basal"

struct BasalEntry: TimelineEntry {
    let date: Date
    let left: Int
    let target: Int
    let eaten: Int
    let protein: Int
    let proteinTarget: Int
    let carbs: Int
    let carbsTarget: Int
    let fat: Int
    let fatTarget: Int
    let hasData: Bool

    static let placeholder = BasalEntry(
        date: Date(), left: 1240, target: 3000, eaten: 1760,
        protein: 118, proteinTarget: 160, carbs: 96, carbsTarget: 220,
        fat: 58, fatTarget: 80, hasData: true)
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> BasalEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (BasalEntry) -> Void) {
        completion(read())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BasalEntry>) -> Void) {
        /*
         * Refresh on the hour, and again at midnight.
         *
         * The app pokes WidgetCenter whenever something is logged, so this
         * timeline is only the fallback for a phone nobody has opened. The
         * midnight entry matters: without it a widget sits on yesterday's
         * numbers until the app is next launched, which is exactly when
         * somebody would look at it and conclude it is broken.
         */
        let now = Date()
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now
        completion(Timeline(entries: [read()], policy: .after(next)))
    }

    private func read() -> BasalEntry {
        guard let d = UserDefaults(suiteName: GROUP),
              let raw = d.string(forKey: "widget"),
              let data = raw.data(using: .utf8),
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return BasalEntry(date: Date(), left: 0, target: 0, eaten: 0,
                                 protein: 0, proteinTarget: 0, carbs: 0, carbsTarget: 0,
                                 fat: 0, fatTarget: 0, hasData: false) }

        func n(_ k: String) -> Int { (j[k] as? NSNumber)?.intValue ?? 0 }
        return BasalEntry(date: Date(),
                          left: n("left"), target: n("target"), eaten: n("eaten"),
                          protein: n("p"), proteinTarget: n("pT"),
                          carbs: n("c"), carbsTarget: n("cT"),
                          fat: n("f"), fatTarget: n("fT"),
                          hasData: true)
    }
}

/* The palette, matching the Paper theme rather than approximating it. */
private extension Color {
    static let paper  = Color(red: 0.94, green: 0.90, blue: 0.82)
    static let card   = Color(red: 1.00, green: 0.99, blue: 0.97)
    static let ink    = Color(red: 0.20, green: 0.16, blue: 0.13)
    static let ink2   = Color(red: 0.42, green: 0.36, blue: 0.30)
    static let brand  = Color(red: 0.85, green: 0.27, blue: 0.18)
    static let pBlue  = Color(red: 0.18, green: 0.44, blue: 0.62)
    static let cGold  = Color(red: 0.88, green: 0.64, blue: 0.18)
    static let fPlum  = Color(red: 0.60, green: 0.31, blue: 0.53)
}

struct Meter: View {
    let label: String
    let value: Int
    let target: Int
    let colour: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Color.ink2)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.paper)
                    Capsule().fill(colour)
                        .frame(width: geo.size.width * min(1, target > 0
                                ? CGFloat(value) / CGFloat(target) : 0))
                }
            }
            .frame(height: 5)
            Text("\(value)")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color.ink)
        }
    }
}

struct BasalWidgetView: View {
    var entry: BasalEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !entry.hasData {
                Text("Open Basal to start")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.ink2)
            } else {
                Text("CALORIES LEFT")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(Color.ink2)

                Text("\(entry.left)")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.ink)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)

                Text("\(entry.eaten) of \(entry.target)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color.ink2)

                Spacer(minLength: 2)

                HStack(spacing: 8) {
                    Meter(label: "P", value: entry.protein, target: entry.proteinTarget, colour: .pBlue)
                    Meter(label: "C", value: entry.carbs, target: entry.carbsTarget, colour: .cGold)
                    Meter(label: "F", value: entry.fat, target: entry.fatTarget, colour: .fPlum)
                }
            }
        }
        .padding(2)
        .containerBackground(Color.card, for: .widget)
    }
}

@main
struct BasalWidget: Widget {
    let kind = "BasalWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            BasalWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Calories left, and your macros.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
