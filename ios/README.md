# PocketAthlete for iOS — native Swift

A real SwiftUI app. Not a webview, not Capacitor, no HTML anywhere in it.

**What changed and when: [`CHANGELOG.md`](CHANGELOG.md)** — versioned, not
dated, because this ships as builds Apple approves rather than continuously.
This file is how to build it; that one is what is in it.

**Completely separate from the web app.** Nothing in `ios/` is imported by the
Next.js build, and `ios/` is excluded from `tsconfig.json` and `.eslintrc.json`,
so `npm run build`, `npm test` and `npm run lint` never see it. The only thing
the two share is the Supabase project they both talk to.

---

## What is actually built

**The daily loop, natively, end to end.** Sign in → check in → readiness
verdict, with Apple Health filling in what it can — then that verdict on the
home screen as a widget, and a reminder that gets you back tomorrow.

The app can now **read** as well as write, which it could not before: it pulls
recent check-ins so the streak, the widget and the reminder all know whether
today is done.

| File | What it is | Target |
|---|---|---|
| `Readiness.swift` | The scoring engine, a faithful port of `lib/readiness.ts` — same weights, same hard limits, same ACWR caps, same advice strings | both |
| `Streak.swift` | Check-in streaks, a faithful port of `checkInStreak` in `lib/load.ts` | both |
| `DailySnapshot.swift` | The struct the app writes and the widget reads, plus the App Group store | both |
| `PocketAthleteTests/ReadinessTests.swift` | The TypeScript suite ported case for case, plus one Swift-only case | tests |
| `PocketAthleteTests/StreakTests.swift` | The streak rules, including the timezone one that was a real bug | tests |
| `HealthKitManager.swift` | Sleep, HRV and resting heart rate from HealthKit | app |
| `Supabase.swift` | Auth + PostgREST over `URLSession`, and a Keychain wrapper | app |
| `Reminders.swift` | The local daily check-in reminder | app |
| `CheckInView.swift` | The check-in: tap scales, soreness, verdict card | app |
| `SettingsView.swift` | Reminder toggle and time, widget status, sign out | app |
| `BodyMap.swift` | Tap-where-it-hurts, same fifteen regions and coordinates as the web | app |
| `PocketAthleteApp.swift` | App entry, sign-in, and the daily-state refresh | app |
| `PocketAthleteWidget/ReadinessWidget.swift` | The home-screen widget | widget |

**"both" means the file must be a member of the app target AND the widget
extension target.** Getting this wrong is the most likely way to break the
build, because the widget cannot see anything it doesn't compile itself.

## The two things a website cannot do

Everything else in here is a second way to do something pocketathlete.com
already does. These two are the actual argument for a native app, and they are
also what Apple's guideline 4.2 wants to see.

**A home-screen widget.** Readiness is exactly the kind of number you want
without opening anything — you glance at it while putting your boots in a bag
and it tells you whether today is hard or easy. Small, medium, and both Lock
Screen accessory families.

It never touches the network. A widget extension is a separate process with a
hard memory ceiling, a runtime budget in seconds, and no access to the app's
Keychain items — so it has no session and cannot call Supabase. Instead the app
writes a small `DailySnapshot` to a shared App Group container while it is in
the foreground, and the widget only ever reads that. If the app has not run for
two days the widget says **"Out of date"** rather than showing a two-day-old
score as if it were today's; a confident wrong number is worse than an obvious
gap when someone is deciding whether to train.

**A daily reminder that knows when to shut up.** Local notifications, not push:
no device-token table, no APNs credentials, no scheduled job, and it works in
aeroplane mode. The device already knows both the time and whether you checked
in.

The rule that matters is that **it does not fire on a day you have already
checked in**. That is the difference between a reminder and a nag, and it is why
most habit apps get their notifications switched off in week two. Notifications
are scheduled ahead of delivery and cannot be conditional at fire time, so the
app cancels and re-schedules on every check-in and every foreground.

Permission is requested when you turn the reminder ON, never at first launch.
iOS gives you exactly one prompt and spending it before someone knows what the
app does earns a permanent "Don't Allow".

**Two decisions worth knowing about.**

*The readiness engine is duplicated, not shared.* There is no way to run
TypeScript in a native app without shipping a JS runtime, which is the thing we
are avoiding. So it is a hand port — and `ReadinessTests.swift` exists precisely
because two implementations drift silently. Someone tunes a weight on the web,
the phone keeps the old one, and the same athlete gets "train" on one device and
"rest" on the other. **Change one engine, change both, run the tests.**

*No Supabase SDK.* `supabase-swift` brings realtime, storage and functions —
none of which this touches, all of which can break a build the week before a
submission. What is needed is a token and three REST calls.

## What is NOT built

Everything else: the programme builder and its engine, nutrition and the meal
planner, the shopping list, video pose analysis, injury and rehab plans, guides,
progress charts, the exercise library, coach/squad, and sign-up with billing.

**That is the honest scope, and it is not a small remainder** — the web app is
~50 modules of tested engine plus 20 screens. Porting it is a multi-month
project, not something to start blind on a machine with no Xcode. The daily loop
is the right first slice: it is what people open every day, and it is the part
that gets most from being native.

Sign-*in* only, for the same reason. Account creation runs through the plan
picker, the onboarding quiz and Stripe; a half-built sign-up that strands
someone mid-flow is worse than sending them to the website for the minute it
takes.

## Build it

Requires macOS and Xcode 15+. **None of this has been compiled or run** — there
is no Swift toolchain in the environment it was written in, so treat the first
build as a real step with real errors, not a formality.

**Minimum deployment target: iOS 17.0.** Not arbitrary — `onChange(of:)` in its
two-parameter form and `containerBackground(for:)` are both iOS 17, and they are
used in `PocketAthleteApp`, `SettingsView` and the widget. Setting it lower gives
compile errors in exactly those three places.

1. Xcode → **File → New → Project → iOS → App**, name it `PocketAthlete`,
   interface **SwiftUI**, language **Swift**. Save it here (`ios/`).
2. Delete the generated `ContentView.swift` and `PocketAthleteApp.swift`, then
   drag in everything from `PocketAthlete/`.
3. Add a **Unit Testing Bundle** target and drag in `PocketAthleteTests/`.
4. **File → New → Target → Widget Extension**, name it `PocketAthleteWidget`,
   **uncheck** "Include Live Activity" and "Include Configuration Intent".
   Delete its generated files and drag in `PocketAthleteWidget/`.
5. **Set the shared files' target membership.** Select `Readiness.swift`,
   `Streak.swift` and `DailySnapshot.swift`, and in the File Inspector tick
   **both** `PocketAthlete` and `PocketAthleteWidget`. Nothing else is shared.
6. **App Group, on both targets.** Signing & Capabilities → **+ Capability →
   App Groups** → add `group.com.pocketathlete.app`, for the app target *and*
   the widget target. It must be identical to `SharedStore.appGroup`.
   **If this is missing the widget silently shows nothing forever** —
   `UserDefaults(suiteName:)` returns nil rather than throwing. Settings inside
   the app reports "Home screen widget: Unavailable" when it isn't set up, which
   is the only way to notice without a device.
7. **Signing & Capabilities** → your team → **+ Capability → HealthKit** (app
   target only).
8. `Info.plist` → add `NSHealthShareUsageDescription`:
   > PocketAthlete reads your sleep, heart-rate variability and resting heart
   > rate to work out how recovered you are and adjust today's session.
9. App icon: `Assets/AppIcon-1024.png` — already 1024×1024 and **opaque**, which
   Apple requires (it rejects alpha and applies its own corner mask).
10. ⌘U to run the tests. **Do that before anything else** — if the ported
    engines disagree with the web, nothing above them is trustworthy.

### A cross-platform bug this work found

`CheckInView.iso` used to format the check-in date in the phone's **local**
timezone. The web app writes `new Date().toISOString().slice(0, 10)`, which is
always **UTC**. East of UTC those disagree for part of every day: an athlete in
Sydney checking in at 9am gets `2026-08-03` from the phone and `2026-08-02` from
the browser, and since the upsert conflict target is `(user_id, check_in_date)`
that is two rows for one morning — a duplicated day, a broken streak, and two
readiness scores for the same check-in.

The phone now matches the web. **Whether both should instead use the athlete's
local day is a genuine open question** — arguably your "today" is wherever you
are standing — but that changes the meaning of every row already stored and
needs one deliberate migration across both clients, not a quiet difference
between them.

## Before submitting

- [ ] `ReadinessTests` and `StreakTests` green
- [ ] Widget actually appears and shows a score on a device — the App Group is
      the single point of silent failure, and the simulator will happily render
      the placeholder forever
- [ ] Reminder tested across a real midnight, having checked in the day before
- [ ] `NSUserNotificationsUsageDescription` is NOT needed (that key doesn't
      exist); the permission prompt is system-supplied. Do not invent one
- [ ] Tested on a real device — HealthKit returns nothing in the simulator
- [ ] Demo account in App Store Connect → App Review Information. The app is
      behind a login; review fails without one, and this rejects more apps than
      anything else on this list
- [ ] Privacy labels: you collect health data. Declare it accurately
- [ ] Age rating — under-16 athletes are in scope
- [ ] **Payments.** Nothing in this build sells anything, which keeps it clear of
      guideline 3.1.1. The moment a paid tier is added it must use In-App
      Purchase (Apple takes 15–30%) — a Stripe checkout inside the app is a
      rejection. Worth deciding before building more, because it changes what
      the subscription code has to look like

Guideline **4.2** (minimum functionality) is not a concern for this build in the
way it would be for a wrapper: it is a native app reading HealthKit, publishing
a home-screen widget and scheduling local notifications. No reviewer will
mistake it for a website.
