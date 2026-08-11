import WidgetKit
import SwiftUI

/// Today's readiness, on the home screen.
///
/// THIS IS THE REASON THE NATIVE APP EXISTS. Everything else in `ios/` is a
/// second way to do something the website already does. A widget is not: iOS has
/// no web equivalent, and readiness is exactly the kind of number you want
/// without opening anything — you glance at it while putting your boots in a
/// bag and it tells you whether today is a hard session or an easy one.
///
/// It reads a snapshot the app wrote (see `DailySnapshot`) and never touches the
/// network. See that file for why.
///
/// HONEST ABOUT STALENESS. If the app has not run for two days the widget says
/// so rather than showing a two-day-old score as if it were today's. A confident
/// wrong number is worse than an obvious gap, because the whole point is making
/// a training decision from it.
struct ReadinessWidget: Widget {
    /// One definition, in a file both targets compile — see `SharedStore`.
    static let kind = SharedStore.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: Provider()) { entry in
            ReadinessWidgetView(entry: entry)
                // A literal, not `Color("WidgetBackground")`. There is no asset
                // catalog in this repo, and a missing named colour does not fail
                // the build — it resolves to clear at runtime, so the widget
                // ships transparent and nobody finds out until it is installed.
                .containerBackground(for: .widget) { Color(red: 0.035, green: 0.035, blue: 0.04) }
        }
        .configurationDisplayName("Readiness")
        .description("Today's readiness score and your check-in streak.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

struct Entry: TimelineEntry {
    let date: Date
    let snapshot: DailySnapshot
    /// Days between the snapshot and now. 0 = today.
    let staleDays: Int
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(),
              snapshot: DailySnapshot(date: Streak.today(), score: 78, status: "Green",
                                      advice: "Good to train.", streak: 5, checkedInToday: true),
              staleDays: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        // Refresh at the next local midnight, not on an interval. The number
        // only changes when the day does or when the athlete checks in — and a
        // check-in reloads the timeline directly from the app. Polling hourly
        // would spend the system's refresh budget to redraw identical pixels.
        let midnight = Calendar.current.nextDate(after: Date(),
                                                 matching: DateComponents(hour: 0, minute: 1),
                                                 matchingPolicy: .nextTime) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [currentEntry()], policy: .after(midnight)))
    }

    private func currentEntry() -> Entry {
        let snap = SharedStore.load() ?? .empty
        var stale = 0
        if let d = Streak.formatter.date(from: snap.date) {
            stale = max(0, Calendar.current.dateComponents([.day], from: d, to: Date()).day ?? 0)
        }
        return Entry(date: Date(), snapshot: snap, staleDays: stale)
    }
}

/// Same three colours the web app and `CheckInView` use.
func statusColour(_ status: String?) -> Color {
    switch status {
    case "Green": return Color(red: 0.20, green: 0.83, blue: 0.60)
    case "Yellow": return Color(red: 0.98, green: 0.75, blue: 0.14)
    case "Red": return Color(red: 0.98, green: 0.36, blue: 0.42)
    default: return Color.secondary
    }
}

struct ReadinessWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry

    private var snap: DailySnapshot { entry.snapshot }
    /// Two days without the app running and the number stops being about today.
    private var tooStale: Bool { entry.staleDays >= 2 }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(snap.score ?? 0), in: 0...100) {
                Image(systemName: "figure.run")
            } currentValueLabel: {
                Text(snap.score.map(String.init) ?? "–")
            }
            .gaugeStyle(.accessoryCircular)

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("Readiness").font(.caption2).foregroundStyle(.secondary)
                Text(headline).font(.headline)
                Text(subline).font(.caption2).foregroundStyle(.secondary)
            }

        default:
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Circle().fill(statusColour(snap.status)).frame(width: 8, height: 8)
                    Text("READINESS")
                        .font(.system(size: 10, weight: .bold)).kerning(0.6)
                        .foregroundStyle(.secondary)
                    Spacer()
                    if snap.streak > 0 {
                        Text("🔥\(snap.streak)").font(.system(size: 11, weight: .bold))
                    }
                }

                Spacer(minLength: 4)

                // The value dwarfs its label — the one thing you are meant to
                // read from two feet away.
                Text(snap.score.map(String.init) ?? "—")
                    .font(.system(size: family == .systemMedium ? 52 : 44, weight: .heavy, design: .rounded))
                    .foregroundStyle(tooStale ? Color.secondary : statusColour(snap.status))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)

                Text(subline)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 0)
            }
            .padding(.vertical, 2)
        }
    }

    private var headline: String {
        if tooStale { return "Out of date" }
        return snap.score.map { "\($0)" } ?? "Not checked in"
    }

    /// The line under the number, in priority order: stale beats un-logged beats
    /// the advice itself. Each case is a different action, so they must not be
    /// collapsed into one string.
    private var subline: String {
        if tooStale { return "Open the app to update" }
        if !snap.checkedInToday { return "Check in to get today's score" }
        return snap.advice ?? "Checked in"
    }
}

@main
struct PocketAthleteWidgetBundle: WidgetBundle {
    var body: some Widget { ReadinessWidget() }
}
