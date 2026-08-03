# PocketAthlete for iOS

An App Store build of the existing app, wrapped with [Capacitor]. The web app is
a static export, so there is nothing to port — Capacitor serves the same `out/`
bundle inside a native container.

**Read the "Will Apple accept this?" section before you spend money on a
developer account.** It is the part that decides whether this is worth doing,
and it is not a formality.

---

## What I could and could not do from here

I can't build or sign an iOS app in this environment. `.ipa` production needs
**macOS with Xcode**, and submission needs a paid **Apple Developer Program**
membership (£79/$99 a year). Neither exists here, and no amount of config
changes that.

**What is in this directory and ready to use:**

| File | What it is |
|---|---|
| `capacitor.config.ts` | App id, name, bundled-web-dir, iOS background colour, splash behaviour |
| `package.json` | The four commands you actually run |
| `assets/icon.png` | **1024×1024, opaque, no alpha** — the App Store icon, generated from `public/logo.png` on the app's `#0a0a0b` |
| `assets/splash.png` / `splash-dark.png` | 2732×2732 launch screens, logo well inside the safe area |

**What you have to do on a Mac** — the four commands below, plus signing.

---

## Build it

Requires macOS, Node 22, Xcode 15+, and CocoaPods (`sudo gem install cocoapods`).

```bash
cd mobile
npm install
npm run ios:add     # creates mobile/ios/ — the Xcode project. Once, ever.
npm run assets      # generates every iOS icon + splash size from assets/
npm run sync        # builds the web app, copies it to www/, syncs into iOS
npm run ios:open    # opens Xcode
```

Then in Xcode: select your team under **Signing & Capabilities**, pick a device
or simulator, and Run. To ship: **Product → Archive → Distribute App**.

`npm run sync` is the one you repeat. Every time the web app changes, run it
again and re-archive — the bundle is baked into the binary, so a `git push` does
**not** update the App Store build.

---

## Will Apple accept this?

**I can't promise that, and nobody can.** What follows is the work that moves
the odds, and the specific things that get wrappers rejected.

App Store Review Guideline **4.2 (Minimum Functionality)** rejects apps that are
"simply a repackaged website". You do not argue your way past it — you either
have native capability or you don't.

### The native capability, already written

`lib/native.ts` is the bridge. Everything in it no-ops on the web, so one bundle
serves both. The plugin specifiers are built at runtime, so neither `tsc` nor
the bundler can follow them — **no native code is bundled for the web**, only
the package names as string literals (a few dozen bytes, verified by grepping
`out/`). The imports themselves throw on the web and are caught.

| Capability | Why the web genuinely can't | Status |
|---|---|---|
| **Apple Health** — sleep, HRV, resting HR read straight from HealthKit | On the web this is a five-step Apple Shortcut posting JSON to an ingest endpoint. Most people never finish it. Native, it's one permission prompt. **Readiness is the thing this app computes, and its inputs arrive by themselves.** | `readHealth()` written, untested on device |
| **APNs push** | iOS web push needs the site installed to the home screen, drops subscriptions silently, and can't wake a closed app | `registerNativePush()` written, needs an APNs key |
| **Haptics** | No web equivalent on iOS | `haptic()` written |
| **On-device video pose analysis** | Already native-grade and already shipped — camera plus compute, clip never uploaded | works today |
| **Offline** | Check-ins queue and sync; the programme engine, readiness, calorie targets and the exercise library are all local | works today |

HealthKit is the strongest single item. It is the one a reviewer can see the
point of in ten seconds, and it makes the iOS build genuinely better than the
website rather than merely equal to it. **Wire it into the check-in before you
submit** — an entitlement you declare and never use is worse than not having it.

### What gets it rejected

1. **`server.url`.** Pointing Capacitor at pocketathlete.com is two lines and is
   the most reliable way to fail 4.2. `capacitor.config.ts` bundles `www/`
   deliberately. Don't "simplify" it.
2. **Payments — guideline 3.1.1, the expensive one.** A subscription that
   unlocks features *inside the app* must use **In-App Purchase**; Apple takes
   15–30%. The current Stripe checkout is a violation if it's reachable from
   the iOS build. Three legal options:
   - Add IAP (`@capacitor-community/in-app-purchases`) and reconcile against
     `subscriptions` in Supabase. Most work, best outcome.
   - Ship iOS **free-tier only**, with no purchase path and no mention of one.
   - Keep paid tiers web-only. Permitted **only** if the app neither links to
     nor mentions it — no "subscribe on our site" button, no hint.
3. **No in-app account deletion** — guideline 5.1.1(v). `/delete-account`
   exists and Profile calls it; verify that path works in the native build.
4. **Inaccurate privacy labels.** You collect health-adjacent data (injuries,
   HRV, sleep, weight). Declare it honestly in App Store Connect. Health data
   claims are checked.
5. **A HealthKit entitlement with no usage strings.** `Info.plist` needs
   `NSHealthShareUsageDescription` saying plainly why you read it, e.g.
   *"PocketAthlete reads your sleep, HRV and resting heart rate to work out how
   recovered you are and adjust today's session."* Vague strings get rejected on
   their own.
6. **Demo account missing.** The app is behind a login. Review **will** fail
   unless you put working credentials in App Store Connect → App Review
   Information. This rejects more apps than 4.2 does.

### Pre-submission checklist

- [ ] HealthKit wired into the check-in and visibly changing readiness
- [ ] `NSHealthShareUsageDescription` + `NSCameraUsageDescription` in `Info.plist`
- [ ] HealthKit capability enabled in Xcode → Signing & Capabilities
- [ ] Push: APNs key uploaded, `registerNativePush()` token stored per user
- [ ] Payments: one of the three options above chosen and enforced
- [ ] Account deletion works in the native build
- [ ] Demo account in App Review Information
- [ ] Privacy labels completed
- [ ] Age rating set — under-16 athletes are in scope
- [ ] Tested on a real device, not just the simulator (camera and HealthKit need one)

## Two things that need changing for native, and one that doesn't

**Doesn't:** the Cloudflare Worker's CORS is `Access-Control-Allow-Origin: *`,
so the `capacitor://localhost` origin reaches the API with no change.

**Does — password reset.** `app/login/page.tsx` builds its redirect from
`window.location.origin`, which on native is `capacitor://localhost`. An email
link pointing there opens nothing. Register a custom scheme
(`pocketathlete://`), add it to Supabase → Authentication → URL Configuration →
Redirect URLs, and branch on `Capacitor.isNativePlatform()`.

**Done — the service worker.** `public/sw.js` is pointless inside a native shell
(the bundle is already local) and its navigation fallback fights Capacitor's own
file serving, which surfaces as a blank screen on second launch — the worst
possible bug to hit during review. `NEXT_PUBLIC_NATIVE=1` (set by `build:web`)
now skips both the worker registration and the "add to home screen" prompt, the
latter because telling a reviewer to install a home-screen shortcut is the
clearest possible way to say "this is a website".

---

## Android

`npx cap add android` works from the same config and the same `www/`. Google
Play has no 4.2 equivalent and permits Stripe for digital goods far more
readily, so it is the easier of the two. Left out here because you asked for
Apple.

[Capacitor]: https://capacitorjs.com/docs/ios
