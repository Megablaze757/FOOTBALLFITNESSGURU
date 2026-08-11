import XCTest
@testable import PocketAthlete

/// The TypeScript readiness suite, ported case for case.
///
/// WHY EVERY CASE AND NOT A SAMPLE. `Readiness.swift` is a hand port of
/// `lib/readiness.ts`. Two implementations of the same engine drift silently —
/// someone tunes a weight on the web, the phone keeps the old one, and an
/// athlete gets "ready to train" on one device and "rest today" on the other
/// for the same morning. There is no runtime check that can catch that; this
/// file is the check.
///
/// If you change one engine, change both, and run this. If a case here fails,
/// the phone is wrong until proven otherwise — the TypeScript version is the
/// one with 632 tests around it and users on it.
final class ReadinessTests: XCTestCase {

    /// Mirrors `base` in lib/readiness.test.ts.
    private var base: CheckInInput {
        CheckInInput(sleepQuality: 8, fatigueScore: 3, nutritionQuality: 8, painMap: [:])
    }

    func testWellRestedAthleteIsGreen() {
        let r = Readiness.assess(base)
        XCTAssertEqual(r.status, .green)
        XCTAssertGreaterThanOrEqual(r.score, 70)
        XCTAssertNil(r.focusBodyPart)
    }

    func testHighJointPainForcesRedAndNamesTheBodyPart() {
        var input = base
        input.painMap = ["knee_left": 8]
        let r = Readiness.assess(input)
        XCTAssertEqual(r.status, .red)
        XCTAssertEqual(r.focusBodyPart, "left knee")
        XCTAssertTrue(r.advice.lowercased().contains("left knee"))
    }

    func testVeryPoorSleepForcesRed() {
        var input = base
        input.sleepQuality = 2
        XCTAssertEqual(Readiness.assess(input).status, .red)
    }

    func testMiddlingInputsLandInYellow() {
        let input = CheckInInput(sleepQuality: 5, fatigueScore: 7, nutritionQuality: 5,
                                 painMap: ["ankle_right": 4])
        XCTAssertEqual(Readiness.assess(input).status, .yellow)
    }

    func testPrettyBodyPartFormatsSidedJoints() {
        XCTAssertEqual(Readiness.prettyBodyPart("hamstring_right"), "right hamstring")
        XCTAssertEqual(Readiness.prettyBodyPart("lower_back"), "lower back")
        XCTAssertNil(Readiness.prettyBodyPart(nil))
    }

    // MARK: - Training load in the verdict
    //
    // The app used to say "ready to train" on Home while the load panel was
    // red, because readiness scored only how you FEEL. These pin the fix.

    func testLoadSpikeCapsAGreenDayAtYellow() {
        let green = Readiness.assess(base)
        XCTAssertEqual(green.status, .green)

        let spiked = Readiness.assess(base, acwr: 1.8)
        XCTAssertEqual(spiked.status, .yellow,
                       "feeling fine on an 80% load jump is exactly what ACWR is for")
        XCTAssertEqual(spiked.score, green.score,
                       "the spike changes the verdict, not how recovered they are")
    }

    func testSpikeAdviceSaysWhatHappenedAndWhatToDo() {
        let r = Readiness.assess(base, acwr: 1.6)
        XCTAssertTrue(r.advice.contains("60%"), "states the jump as a percentage, not a bare ratio")
        XCTAssertTrue(r.advice.lowercased().contains("volume"), "tells them what to hold back")
    }

    func testLoadNeverRescuesARedDay() {
        var input = base
        input.painMap = ["knee_left": 8]
        XCTAssertEqual(Readiness.assess(input, acwr: 0.5).status, .red,
                       "a low ratio must not talk an injured athlete into training")
    }

    func testLoadInTheSweetSpotLeavesTheVerdictAlone() {
        let plain = Readiness.assess(base)
        let withLoad = Readiness.assess(base, acwr: 1.0)
        XCTAssertEqual(withLoad.status, plain.status)
        XCTAssertEqual(withLoad.advice, plain.advice)
    }

    func testClimbingLoadIsMentionedWithoutDowngradingTheDay() {
        let r = Readiness.assess(base, acwr: 1.4)
        XCTAssertEqual(r.status, .green)
        XCTAssertTrue(r.advice.lowercased().contains("climbing"))
    }

    func testNoLoadDataBehavesExactlyAsBefore() {
        XCTAssertEqual(Readiness.assess(base, acwr: nil), Readiness.assess(base))
    }

    /// Swift-only, because Swift dictionaries have no insertion order and the
    /// TypeScript engine relies on object key order to break a tie. Without the
    /// sort in `maxPain` this returns a different joint per launch.
    func testTiedPainPicksTheSameJointEveryTime() {
        let input = CheckInInput(sleepQuality: 8, fatigueScore: 3, nutritionQuality: 8,
                                 painMap: ["knee_left": 5, "ankle_right": 5, "hip_left": 5])
        let first = Readiness.assess(input).focusBodyPart
        for _ in 0..<50 {
            XCTAssertEqual(Readiness.assess(input).focusBodyPart, first)
        }
    }
}
