import Foundation

/// Recovery engine — readiness scoring.
///
/// A FAITHFUL PORT of `lib/readiness.ts`, not a reinterpretation. The weights,
/// the hard limits, the ACWR caps and the advice strings are the same, because
/// an athlete who checks in on the phone and then opens the website must not be
/// told two different things about the same day. `PocketAthleteTests` ports the
/// TypeScript suite's cases for exactly this reason — if the two ever drift,
/// that is the file that says so.
///
/// Pure and dependency-free, same as the original: no networking, no HealthKit,
/// no SwiftUI. It takes numbers and returns a verdict.
enum ReadinessStatus: String, Codable {
    case green = "Green"
    case yellow = "Yellow"
    case red = "Red"
}

struct ReadinessResult: Equatable {
    let status: ReadinessStatus
    let score: Int
    let advice: String
    let focusBodyPart: String?
}

struct CheckInInput {
    var sleepQuality: Int?
    var fatigueScore: Int?      // higher = more tired = worse
    var nutritionQuality: Int?
    var painMap: [String: Int]

    init(sleepQuality: Int? = nil, fatigueScore: Int? = nil,
         nutritionQuality: Int? = nil, painMap: [String: Int] = [:]) {
        self.sleepQuality = sleepQuality
        self.fatigueScore = fatigueScore
        self.nutritionQuality = nutritionQuality
        self.painMap = painMap
    }
}

enum Readiness {
    /// Any joint at or above this forces Red.
    static let painHardLimit = 7
    /// Sleep at or below this forces Red.
    static let sleepHardLimit = 3

    /// Acute:chronic thresholds. These MUST agree with `lib/load.ts` and with
    /// the TypeScript engine, or the dashboard and the verdict disagree — the
    /// bug that put this context here in the first place.
    static let acwrSpike = 1.5
    static let acwrClimbing = 1.3

    /// Weighted assessment. Score is 0-100, higher = more ready.
    static func assess(_ input: CheckInInput, acwr: Double? = nil) -> ReadinessResult {
        let sleep = clamp1to10(input.sleepQuality)
        let fatigue = clamp1to10(input.fatigueScore)
        let nutrition = clamp1to10(input.nutritionQuality)
        let pain = maxPain(input.painMap)
        let focus = prettyBodyPart(pain.part)

        // Each factor normalised to a 0-1 "good" scale.
        let sleepGood = Double(sleep - 1) / 9
        let fatigueGood = Double(10 - fatigue) / 9   // invert: low fatigue is good
        let nutritionGood = Double(nutrition - 1) / 9
        let painGood = 1 - Double(min(pain.value, 10)) / 10

        // Pain and sleep dominate recovery readiness.
        let score01 = 0.35 * painGood + 0.30 * sleepGood + 0.25 * fatigueGood + 0.10 * nutritionGood
        let score = Int((score01 * 100).rounded())

        var status: ReadinessStatus
        if pain.value >= painHardLimit || sleep <= sleepHardLimit {
            status = .red
        } else if score >= 70 {
            status = .green
        } else if score >= 45 {
            status = .yellow
        } else {
            status = .red
        }

        // A load spike is an injury risk the athlete cannot feel — which is the
        // entire point of measuring it. It only ever caps; it cannot turn a Red
        // day green.
        if let a = acwr, a > acwrSpike, status == .green { status = .yellow }

        return ReadinessResult(
            status: status,
            score: score,
            advice: advice(status, sleep: sleep, fatigue: fatigue, pain: pain, focus: focus, acwr: acwr),
            focusBodyPart: focus
        )
    }

    /// `"knee_left"` -> `"left knee"`.
    static func prettyBodyPart(_ key: String?) -> String? {
        guard let key, !key.isEmpty else { return nil }
        let parts = key.split(separator: "_").map(String.init)
        let side = parts.first { $0 == "left" || $0 == "right" }
        let joint = parts.filter { $0 != "left" && $0 != "right" }.joined(separator: " ")
        return side.map { "\($0) \(joint)" } ?? joint
    }

    // MARK: - Private

    private static func maxPain(_ map: [String: Int]) -> (part: String?, value: Int) {
        var part: String?
        var value = 0
        // Sorted so a tie resolves the same way every run. The TS version walks
        // insertion order; Swift dictionaries have none, and a verdict that
        // names a different joint on each launch would be its own bug.
        for key in map.keys.sorted() {
            let n = map[key] ?? 0
            if n > value { value = n; part = key }
        }
        return (part, value)
    }

    private static func clamp1to10(_ v: Int?) -> Int {
        guard let v else { return 5 } // neutral default, matching the TS engine
        return min(10, max(1, v))
    }

    private static func advice(
        _ status: ReadinessStatus,
        sleep: Int, fatigue: Int,
        pain: (part: String?, value: Int),
        focus: String?, acwr: Double?
    ) -> String {
        // Said first, because when it applies it is the reason for the verdict
        // and the athlete has no other way to know it. A percentage is a
        // sentence you can act on; "1.58" is not.
        if let a = acwr, a > acwrSpike, status != .red {
            let over = Int(((a - 1) * 100).rounded())
            return "You feel recovered, and that's real — but you've trained \(over)% more this week than your four-week "
                 + "average, and that jump is where injuries come from. Train today, keep the intensity, hold the volume "
                 + "where it is rather than adding to it."
        }

        switch status {
        case .red:
            if pain.value >= painHardLimit, let focus {
                return "\(focus.capitalizedFirst) pain is high (\(pain.value)/10). Skip sprints today — focus on gentle mobility and static stretching around the area."
            }
            if sleep <= sleepHardLimit {
                return "Sleep quality is very low (\(sleep)/10). Prioritise rest and light recovery work; heavy training now raises injury risk."
            }
            return "Your overall load is high. Treat today as active recovery: stretching, mobility and hydration."

        case .yellow:
            if let focus, pain.value > 0 {
                return "Mostly recovered, but watch your \(focus) (\(pain.value)/10). Keep intensity moderate and warm up thoroughly."
            }
            if fatigue >= 7 {
                return "Fatigue is elevated. A moderate session is fine — avoid maximal efforts and keep volume in check."
            }
            return "You're moderately ready. Train as planned but listen to your body and ease off if anything flares up."

        case .green:
            if let a = acwr, a > acwrClimbing {
                return "You're well recovered and ready to go. Your load is climbing fast though, so take the intensity, not the extra volume."
            }
            return "You're well recovered and ready to go. Good day for a higher-intensity session."
        }
    }
}

private extension String {
    var capitalizedFirst: String {
        guard let f = first else { return self }
        return f.uppercased() + dropFirst()
    }
}
