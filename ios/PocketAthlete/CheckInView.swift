import SwiftUI

/// The daily check-in — three taps, and the readiness verdict.
///
/// The same shape as the web quick check-in, deliberately: sleep and body as
/// tap scales rather than sliders, soreness behind a yes/no because most days
/// nothing hurts, and no mode switch. That form took a year of trimming to
/// reach ten seconds; there is nothing to be gained by redesigning it here.
///
/// What is different, and the reason this app is worth building: sleep, HRV and
/// resting heart rate can arrive from Apple Health instead of from memory.
struct CheckInView: View {
    @StateObject private var health = HealthKitManager()

    @State private var sleep = 6
    @State private var fatigue = 4
    @State private var sore = false
    @State private var painMap: [String: Int] = [:]
    @State private var result: ReadinessResult?
    @State private var healthSummary: String?
    @State private var saving = false
    @State private var error: String?
    @State private var showSettings = false
    /// Read once for the header, refreshed whenever the snapshot is republished.
    @State private var streak = SharedStore.load()?.streak ?? 0

    private let sleepOptions = [("😵", "Barely", 2), ("😴", "Poorly", 4), ("😐", "OK", 6), ("🙂", "Well", 8), ("🤩", "Great", 10)]
    private let bodyOptions  = [("⚡", "Fresh", 2), ("💪", "Good", 4), ("😐", "OK", 6), ("🥱", "Heavy", 8), ("🪫", "Wrecked", 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Streak on the left, settings on the right. The streak is the
                // one piece of state worth seeing before you decide whether to
                // bother today, and it is the only reason the read path exists.
                HStack {
                    if streak > 0 {
                        Text("🔥 \(streak)-day streak")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Color.accentColor)
                    }
                    Spacer()
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                            .font(.system(size: 17))
                            .foregroundStyle(.secondary)
                            // 44pt, because a 17pt glyph is a 17pt target.
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Settings")
                }
                .padding(.bottom, -8)

                if let result {
                    VerdictCard(result: result)
                        .transition(.scale.combined(with: .opacity))
                }

                healthRow

                TapScale(label: "How did you sleep?", options: sleepOptions, value: $sleep)
                TapScale(label: "How does the body feel?", options: bodyOptions, value: $fatigue)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Anything hurting?").font(.caption).foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        choice("No, all good", selected: !sore) { sore = false; painMap = [:] }
                        choice("Yes — show me", selected: sore) { sore = true }
                    }
                    if sore { BodyMap(pain: $painMap) }
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }

                Button(action: save) {
                    Text(saving ? "Saving…" : "Save check-in")
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 16))
                .foregroundStyle(.black).fontWeight(.bold)
                .disabled(saving)
            }
            .padding(20)
        }
        .background(Color(red: 0.035, green: 0.035, blue: 0.04).ignoresSafeArea())
        .task {
            await health.requestAuthorisation()
            await pullHealth()   // silent on launch; the button is for retrying
            streak = SharedStore.load()?.streak ?? 0
        }
        .sheet(isPresented: $showSettings) {
            SettingsView().preferredColorScheme(.dark)
        }
        .animation(.snappy, value: result)
    }

    // MARK: - Apple Health

    @ViewBuilder private var healthRow: some View {
        if health.unavailable {
            EmptyView()   // iPad or simulator without Health — say nothing
        } else if let healthSummary {
            Label(healthSummary, systemImage: "heart.fill")
                .font(.footnote).foregroundStyle(.green)
        } else {
            Button { Task { await pullHealth() } } label: {
                Label("Fill from Apple Health", systemImage: "heart.fill").font(.footnote)
            }
        }
    }

    private func pullHealth() async {
        let rows = await health.read(days: 2)
        // Last night is recorded against the day it ended, but a late sync can
        // leave today empty — fall back to the newest row rather than reporting
        // nothing when there is something.
        guard let row = rows.last else { return }
        if let hours = row.sleepHours {
            sleep = HealthKitManager.sleepQuality(fromHours: hours)
        }
        healthSummary = [
            row.sleepHours.map { String(format: "%.1fh sleep", $0) },
            row.hrvMs.map { "HRV \(Int($0))ms" },
            row.restingHr.map { "RHR \(Int($0))" },
        ].compactMap { $0 }.joined(separator: " · ")

        // Best-effort: the check-in works without it, the trend just misses a day.
        try? await Supabase.shared.saveBiometrics(
            date: Self.iso(row.date), hrv: row.hrvMs,
            restingHr: row.restingHr, sleepHours: row.sleepHours
        )
    }

    // MARK: - Save

    private func save() {
        saving = true; error = nil
        let input = CheckInInput(sleepQuality: sleep, fatigueScore: fatigue,
                                 nutritionQuality: 6, painMap: painMap)
        // Scored on the device, before the network call. The verdict is the
        // whole reason to check in, so it must not wait on a request that might
        // fail — the web app queues offline for the same reason.
        let verdict = Readiness.assess(input)
        result = verdict

        Task {
            do {
                try await Supabase.shared.saveCheckIn([
                    "sleep_quality": sleep,
                    "fatigue_score": fatigue,
                    "nutrition_quality": 6,
                    "pain_map": painMap,
                    "readiness_score": verdict.score,
                    "readiness_status": verdict.status.rawValue,
                ], date: Self.iso(Date()))
            } catch {
                // The verdict stays on screen. Losing it because the upload
                // failed would punish the athlete for our network.
                self.error = "Saved on this phone — couldn't sync yet. \(error.localizedDescription)"
            }
            saving = false

            // Publish today's answer to the home-screen widget and stand the
            // reminder down. Doing this here rather than only on foreground
            // matters: checking in and immediately swiping home is the single
            // most likely next action, and seeing yesterday's score there would
            // read as the check-in not having worked.
            //
            // Written from the local verdict first so the widget is right even
            // if the upload failed, then reconciled from the server.
            let previous = SharedStore.load()
            // Today already counted? Then the streak is unchanged (this is a
            // re-submit). Otherwise today extends it by one.
            let optimisticStreak = (previous?.checkedInToday ?? false)
                ? (previous?.streak ?? 1)
                : (previous?.streak ?? 0) + 1
            SharedStore.save(DailySnapshot(
                date: Self.iso(Date()),
                score: verdict.score,
                status: verdict.status.rawValue,
                advice: verdict.advice,
                streak: optimisticStreak,
                checkedInToday: true
            ))
            await PocketAthleteApp.syncDailyState()
            streak = SharedStore.load()?.streak ?? streak
        }
    }

    /// UTC, because that is what the web app writes.
    ///
    /// THIS USED TO BE `.current` AND THAT WAS A BUG. The web computes the
    /// check-in date as `new Date().toISOString().slice(0, 10)` — always UTC.
    /// This wrote the phone's local date. East of UTC the two disagree for part
    /// of every day: an athlete in Sydney checking in at 9am gets `2026-08-03`
    /// from the phone and `2026-08-02` from the browser. The upsert conflict
    /// target is `(user_id, check_in_date)`, so those are two rows for one
    /// morning — a duplicated day, a broken streak, and two different readiness
    /// scores for the same check-in.
    ///
    /// Matching the web is the fix available here. Whether BOTH should move to
    /// the athlete's local day is a real question — arguably your "today" is
    /// wherever you are standing — but that changes the meaning of every
    /// existing row and belongs in one deliberate migration across both
    /// clients, not in a quiet difference between them.
    static func iso(_ d: Date) -> String {
        Streak.formatter.string(from: d)
    }

    // MARK: - Bits

    private func choice(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity).padding(.vertical, 12)
        }
        .foregroundStyle(selected ? Color.accentColor : .secondary)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(selected ? Color.accentColor.opacity(0.5) : .white.opacity(0.1))
                .background(RoundedRectangle(cornerRadius: 16).fill(selected ? Color.accentColor.opacity(0.1) : .white.opacity(0.02)))
        )
    }
}

/// Five taps, not a slider. A slider asks for a precision nobody has about how
/// they slept, and it takes two hands.
private struct TapScale: View {
    let label: String
    let options: [(String, String, Int)]
    @Binding var value: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 8) {
                ForEach(options, id: \.2) { emoji, name, v in
                    Button { value = v } label: {
                        VStack(spacing: 2) {
                            Text(emoji).font(.title3)
                            Text(name).font(.system(size: 10))
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                    }
                    .foregroundStyle(value == v ? Color.accentColor : .secondary)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .strokeBorder(value == v ? Color.accentColor.opacity(0.5) : .white.opacity(0.1))
                            .background(RoundedRectangle(cornerRadius: 14).fill(value == v ? Color.accentColor.opacity(0.1) : .white.opacity(0.02)))
                    )
                }
            }
        }
    }
}

private struct VerdictCard: View {
    let result: ReadinessResult

    private var tint: Color {
        switch result.status {
        case .green: return .green
        case .yellow: return .yellow
        case .red: return .red
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(result.score)").font(.system(size: 40, weight: .black, design: .rounded))
                    .foregroundStyle(tint)
                Text(result.status.rawValue).font(.headline).foregroundStyle(tint)
                Spacer()
            }
            Text(result.advice).font(.subheadline).foregroundStyle(.primary.opacity(0.85))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18).fill(tint.opacity(0.08)))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(tint.opacity(0.3)))
    }
}
