# PocketAthlete for iOS — changelog

Everything built in `ios/` so far, newest first.

**Why this is separate from the root `CHANGELOG.md`.** That one is dated rather
than versioned, because the web app ships continuously from `main` and there is
nothing to pin a semver to. This app is the opposite: it ships as discrete
builds that a human submits and Apple approves, users sit on old versions for
weeks, and "which version has the widget" is a question someone will actually
need answered. So this one is versioned.

**Nothing here has been compiled or run.** There is no Swift toolchain and no
Mac in the environment this was written in. Every version below is source that
has been reviewed and reasoned about, not source that is known to build. Treat
the first `⌘B` as a real step. See *Known risks* at the bottom.

---

## 0.2.0 — The widget, the reminder, and the ability to read

The app could write a check-in and never see one again: `Supabase.swift` had no
GET at all. That is fine for a form and useless for an app — no streak, no
history, and reopening on a day you had already logged showed an empty form as
if you hadn't. Adding a read path is what makes the rest of this possible.

### Added

- **`Supabase.recentCheckIns(limit:)`** — the first read in the app. No
  `user_id` filter is sent: RLS on `daily_check_ins` is the real boundary, and a
  client-side filter would imply the security lives here.
- **`Streak.swift`** — check-in streaks, a faithful port of `checkInStreak` in
  `lib/load.ts`. Carries the one subtle rule exactly: if today has not been
  logged *yet*, the count starts at yesterday rather than returning 0. Someone
  opening the app at 8am has not broken a twelve-day streak, and telling them it
  is gone at breakfast is how you lose the streak for real.
- **`StreakTests.swift`** — eleven cases including month boundaries, a leap day,
  duplicates, unordered input, and the timezone rule described below.
- **`DailySnapshot.swift`** — the small struct the app writes and the widget
  reads, plus the App Group store.
- **`PocketAthleteWidget/ReadinessWidget.swift`** — the home-screen widget.
  `.systemSmall`, `.systemMedium`, `.accessoryCircular`, `.accessoryRectangular`.
- **`Reminders.swift`** — the local daily check-in reminder.
- **`SettingsView.swift`** — reminder on/off and time, widget status, sign out.
  Reached from a gear in the check-in header, which also now shows the streak.

### The two things a website cannot do

Everything before this release was a second way to do something
pocketathlete.com already does. These are the actual argument for a native app,
and they are what Apple's guideline 4.2 wants to see.

**The widget never touches the network.** A widget extension is a separate
process with a hard memory ceiling, a runtime budget measured in seconds, and no
access to the app's Keychain items — so it has no session and *cannot* call
Supabase. Even if it could, doing auth-plus-network on every timeline refresh is
how a widget gets killed by the system and shows "Unable to Load" forever. So
the app does the work in the foreground and writes the answer to a shared
container; the widget only reads a struct.

It refreshes at the next local midnight rather than on an interval, because the
number only changes when the day does or when the athlete checks in — and a
check-in reloads the timeline directly. Polling hourly would spend the system's
refresh budget redrawing identical pixels.

**After two days without the app running the widget says "Out of date"** rather
than showing a two-day-old score as if it were today's. A confident wrong number
is worse than an obvious gap when someone is using it to decide whether to
train.

**The reminder does not fire on a day you have already checked in.** That single
rule is the difference between a reminder and a nag, and it is why most habit
apps get their notifications switched off in week two. Because notifications are
scheduled ahead of delivery and cannot be conditional at fire time, the app
cancels and re-schedules on every check-in and every foreground.

Local, not push: no device-token table, no APNs credentials, no scheduled job,
works in aeroplane mode, and it keeps the app clear of a whole class of privacy
questions. The device already knows both the time and the answer.

Permission is requested when the reminder is switched **on**, never at first
launch. iOS gives you exactly one prompt, and spending it before someone knows
what the app does earns a permanent "Don't Allow" that only a trip to Settings
can undo.

### Fixed — a cross-platform bug, found by porting the streak

`CheckInView` formatted the check-in date in the phone's **local** timezone. The
web app writes `new Date().toISOString().slice(0, 10)` — always **UTC**.

East of UTC those disagree for part of every day. An athlete in Sydney checking
in at 9am gets `2026-08-03` from the phone and `2026-08-02` from the browser,
and because the upsert conflict target is `(user_id, check_in_date)` those are
two rows for one morning: a duplicated day, a broken streak, and two different
readiness scores for the same check-in.

The phone matches the web now. **Whether both should instead use the athlete's
local day is still open** — arguably your "today" is wherever you are standing —
but that changes the meaning of every row already stored and needs one
deliberate migration across both clients, not a quiet difference between them.

### Caught in review, before they shipped

No compiler here, so these were found by reading:

- `SharedStore.refresh` took a `Supabase.CheckInRow`, in a file that compiles
  into the **widget** target — which has no `Supabase.swift`. It would have
  failed the widget build. It takes plain values now, and the rule is written
  down: shared files depend on nothing but Foundation, `Streak` and `Readiness`.
- The widget used `Color("WidgetBackground")`, an asset that does not exist in
  this repo. A missing named colour **does not fail the build** — it resolves to
  clear at runtime, so the widget would have shipped transparent and nobody
  would have found out until it was installed.
- `SharedStore` named `ReadinessWidget.kind`, which the app target cannot see.
  The kind string now lives in the shared file, because it has to match on both
  sides or `reloadTimelines` silently reloads nothing.

### Operator notes

- **Minimum deployment target is now iOS 17.0.** `onChange(of:)` in its
  two-parameter form and `containerBackground(for:)` are both iOS 17.
- **An App Group must be added to both targets** (`group.com.pocketathlete.app`).
  If it is missing the widget shows nothing forever, silently, because
  `UserDefaults(suiteName:)` returns nil rather than throwing. Settings reports
  the status in-app for exactly that reason.
- Three files must belong to **both** targets: `Readiness.swift`, `Streak.swift`,
  `DailySnapshot.swift`.

---

## 0.1.0 — The daily loop, natively

Sign in → check in → readiness verdict, with Apple Health filling in what it
can. Replaced a Capacitor scaffold from the same day: a webview wrapper is the
wrong answer to "put it on the App Store" — it invites Guideline 4.2, and it was
not what was asked for.

### Added

- **`Readiness.swift`** — the scoring engine, a faithful port of
  `lib/readiness.ts`. Same weights, hard limits, ACWR caps and advice strings.
- **`ReadinessTests.swift`** — the TypeScript suite ported case for case,
  because two implementations of one engine drift silently: someone tunes a
  weight on the web, the phone keeps the old one, and the same athlete is told
  "train" on one device and "rest" on the other. Plus one Swift-only case —
  Swift dictionaries have no insertion order, so a tie on pain would otherwise
  name a different joint per launch.
- **`HealthKitManager.swift`** — sleep, HRV and resting heart rate. Counts only
  time actually asleep (`.inBed` includes lying awake reading, and counting it
  turns a bad night into a good one), attributes a night to the day it ended,
  and sums fragments rather than taking the longest.
- **`Supabase.swift`** — auth and PostgREST over `URLSession`, no SDK.
  `supabase-swift` brings realtime, storage and functions, none of which this
  touches and all of which can break a build the week before a submission.
  Refresh token in the Keychain, not UserDefaults. Writes
  `source: "apple_health"` because `biometrics_source_check` does not permit
  `'healthkit'` — the best-effort write would have failed silently.
- **`CheckInView.swift` / `BodyMap.swift`** — tap scales rather than sliders,
  soreness behind a yes/no, and the same fifteen body regions and coordinates as
  the web, so a left knee marked on the phone is a left knee on the site.
- **`PocketAthleteApp.swift`** — app entry and sign-in.

Sign-*in* only. Account creation runs through the plan picker, the onboarding
quiz and Stripe; a half-built sign-up that strands someone mid-flow is worse
than sending them to the website for the minute it takes.

---

## Not built

The programme builder and its engine, nutrition and the meal planner, the
shopping list, video pose analysis, injury and rehab plans, guides, progress
charts, the exercise library, coach/squad, and sign-up with billing.

**That is the honest scope, and it is not a small remainder.** The web app is
~50 modules of tested engine plus 20 screens. Porting it is a multi-month
project. The daily loop was the right first slice: it is what people open every
day, and it is the part that gains most from being native.

## Known risks

1. **Nothing has been compiled.** Reviewed, not built. Three real errors were
   caught by reading in 0.2.0 alone, which is the honest indicator of how many
   might remain.
2. **Nothing has run on a device.** HealthKit returns nothing in the simulator,
   and the widget will render its placeholder there whether or not the App Group
   is correct.
3. **Two engines, one truth.** `Readiness` and `Streak` are duplicated from
   TypeScript by hand. Change one, change both, run the tests — that is what the
   test files are for.
4. **Payments.** Nothing in this build sells anything, which keeps it clear of
   guideline 3.1.1. The moment a paid tier is added it must use In-App Purchase
   (Apple takes 15–30%); a Stripe checkout inside the app is a rejection. Worth
   deciding before building more, because it changes what the subscription code
   has to look like.

`README.md` has the Xcode setup and the pre-submission checklist.
