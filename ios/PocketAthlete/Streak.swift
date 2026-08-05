import Foundation

/// Check-in streaks.
///
/// A FAITHFUL PORT of `checkInStreak` in `lib/load.ts`, for the same reason
/// `Readiness.swift` is one: the number on the phone's home screen widget and
/// the number on the website are the same claim about the same person, and an
/// athlete who sees "12 days" in one place and "11 days" in the other stops
/// believing either. `StreakTests` ports the behaviour case for case.
///
/// THE ONE SUBTLE RULE, carried over exactly: if today has not been logged yet,
/// the count starts at yesterday rather than returning 0. Someone opening the
/// app at 8am has not broken a twelve-day streak — they simply have not checked
/// in *yet*, and telling them the streak is gone at breakfast is how you lose
/// the streak for real.
///
/// Pure and dependency-free: strings in, integer out. No networking, no
/// Foundation date maths beyond a fixed UTC calendar.
enum Streak {
    /// ISO `yyyy-MM-dd` in the athlete's **local** timezone.
    ///
    /// THIS WAS UTC AND IT WAS WRONG — on both platforms. The web used
    /// `toISOString().slice(0, 10)` everywhere and this matched it, so the two
    /// agreed with each other and were both wrong about the same thing: UTC's
    /// day is not the day the athlete is living in.
    ///
    /// Checking in at 8am in Sydney filed the row under yesterday. Three hours
    /// later the app asked for today, found nothing, and showed an empty form —
    /// the check-in had been saved and the app had forgotten it. In the UK on
    /// BST the same thing happened to anyone checking in between midnight and
    /// 1am. `lib/day.ts` on the web is the other half of this fix; the two must
    /// stay in step, which is what `testCheckInViewUsesTheSameDateAsTheStreakEngine`
    /// is for.
    ///
    /// A day here is a human unit — the day you trained, the day you slept
    /// badly, the day your streak counts. That is always the local day.
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        // Explicitly `.current`, not merely the default: this is the decision,
        // and it should be visible rather than inherited.
        f.timeZone = .current
        // POSIX locale still matters — a device on a non-Gregorian calendar
        // would otherwise format dates Postgres cannot match.
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func today() -> String { formatter.string(from: Date()) }

    /// Consecutive days checked in, counting back from `today`.
    static func count(dates: [String], today: String = Streak.today()) -> Int {
        let set = Set(dates)
        guard var cursor = formatter.date(from: today) else { return 0 }

        // Today not logged yet? Start from yesterday — see the note above.
        if !set.contains(today) { cursor = cursor.addingTimeInterval(-86_400) }

        var streak = 0
        while set.contains(formatter.string(from: cursor)) {
            streak += 1
            cursor = cursor.addingTimeInterval(-86_400)
        }
        return streak
    }

    /// Whether `dates` includes today. Decides whether the reminder fires and
    /// what the widget says, so it is worth having one definition of it.
    static func checkedInToday(dates: [String], today: String = Streak.today()) -> Bool {
        dates.contains(today)
    }
}
