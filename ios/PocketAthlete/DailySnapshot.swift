import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// What the home-screen widget shows, and the only thing the app and the widget
/// share.
///
/// WHY A SNAPSHOT RATHER THAN THE WIDGET FETCHING FOR ITSELF. A widget extension
/// is a separate process with its own sandbox, a hard memory ceiling and a
/// runtime budget measured in seconds. It cannot reach the app's Keychain items
/// (different access group), so it has no session, so it cannot call Supabase —
/// and even if it could, doing auth-plus-network on every timeline refresh is
/// how a widget gets killed by the system and shows "Unable to Load" forever.
///
/// So the app does the work while it is in the foreground and writes the answer
/// here. The widget only ever reads a small struct out of shared storage. If the
/// app has not run for a while the widget shows a stale-but-honest number with
/// the date it was from, which is far better than an error card.
///
/// THE APP GROUP MUST EXIST or every read returns nil and the widget renders its
/// placeholder forever — silently, because `UserDefaults(suiteName:)` returns
/// nil rather than throwing. `SharedStore.isConfigured` exists so the app can
/// say so out loud in a debug build instead of shipping a dead widget.
struct DailySnapshot: Codable, Equatable {
    /// `yyyy-MM-dd` the numbers describe — so the widget can say "yesterday"
    /// rather than implying stale data is today's.
    let date: String
    /// 0-100. Nil when they have not checked in on `date` yet.
    let score: Int?
    let status: String?
    let advice: String?
    let streak: Int
    let checkedInToday: Bool

    static let empty = DailySnapshot(date: "", score: nil, status: nil,
                                     advice: nil, streak: 0, checkedInToday: false)
}

enum SharedStore {
    /// Must match the App Group capability on BOTH targets, exactly.
    static let appGroup = "group.com.pocketathlete.app"
    private static let key = "daily_snapshot"

    /// The widget's kind, defined HERE rather than on `ReadinessWidget`.
    ///
    /// The widget type lives in the extension target and is invisible to the
    /// app, so the app cannot name it to request a reload — and this string has
    /// to match on both sides or `reloadTimelines` silently reloads nothing.
    /// A shared constant in a file both targets compile is the only version of
    /// this that cannot drift.
    static let widgetKind = "ReadinessWidget"

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    /// False when the App Group is missing from the entitlements — see above.
    static var isConfigured: Bool { defaults != nil }

    static func save(_ snapshot: DailySnapshot) {
        guard let d = defaults, let data = try? JSONEncoder().encode(snapshot) else { return }
        d.set(data, forKey: key)
        // Ask the system to re-render now rather than waiting for the next
        // budgeted refresh. Without this, checking in and then going to the
        // home screen shows the old score, which reads as the app not working.
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
        #endif
    }

    static func load() -> DailySnapshot? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(DailySnapshot.self, from: data)
    }

    /// Recompute and publish. Called after a successful submit and on app
    /// foreground, which are the only two moments the answer can change.
    ///
    /// TAKES PLAIN VALUES, NOT `Supabase.CheckInRow`. This file compiles into
    /// the widget extension as well as the app, and `Supabase.swift` does not —
    /// naming its nested type here breaks the widget target's build. Keeping the
    /// shared files dependent on nothing but Foundation, `Streak` and
    /// `Readiness` is the rule that keeps that from happening again.
    static func refresh(dates: [String],
                        latestDate: String?,
                        latestInput: CheckInInput?,
                        today: String = Streak.today()) {
        let verdict = latestInput.map { Readiness.assess($0) }
        SharedStore.save(DailySnapshot(
            date: latestDate ?? today,
            score: verdict?.score,
            status: verdict?.status.rawValue,
            advice: verdict?.advice,
            streak: Streak.count(dates: dates, today: today),
            checkedInToday: Streak.checkedInToday(dates: dates, today: today)
        ))
    }
}
