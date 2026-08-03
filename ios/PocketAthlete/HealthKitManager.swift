import Foundation
#if canImport(HealthKit)
import HealthKit
#endif

/// Sleep, HRV and resting heart rate, straight from Apple Health.
///
/// THIS IS WHY THE iOS APP EXISTS. On the web, getting these numbers in means
/// an Apple Shortcut posting JSON to a per-user ingest endpoint — five setup
/// steps most people never finish, and which quietly stop working when they
/// change phones. Here it is one permission sheet and then it is simply true
/// every morning.
///
/// It matters because readiness is the single number this product computes, and
/// its two strongest inputs are the two an athlete is worst at self-reporting.
/// "How did you sleep?" answered by a watch beats the same question answered
/// from memory at 6am.
struct HealthSample: Equatable {
    let date: Date
    var hrvMs: Double?
    var restingHr: Double?
    var sleepHours: Double?
}

@MainActor
final class HealthKitManager: ObservableObject {
    @Published private(set) var latest: HealthSample?
    @Published private(set) var authorised = false
    @Published private(set) var unavailable = false

    #if canImport(HealthKit)
    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var t = Set<HKObjectType>()
        if let hrv = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { t.insert(hrv) }
        if let rhr = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { t.insert(rhr) }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { t.insert(sleep) }
        return t
    }

    /// Ask once. iOS shows the sheet the first time and silently returns after
    /// that, so this is safe to call on every launch.
    func requestAuthorisation() async {
        guard HKHealthStore.isHealthDataAvailable() else { unavailable = true; return }
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            authorised = true
        } catch {
            // Refusal is a legitimate answer, not an error state. The check-in
            // still works by hand; it just asks instead of knowing.
            authorised = false
        }
    }

    /// Read the last `days` of data, newest-day-last.
    ///
    /// Returns [] rather than throwing on every failure path. A readiness score
    /// computed from stale or partial numbers is worse than one that admits it
    /// has none, and the caller already handles empty because the web has
    /// always had that case.
    func read(days: Int = 7) async -> [HealthSample] {
        guard HKHealthStore.isHealthDataAvailable() else { return [] }
        let start = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        var byDay: [Date: HealthSample] = [:]

        func day(_ d: Date) -> Date { Calendar.current.startOfDay(for: d) }
        func put(_ d: Date, _ patch: (inout HealthSample) -> Void) {
            var s = byDay[day(d)] ?? HealthSample(date: day(d))
            patch(&s)
            byDay[day(d)] = s
        }

        if let hrv = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            for s in await samples(hrv, since: start) {
                let v = s.quantity.doubleValue(for: .secondUnit(with: .milli))
                put(s.startDate) { $0.hrvMs = v }
            }
        }
        if let rhr = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            for s in await samples(rhr, since: start) {
                let v = s.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                put(s.startDate) { $0.restingHr = v }
            }
        }
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            for s in await categorySamples(sleepType, since: start) {
                // Only count time actually asleep. `.inBed` includes lying
                // awake reading, and counting it would inflate a bad night into
                // a good one — the exact direction of error that matters here.
                guard isAsleep(s.value) else { continue }
                let hours = s.endDate.timeIntervalSince(s.startDate) / 3600
                // Attributed to the day the sleep ENDED, which is how anyone
                // means "last night", and summed because a night arrives as
                // many fragments — taking the longest would read broken sleep
                // as short sleep.
                put(s.endDate) { $0.sleepHours = ($0.sleepHours ?? 0) + hours }
            }
        }

        return byDay.values
            .map { s in
                var r = s
                if let h = r.sleepHours { r.sleepHours = (h * 10).rounded() / 10 }
                return r
            }
            .sorted { $0.date < $1.date }
    }

    private func isAsleep(_ value: Int) -> Bool {
        if #available(iOS 16.0, *) {
            return [HKCategoryValueSleepAnalysis.asleepCore,
                    .asleepDeep, .asleepREM, .asleepUnspecified]
                .map(\.rawValue).contains(value)
        }
        return value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
    }

    private func samples(_ type: HKQuantityType, since: Date) async -> [HKQuantitySample] {
        await withCheckedContinuation { cont in
            let predicate = HKQuery.predicateForSamples(withStart: since, end: Date())
            let q = HKSampleQuery(sampleType: type, predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, results, _ in
                cont.resume(returning: (results as? [HKQuantitySample]) ?? [])
            }
            store.execute(q)
        }
    }

    private func categorySamples(_ type: HKCategoryType, since: Date) async -> [HKCategorySample] {
        await withCheckedContinuation { cont in
            let predicate = HKQuery.predicateForSamples(withStart: since, end: Date())
            let q = HKSampleQuery(sampleType: type, predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, results, _ in
                cont.resume(returning: (results as? [HKCategorySample]) ?? [])
            }
            store.execute(q)
        }
    }
    #else
    // Keeps the app compiling for targets without HealthKit (macOS previews,
    // and the package building on Linux for a syntax check).
    func requestAuthorisation() async { unavailable = true }
    func read(days: Int = 7) async -> [HealthSample] { [] }
    #endif

    /// Sleep hours mapped onto the 1-10 scale the check-in uses.
    ///
    /// 8h is a 10 and it scales linearly, which is the same shape as the tap
    /// scale's own labels — so importing and tapping agree rather than quietly
    /// disagreeing by a point or two.
    static func sleepQuality(fromHours hours: Double) -> Int {
        min(10, max(1, Int((hours / 8 * 10).rounded())))
    }
}
