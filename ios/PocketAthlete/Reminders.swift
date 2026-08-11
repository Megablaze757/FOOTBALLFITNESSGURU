import Foundation
import UserNotifications

/// The daily check-in reminder.
///
/// WHY LOCAL, NOT PUSH. A push reminder needs a server that knows the time in
/// the athlete's pocket, a device-token table, APNs credentials and a scheduled
/// job — and it fires whether or not they already checked in, because the server
/// finds out late. A local notification needs none of that, works with the phone
/// in aeroplane mode, and the device already knows both the time and the answer.
/// This also keeps the app clear of a whole class of privacy-label questions.
///
/// THE PART THAT MATTERS: it does not fire if you already checked in. That one
/// rule is the difference between a reminder and a nag, and it is the reason
/// most habit apps get their notifications switched off in week two. Because
/// notifications are scheduled ahead of time and cannot be conditional at
/// delivery, the app cancels and re-schedules whenever the answer changes —
/// see `refresh(checkedInToday:)`.
enum Reminders {
    private static let identifier = "daily-checkin"
    private static let hourKey = "reminder_hour"
    private static let minuteKey = "reminder_minute"
    private static let enabledKey = "reminder_enabled"

    /// 8am — before training, after waking. Overridable in Settings.
    static let defaultHour = 8
    static let defaultMinute = 0

    static var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? false }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    static var time: (hour: Int, minute: Int) {
        get {
            let d = UserDefaults.standard
            guard d.object(forKey: hourKey) != nil else { return (defaultHour, defaultMinute) }
            return (d.integer(forKey: hourKey), d.integer(forKey: minuteKey))
        }
        set {
            UserDefaults.standard.set(newValue.hour, forKey: hourKey)
            UserDefaults.standard.set(newValue.minute, forKey: minuteKey)
        }
    }

    /// Ask once, when they turn the reminder on — never on first launch.
    ///
    /// A permission prompt before the person knows what the app does is the
    /// fastest way to a permanent "Don't Allow", and iOS only lets you ask once.
    /// After that the only route back is Settings, which nobody takes.
    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// Cancel and re-schedule to match the current state.
    ///
    /// Called after every check-in and on foreground. Cheap, idempotent, and the
    /// only way to keep a pre-scheduled notification honest about a condition
    /// that changes after it was scheduled.
    static func refresh(checkedInToday: Bool, streak: Int) async {
        let centre = UNUserNotificationCenter.current()
        centre.removePendingNotificationRequests(withIdentifiers: [identifier])

        guard isEnabled else { return }
        // Already logged today? The next useful reminder is tomorrow, and
        // `UNCalendarNotificationTrigger` with `repeats: true` will do exactly
        // that on its own — but only once today's slot has passed. Scheduling it
        // while today's time is still ahead would fire at 8am for someone who
        // checked in at 7. So: skip today explicitly.
        let now = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let (h, m) = time
        let slotHasPassed = (now.hour ?? 0) > h || ((now.hour ?? 0) == h && (now.minute ?? 0) >= m)
        if checkedInToday && !slotHasPassed { return }

        let content = UNMutableNotificationContent()
        content.title = "Morning — how did you sleep?"
        // The streak is the reason to open it, so it goes in the body when there
        // is one worth protecting. Below three days it isn't leverage, it's
        // pressure about nothing.
        content.body = streak >= 3
            ? "Thirty seconds keeps your \(streak)-day streak and tunes today's session."
            : "Thirty seconds and today's session is tuned to how you actually feel."
        content.sound = .default

        var when = DateComponents()
        when.hour = h
        when.minute = m
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: true)
        )
        try? await centre.add(request)
    }

    /// Turn off and clear anything pending.
    static func disable() async {
        isEnabled = false
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [identifier])
    }
}
