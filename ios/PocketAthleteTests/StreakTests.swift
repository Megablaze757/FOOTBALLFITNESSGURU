import XCTest
@testable import PocketAthlete

/// Ports the behaviour of `checkInStreak` in `lib/load.ts`.
///
/// Same reason `ReadinessTests` exists: two implementations of one rule drift
/// silently, and this one is visible on the home screen. The web app has no
/// direct unit test for the "today not logged yet" rule, so these cases are
/// derived from the source's stated behaviour and pin it on both sides.
final class StreakTests: XCTestCase {

    func testEmptyIsZero() {
        XCTAssertEqual(Streak.count(dates: [], today: "2026-08-03"), 0)
    }

    func testTodayOnlyIsOne() {
        XCTAssertEqual(Streak.count(dates: ["2026-08-03"], today: "2026-08-03"), 1)
    }

    func testConsecutiveRunEndingToday() {
        let dates = ["2026-08-03", "2026-08-02", "2026-08-01", "2026-07-31"]
        XCTAssertEqual(Streak.count(dates: dates, today: "2026-08-03"), 4)
    }

    /// THE RULE THAT MATTERS. Nothing logged today, but yesterday was — the
    /// streak is intact, not broken. Someone opening the app at 8am has not
    /// lost anything yet.
    func testTodayNotLoggedYetCountsFromYesterday() {
        let dates = ["2026-08-02", "2026-08-01", "2026-07-31"]
        XCTAssertEqual(Streak.count(dates: dates, today: "2026-08-03"), 3)
    }

    func testGapBreaksTheRun() {
        // 31st missing, so it stops at the 1st.
        let dates = ["2026-08-03", "2026-08-02", "2026-08-01", "2026-07-30"]
        XCTAssertEqual(Streak.count(dates: dates, today: "2026-08-03"), 3)
    }

    func testNeitherTodayNorYesterdayIsZero() {
        let dates = ["2026-08-01", "2026-07-31"]
        XCTAssertEqual(Streak.count(dates: dates, today: "2026-08-03"), 0)
    }

    func testDuplicatesDoNotInflate() {
        let dates = ["2026-08-03", "2026-08-03", "2026-08-02"]
        XCTAssertEqual(Streak.count(dates: dates, today: "2026-08-03"), 2)
    }

    func testOrderDoesNotMatter() {
        let dates = ["2026-08-01", "2026-08-03", "2026-08-02"]
        XCTAssertEqual(Streak.count(dates: dates, today: "2026-08-03"), 3)
    }

    /// Crossing a month boundary backwards, which is where hand-rolled date
    /// maths usually breaks.
    func testCrossesMonthBoundary() {
        let dates = ["2026-08-02", "2026-08-01", "2026-07-31", "2026-07-30"]
        XCTAssertEqual(Streak.count(dates: dates, today: "2026-08-02"), 4)
    }

    /// And a leap day, for the same reason.
    func testCrossesLeapDay() {
        let dates = ["2028-03-01", "2028-02-29", "2028-02-28"]
        XCTAssertEqual(Streak.count(dates: dates, today: "2028-03-01"), 3)
    }

    func testCheckedInToday() {
        XCTAssertTrue(Streak.checkedInToday(dates: ["2026-08-03"], today: "2026-08-03"))
        XCTAssertFalse(Streak.checkedInToday(dates: ["2026-08-02"], today: "2026-08-03"))
    }

    /// The formatter must use the DEVICE's day, and a fixed locale.
    ///
    /// Local is the decision (see `Streak.formatter`) — UTC is what lost
    /// check-ins. The locale is separate and still matters: a device set to a
    /// non-Gregorian calendar would otherwise format dates Postgres cannot
    /// match.
    func testFormatterUsesTheLocalCalendar() {
        let d = Date(timeIntervalSince1970: 1_785_888_000) // some fixed instant
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        let parts = cal.dateComponents([.year, .month, .day], from: d)
        let expected = String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
        XCTAssertEqual(Streak.formatter.string(from: d), expected)
    }

    func testFormatterIsFixedLocale() {
        XCTAssertEqual(Streak.formatter.locale.identifier, "en_US_POSIX")
        XCTAssertEqual(Streak.formatter.dateFormat, "yyyy-MM-dd")
    }

    /// `CheckInView` writes the date it saves under; it must agree with the
    /// engine that counts them, or every streak is off by the timezone offset.
    func testCheckInViewUsesTheSameDateAsTheStreakEngine() {
        let now = Date()
        XCTAssertEqual(CheckInView.iso(now), Streak.formatter.string(from: now))
    }
}
