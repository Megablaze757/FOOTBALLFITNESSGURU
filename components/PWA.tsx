"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invalidate } from "@/lib/use-async";
import { flushQueue, browserStore, queueCount, type QueuedCheckIn } from "@/lib/offline-queue";
import { NATIVE_BUILD } from "@/lib/native";
import { currentBrowser, installGuide, type BrowserEnv } from "@/lib/browser";

/**
 * Everything that makes this an app rather than a web page: the service worker,
 * the offline queue drain, and the "add to home screen" prompt.
 *
 * Mounted once in the root layout. Renders nothing except the install banner,
 * and only when there's something to say.
 */
export function PWA() {
  useServiceWorker();
  useQueueDrain();
  return <InstallPrompt />;
}

// --- Service worker ----------------------------------------------------------

function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // NEVER inside the iOS shell. The bundle is already on the device, so the
    // worker caches nothing that isn't local, and its navigation fallback
    // fights Capacitor's own file serving — which surfaces as a blank screen
    // on second launch, the worst possible bug to debug in review.
    if (NATIVE_BUILD) return;
    // Registering during load competes with the page's own requests, so wait
    // until the app is interactive. Nothing here is needed on a first visit.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        // Never fatal: without a worker the app is exactly what it was before.
        console.warn("service worker registration failed", e);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
}

// --- Offline queue -----------------------------------------------------------

/**
 * Push anything logged offline as soon as there's signal.
 *
 * Runs on mount and on every `online` event. The upsert is keyed on
 * (user, date), so replaying an entry that actually did land is a no-op rather
 * than a duplicate.
 */
function useQueueDrain() {
  useEffect(() => {
    let cancelled = false;

    async function drain() {
      const store = browserStore();
      if (cancelled || queueCount(store) === 0) return;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const send = async (item: QueuedCheckIn): Promise<boolean> => {
        // Someone else's queued entry can't be written with this session, and
        // trying would just collect RLS errors until the cap drops it.
        if (item.userId !== user.id) return false;
        const { error } = await supabase.from("daily_check_ins").upsert(
          { user_id: item.userId, check_in_date: item.date, ...item.payload },
          { onConflict: "user_id,check_in_date" },
        );
        if (error) return false;
        if (item.training) {
          await supabase.from("training_logs").upsert(
            { user_id: item.userId, log_date: item.date, ...item.training },
            { onConflict: "user_id,log_date" },
          );
        }
        return true;
      };

      const { sent } = await flushQueue(store, send);
      // Home, Stats and Coach all read check-in data — without this they'd keep
      // showing the pre-sync view until a hard reload.
      if (sent > 0 && !cancelled) invalidate();
    }

    drain();
    window.addEventListener("online", drain);
    return () => { cancelled = true; window.removeEventListener("online", drain); };
  }, []);
}

// --- Install prompt ----------------------------------------------------------

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED = "pa:install-dismissed";

function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [env, setEnv] = useState<BrowserEnv | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Inside the App Store build there is nothing to install, and telling a
    // reviewer to "add this to your home screen" is the single clearest way to
    // say "this is a website" — the exact judgement 4.2 turns on.
    if (NATIVE_BUILD) return;

    const here = currentBrowser();
    // Already installed — nothing to ask for.
    if (here.standalone) return;
    // Asked once and turned down. Nagging on every visit is how a prompt gets
    // ignored permanently.
    try { if (localStorage.getItem(DISMISSED)) return; } catch { /* no storage, show it */ }

    setEnv(here);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's own mini-infobar; we choose the moment
      setDeferred(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* fine */ }
    setDeferred(null);
    setEnv(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!env) return null;
  const guide = installGuide(env);

  return (
    // The bottom tab bar is fixed at bottom-4 with z-[60], so this sat
    // underneath it and "Not now" was physically unpressable on a phone —
    // an install prompt you cannot dismiss is worse than no prompt.
    // Sit above the bar (it hides at lg) and above it in the stack.
    <div className="fixed inset-x-3 bottom-28 z-[70] rounded-2xl border border-white/10 bg-ink-800/95 p-4 shadow-lg backdrop-blur lg:inset-x-auto lg:bottom-4 lg:right-4 lg:w-80">
      <div className="text-sm font-semibold text-slate-100">
        {guide.possible ? "Add PocketAthlete to your home screen" : guide.title}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {guide.possible
          ? "Opens like an app, works without signal, and can remind you to check in."
          : guide.steps[0]}
      </p>

      {/* THE STEPS FOR THE BROWSER THEY ARE ACTUALLY IN.
          There used to be two cases — a button for Chromium, one sentence about
          the Share sheet for iOS Safari — and everybody else got nothing at all.
          Chrome on iPhone is the biggest of those: no iOS browser fires
          `beforeinstallprompt`, and the old test named Safari, so the second
          most common browser on the platform saw a blank screen.

          Collapsed where a button exists, open where the steps ARE the answer,
          because on iOS there is nothing else to offer. */}
      {guide.possible && (
        <details
          open={open || !guide.promptable}
          onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="group mt-2"
        >
          <summary className="tap-target cursor-pointer list-none text-xs font-semibold text-pitch-400">
            {guide.title}
          </summary>
          <ol className="mt-2 space-y-1.5">
            {guide.steps.map((step, i) => (
              <li key={step} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                <span className="shrink-0 font-bold text-pitch-400">{i + 1}</span>{step}
              </li>
            ))}
          </ol>
          {guide.note && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{guide.note}</p>}
        </details>
      )}
      {!guide.possible && (
        <ol className="mt-2 space-y-1.5">
          {guide.steps.slice(1).map((step, i) => (
            <li key={step} className="flex gap-2 text-xs leading-relaxed text-slate-300">
              <span className="shrink-0 font-bold text-pitch-400">{i + 1}</span>{step}
            </li>
          ))}
        </ol>
      )}
      {!guide.possible && guide.note && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{guide.note}</p>
      )}

      <div className="mt-3 flex gap-2">
        {deferred && (
          <button onClick={install} className="tap-target flex-1 rounded-xl bg-pitch-500 px-3 py-2 text-xs font-semibold text-ink-900">
            Install
          </button>
        )}
        <button onClick={dismiss} className="tap-target flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300">
          Not now
        </button>
      </div>
    </div>
  );
}
