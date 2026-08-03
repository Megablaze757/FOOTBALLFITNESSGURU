# PocketAthlete for iOS — native Swift

A real SwiftUI app. Not a webview, not Capacitor, no HTML anywhere in it.

**Completely separate from the web app.** Nothing in `ios/` is imported by the
Next.js build, and `ios/` is excluded from `tsconfig.json` and `.eslintrc.json`,
so `npm run build`, `npm test` and `npm run lint` never see it. The only thing
the two share is the Supabase project they both talk to.

---

## What is actually built

**The daily loop, natively, end to end.** Sign in → check in → readiness
verdict, with Apple Health filling in what it can.

| File | What it is |
|---|---|
| `Readiness.swift` | The scoring engine, a faithful port of `lib/readiness.ts` — same weights, same hard limits, same ACWR caps, same advice strings |
| `PocketAthleteTests/ReadinessTests.swift` | The TypeScript suite ported case for case, plus one Swift-only case |
| `HealthKitManager.swift` | Sleep, HRV and resting heart rate from HealthKit |
| `Supabase.swift` | Auth + PostgREST over `URLSession`, and a Keychain wrapper |
| `CheckInView.swift` | The check-in: tap scales, soreness, verdict card |
| `BodyMap.swift` | Tap-where-it-hurts, same fifteen regions and coordinates as the web |
| `PocketAthleteApp.swift` | App entry and sign-in |

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

Requires macOS and Xcode 15+. **None of this has run on a device** — it cannot
from the environment it was written in.

1. Xcode → **File → New → Project → iOS → App**, name it `PocketAthlete`,
   interface **SwiftUI**, language **Swift**. Save it here (`ios/`).
2. Delete the generated `ContentView.swift` and `PocketAthleteApp.swift`, then
   drag in everything from `PocketAthlete/`.
3. Add a **Unit Testing Bundle** target and drag in `PocketAthleteTests/`.
4. **Signing & Capabilities** → your team → **+ Capability → HealthKit**.
5. `Info.plist` → add `NSHealthShareUsageDescription`:
   > PocketAthlete reads your sleep, heart-rate variability and resting heart
   > rate to work out how recovered you are and adjust today's session.
6. App icon: `Assets/AppIcon-1024.png` — already 1024×1024 and **opaque**, which
   Apple requires (it rejects alpha and applies its own corner mask).
7. ⌘U to run the tests. **Do that before anything else** — if the ported engine
   disagrees with the web, nothing above it is trustworthy.

## Before submitting

- [ ] `ReadinessTests` green
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
way it would be for a wrapper: it is a native app reading HealthKit, and no
reviewer will mistake it for a website.
