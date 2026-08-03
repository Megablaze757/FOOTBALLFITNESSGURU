import SwiftUI

/// Reminder, widget status, sign out.
///
/// Deliberately four rows. Everything else about this account — plan, billing,
/// sport, position, squad — lives on the website and is not worth a half-port
/// that can strand someone mid-flow. What is here is what only the phone can do.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var remindersOn = Reminders.isEnabled
    @State private var reminderTime: Date = {
        var c = DateComponents()
        c.hour = Reminders.time.hour
        c.minute = Reminders.time.minute
        return Calendar.current.date(from: c) ?? Date()
    }()
    @State private var permissionDenied = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Daily check-in reminder", isOn: $remindersOn)
                        .onChange(of: remindersOn) { _, on in
                            Task { await toggle(on) }
                        }

                    if remindersOn {
                        DatePicker("Remind me at", selection: $reminderTime, displayedComponents: .hourAndMinute)
                            .onChange(of: reminderTime) { _, t in
                                let c = Calendar.current.dateComponents([.hour, .minute], from: t)
                                Reminders.time = (c.hour ?? Reminders.defaultHour, c.minute ?? 0)
                                Task { await rearm() }
                            }
                    }
                } header: {
                    Text("Reminder")
                } footer: {
                    // Says the thing that makes people leave it switched on.
                    Text(permissionDenied
                         ? "Notifications are turned off for PocketAthlete. Settings › Notifications › PocketAthlete to allow them."
                         : "It skips any day you've already checked in — it won't nag you for something you've done.")
                }

                Section {
                    LabeledContent("Home screen widget") {
                        Text(SharedStore.isConfigured ? "Ready" : "Unavailable")
                            .foregroundStyle(SharedStore.isConfigured ? .green : .red)
                    }
                } footer: {
                    // A widget that silently never loads is the worst outcome,
                    // and the App Group is the only thing that can cause it.
                    Text(SharedStore.isConfigured
                         ? "Long-press the home screen, tap +, and search PocketAthlete."
                         : "The App Group isn't configured on this build, so the widget can't read your score. See ios/README.md.")
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        Task {
                            await Reminders.disable()
                            await Supabase.shared.signOut()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func toggle(_ on: Bool) async {
        guard on else {
            await Reminders.disable()
            permissionDenied = false
            return
        }
        // Asked here, at the moment they opt in — not on first launch. iOS gives
        // you exactly one prompt, and spending it before someone knows what the
        // app does is how you get a permanent "Don't Allow".
        let granted = await Reminders.requestPermission()
        guard granted else {
            permissionDenied = true
            remindersOn = false
            Reminders.isEnabled = false
            return
        }
        permissionDenied = false
        Reminders.isEnabled = true
        await rearm()
    }

    private func rearm() async {
        let snap = SharedStore.load() ?? .empty
        await Reminders.refresh(checkedInToday: snap.checkedInToday, streak: snap.streak)
    }
}
