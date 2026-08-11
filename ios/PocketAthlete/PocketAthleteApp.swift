import SwiftUI

@main
struct PocketAthleteApp: App {
    @State private var signedIn = false
    @State private var checked = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if !checked {
                    ProgressView().tint(.accentColor)
                } else if signedIn {
                    CheckInView()
                } else {
                    SignInView { signedIn = true; Task { await Self.syncDailyState() } }
                }
            }
            .preferredColorScheme(.dark)   // the app is dark end to end
            .tint(Color(red: 0.89, green: 0.71, blue: 0.25))  // #e3b53f
            .task {
                await Supabase.shared.restore()
                signedIn = await Supabase.shared.isSignedIn
                checked = true
                if signedIn { await Self.syncDailyState() }
            }
            // The widget and the reminder are both driven by "have they checked
            // in today", and that answer goes stale while the app is in the
            // background — most obviously across midnight, when yesterday's
            // green score is still on the home screen at 7am. Foregrounding is
            // the cheapest honest moment to fix it.
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active, signedIn else { return }
                Task { await Self.syncDailyState() }
            }
        }
    }

    /// Pull recent check-ins, republish the widget snapshot, re-arm the reminder.
    ///
    /// Best effort on purpose: a failed refresh must never block the app or
    /// throw a dialog. The widget keeps its previous snapshot, which is stale
    /// but labelled as such, and the reminder keeps whatever it had.
    static func syncDailyState() async {
        guard let rows = try? await Supabase.shared.recentCheckIns(limit: 40) else { return }
        SharedStore.refresh(dates: rows.map(\.check_in_date),
                            latestDate: rows.first?.check_in_date,
                            latestInput: rows.first?.input)
        let snap = SharedStore.load() ?? .empty
        await Reminders.refresh(checkedInToday: snap.checkedInToday, streak: snap.streak)
    }
}

/// Sign in only — no sign-up here yet.
///
/// Deliberate: account creation involves the plan picker, the onboarding quiz
/// and Stripe, none of which are ported, and a half-built sign-up that strands
/// someone mid-flow is worse than sending them to the website for the one
/// minute it takes. See ios/README.md.
struct SignInView: View {
    var onSignedIn: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("PocketAthlete")
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(Color.accentColor)
            Text("Welcome back, athlete.").font(.subheadline).foregroundStyle(.secondary)

            TextField("Email", text: $email)
                .textContentType(.emailAddress).keyboardType(.emailAddress)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            SecureField("Password", text: $password)
                .textContentType(.password)

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
            }

            Button {
                busy = true; error = nil
                Task {
                    do { try await Supabase.shared.signIn(email: email, password: password); onSignedIn() }
                    catch { self.error = error.localizedDescription }
                    busy = false
                }
            } label: {
                Text(busy ? "Signing in…" : "Sign in")
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
            }
            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(.black).fontWeight(.bold)
            .disabled(busy || email.isEmpty || password.isEmpty)

            Spacer()
        }
        .textFieldStyle(.roundedBorder)
        .padding(28)
        .background(Color(red: 0.035, green: 0.035, blue: 0.04).ignoresSafeArea())
    }
}
