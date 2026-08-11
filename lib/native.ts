/**
 * The native bridge.
 *
 * WHY THIS FILE EXISTS AT ALL. The same bundle ships to a browser and to an
 * iOS container, so every native capability has to be optional at runtime.
 * Everything here answers "is there a native host?" first and no-ops on the
 * web, which means calling sites don't branch and the web build doesn't grow
 * by a single Capacitor byte — the imports are dynamic and only ever resolve
 * inside the shell.
 *
 * WHAT MAKES THE iOS BUILD WORTH SHIPPING. App Store Review Guideline 4.2
 * rejects "a repackaged website", and the honest defence is not an argument,
 * it's capability. These are the things the web genuinely cannot do:
 *
 *   - HealthKit. Sleep, HRV and resting heart rate read straight from Apple
 *     Health. On the web this is an Apple Shortcut posting JSON to an ingest
 *     endpoint — a setup guide with five steps that most people never finish.
 *     Native, it is one permission prompt. Readiness is THE thing this app
 *     computes, and its inputs arrive by themselves.
 *   - Real push. iOS web push requires the site to be installed to the home
 *     screen, silently drops subscriptions, and cannot wake a closed app.
 *     APNs can.
 *   - Haptics. Small, but a check-in that answers back feels like an app.
 *
 * NOTHING HERE IS TESTED ON DEVICE. It cannot be from this environment — see
 * mobile/README.md. It is written to be correct and to fail safe; treat the
 * first run on a Mac as the real test.
 */

/**
 * Load a Capacitor plugin that only exists inside the native shell.
 *
 * The specifier is built at runtime so TypeScript cannot resolve it and the
 * bundler cannot follow it. That is deliberate, not a trick: these packages are
 * dependencies of `mobile/`, not of the web app, so a static import would fail
 * `tsc` here and pull native code into a browser bundle there. Everything that
 * calls this already handles a null.
 */
async function plugin<T = Record<string, unknown>>(name: string): Promise<T | null> {
  try {
    const specifier = name; // indirection: keeps this out of the module graph
    return (await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier)) as T;
  } catch {
    return null;
  }
}

/** True inside the Capacitor shell. False in every browser, including the PWA. */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * Set at build time by `mobile/package.json`'s `build:web`.
 *
 * Distinct from `isNative()` on purpose: this is known during the build, so it
 * can strip things that must never exist in the bundle (the service worker),
 * whereas `isNative()` is a runtime question about the current host.
 */
export const NATIVE_BUILD = process.env.NEXT_PUBLIC_NATIVE === "1";

// --- Apple Health ------------------------------------------------------------

export interface HealthSample {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  hrv?: number | null;        // ms, SDNN
  restingHr?: number | null;  // bpm
  sleepHours?: number | null;
}

/**
 * Read the last `days` of sleep, HRV and resting heart rate from Apple Health.
 *
 * Returns [] on the web, on refusal, and on any plugin error — a readiness
 * score that silently uses stale numbers is worse than one that admits it has
 * none, and every caller already handles an empty result because the web has
 * always had one.
 */
export async function readHealth(days = 7): Promise<HealthSample[]> {
  if (!isNative()) return [];
  try {
    const mod = await plugin<{ CapacitorHealthkit?: unknown }>("@perfood/capacitor-healthkit");
    const HealthKit = mod?.CapacitorHealthkit as {
      requestAuthorization(o: unknown): Promise<void>;
      queryHKitSampleType(o: unknown): Promise<{ resultData?: unknown[] }>;
    } | undefined;
    if (!HealthKit) return [];

    const read = ["HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
                  "HKQuantityTypeIdentifierRestingHeartRate",
                  "HKCategoryTypeIdentifierSleepAnalysis"];
    await HealthKit.requestAuthorization({ all: [], read, write: [] });

    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const now = new Date().toISOString();
    const byDate = new Map<string, HealthSample>();
    const put = (date: string, patch: Partial<HealthSample>) => {
      byDate.set(date, { ...(byDate.get(date) ?? { date }), ...patch, date });
    };

    for (const sampleName of read) {
      const res = await HealthKit.queryHKitSampleType({
        sampleName, startDate: since, endDate: now, limit: 0,
      }).catch(() => ({ resultData: [] as unknown[] }));

      for (const row of (res.resultData ?? []) as Record<string, unknown>[]) {
        const start = typeof row.startDate === "string" ? row.startDate : null;
        if (!start) continue;
        const date = start.slice(0, 10);
        const value = typeof row.value === "number" ? row.value : null;
        if (value == null) continue;

        if (sampleName.includes("HeartRateVariability")) put(date, { hrv: Math.round(value) });
        else if (sampleName.includes("RestingHeartRate")) put(date, { restingHr: Math.round(value) });
        else if (sampleName.includes("SleepAnalysis")) {
          // Sleep arrives as many intervals per night; sum their durations
          // rather than taking the longest, or a broken night reads as short
          // sleep when it was actually fragmented sleep.
          const prev = byDate.get(date)?.sleepHours ?? 0;
          const dur = typeof row.duration === "number" ? row.duration / 3600 : 0;
          put(date, { sleepHours: Math.round((prev + dur) * 10) / 10 });
        }
      }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// --- Push --------------------------------------------------------------------

/**
 * Register for APNs and hand the token back for storage against the user.
 *
 * Null on the web (where `usePush` already handles VAPID) and on refusal.
 */
export async function registerNativePush(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const mod = await plugin<{ PushNotifications?: unknown }>("@capacitor/push-notifications");
    const Push = mod?.PushNotifications as {
      requestPermissions(): Promise<{ receive: string }>;
      register(): Promise<void>;
      addListener(e: string, cb: (d: { value?: string }) => void): Promise<unknown>;
    } | undefined;
    if (!Push) return null;

    const perm = await Push.requestPermissions();
    if (perm.receive !== "granted") return null;

    return await new Promise<string | null>((resolve) => {
      // A permission prompt the user ignores would otherwise hang this promise
      // forever, and with it whatever awaited it.
      const timer = setTimeout(() => resolve(null), 10_000);
      void Push.addListener("registration", (t) => { clearTimeout(timer); resolve(t.value ?? null); });
      void Push.addListener("registrationError", () => { clearTimeout(timer); resolve(null); });
      void Push.register();
    });
  } catch {
    return null;
  }
}

// --- Haptics -----------------------------------------------------------------

/** A tap you can feel. Silent no-op everywhere else. */
export async function haptic(style: "light" | "medium" | "success" = "light"): Promise<void> {
  if (!isNative()) return;
  try {
    const H = await plugin<{ Haptics?: unknown; ImpactStyle?: Record<string, string>; NotificationType?: Record<string, string> }>("@capacitor/haptics");
    const Haptics = H?.Haptics as { impact(o: unknown): Promise<void>; notification(o: unknown): Promise<void> } | undefined;
    if (!Haptics) return;
    if (style === "success") await Haptics.notification({ type: H?.NotificationType?.Success ?? "SUCCESS" });
    else await Haptics.impact({ style: H?.ImpactStyle?.[style === "medium" ? "Medium" : "Light"] ?? "LIGHT" });
  } catch {
    /* a missing buzz is not worth an error path */
  }
}
