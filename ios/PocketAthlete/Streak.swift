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
    /// ISO `yyyy-MM-dd`, UTC. The dates coming out of Postgres are already in
    /// this shape and the web engine compares them as plain strings, so this
    /// does too — no time zone can shift a day boundary underneath the count.
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(secondsFromGMT: 0)
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
