"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { createClient } from "@/lib/supabase/client";
import { invokeAI } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { syncHealth, daysSinceSync } from "@/lib/biometrics";
import { useAppleShortcut } from "@/lib/apple-shortcut";

/**
 * Connect a wearable so it uploads on its own.
 *
 * WearableImport (below this on the check-in) still handles typing today's
 * numbers and importing a CSV export. Both are user-initiated, and the honest
 * thing to say about a daily habit that needs a manual export is that it
 * happens once — readiness leans on HRV and resting HR, and data that arrives
 * monthly is data that never arrives.
 *
 * WHAT EACH VENDOR ACTUALLY ALLOWS decides what this component can offer, and
 * the differences are not the ones people expect:
 *
 *   Oura   — a public API with personal access tokens. Paste one and it works.
 *            No app registration, no approval, no OAuth round trip.
 *   Apple  — no web API, and there won't be one; HealthKit data never leaves
 *            the phone except through an app you install. A Shortcut CAN read
 *            Health and POST it on a schedule, so that's the path, and it needs
 *            a credential the phone can hold.
 *   Whoop  — a real OAuth API, gated behind registering an application.
 *   Garmin — gated behind the Connect Developer Program, which is an
 *            application and a commercial agreement.
 *
 * The last two are NOT listed. They each had a greyed-out row explaining the
 * developer programme in the way — all true, and none of it the athlete's
 * problem. Two dead entries in a list of four made the whole feature look
 * half-built, and someone with a Whoop wants to know what to do rather than why
 * they can't do the other thing. They get one line pointing at the CSV importer,
 * which reads their exports today. The rows can come back the day the
 * applications are approved.
 */
export function WearableConnect({ userId }: { userId: string }) {
  const [open, setOpen] = useState<"oura" | "apple" | null>(null);
  // Published by an admin (migration 0103), or the build-time fallback.
  const shortcut = useAppleShortcut();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    // wearable_status, not wearable_connections — the tokens are deliberately
    // unreadable from the client, even by the athlete who supplied them. See
    // migration 0065.
    const { data: status } = await supabase.from("wearable_status").select("*");
    const { data: profile } = await supabase.from("profiles").select("ingest_token").eq("id", userId).maybeSingle();
    return {
      status: (status ?? []) as { provider: string; connected: boolean; last_sync_at: string | null; last_error: string | null }[],
      ingestToken: (profile as { ingest_token?: string | null } | null)?.ingest_token ?? null,
    };
  }, [userId], `wearables:${userId}`);

  const oura = data?.status.find((s) => s.provider === "oura");
  /**
   * "Connected" is not the same as "working". A sync that stops running writes
   * no error — the cron is simply not firing — so last_error stays null and the
   * row went on saying "Syncing" over a date that never moved, while readiness
   * kept reporting last week's sleep as though it were last night's.
   */
  const ouraSync = syncHealth(oura?.last_sync_at);
  const ouraDays = daysSinceSync(oura?.last_sync_at);

  return (
    <div className="card p-5">
      <h2 data-tip="connect-wearable" className="field-label !mb-1">🔗 Connect a wearable</h2>
      <p className="mb-3 text-xs text-slate-400">
        So last night&apos;s sleep and HRV are already there when you open the app, instead of being typed in.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />)}
        </div>
      ) : (
        <ul className="space-y-2">
          <Row
            name="Oura Ring"
            icon="💍"
            state={
              !oura?.connected ? "available"
                : oura.last_error || ouraSync === "stale" ? "error"
                : "connected"
            }
            detail={
              oura?.connected
                ? oura.last_error
                  ? `Last sync failed — ${oura.last_error}`
                  : ouraSync === "stale"
                    ? `No data for ${ouraDays} days. Your readiness is being worked out from the last night that arrived — reconnect to fix it.`
                    : ouraSync === "fresh"
                      ? `Syncing. Last update ${new Date(oura.last_sync_at!).toLocaleDateString()}.`
                      : "Connected, but nothing has arrived yet. Give it until tomorrow morning."
                : "Paste a personal access token and it syncs every night."
            }
            onClick={() => setOpen(open === "oura" ? null : "oura")}
            action={oura?.connected ? "Reconnect" : "Connect"}
          />
          {open === "oura" && <OuraForm onDone={reload} />}

          <Row
            name="Apple Health"
            icon="🍎"
            state={data?.ingestToken ? "connected" : "available"}
            detail={
              data?.ingestToken
                ? "Set up. Your Shortcut sends to the app whenever you like."
                : shortcut
                  ? "Add our ready-made Shortcut, paste one link, and your sleep is there every morning."
                  : "Optional. You can type your sleep in below — this is for never typing it again."
            }
            onClick={() => setOpen(open === "apple" ? null : "apple")}
            action={data?.ingestToken ? "Show setup" : "Set up"}
          />
          {open === "apple" && <AppleSetup token={data?.ingestToken ?? null} shortcut={shortcut} onDone={reload} />}

          {/* EVERYTHING ELSE IS A CSV, and that's all this needs to say.
              Whoop and Garmin used to sit here as their own rows, greyed out,
              each explaining the developer programme standing in the way. All
              true, and none of it the athlete's problem — two dead entries in a
              list of four made the whole feature look half-built, and a person
              with a Whoop wants to know what to do, not why they can't do the
              other thing. The answer is one line, and the importer is directly
              below it. */}
          <li className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Whoop, Garmin, anything else?</span>{" "}
            Export your data from their app and use <span className="text-slate-200">Import CSV</span> just
            below — it reads sleep, HRV and resting heart rate from most exports.
          </li>
        </ul>
      )}
    </div>
  );
}

function Row({ name, icon, state, detail, onClick, action }: {
  name: string;
  icon: string;
  state: "connected" | "available" | "error";
  detail: string;
  onClick?: () => void;
  action?: string;
}) {
  const dot = state === "connected" ? "bg-readiness-green"
    : state === "error" ? "bg-readiness-red" : "bg-slate-500";

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <span className="text-lg" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="truncate text-sm font-bold text-slate-100">{name}</span>
        </span>
        <span className="mt-0.5 block text-xs text-slate-400">{detail}</span>
      </span>
      {onClick && action && (
        <button onClick={onClick} className="chip shrink-0 text-accent-400 hover:bg-white/[0.08]">{action}</button>
      )}
    </li>
  );
}

function OuraForm({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function connect() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      // The server verifies the token against Oura and pulls a week of history
      // before storing anything, so "Connected" means it actually worked.
      const res = await invokeAI<{ days?: number }>("connect-wearable", { provider: "oura", token: token.trim() });
      setMsg(`Connected — imported ${res?.days ?? 0} day(s) of sleep and HRV.`);
      setToken("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs text-slate-400">
        <li>Open <span className="text-slate-200">cloud.ouraring.com</span> and sign in.</li>
        <li>Go to <span className="text-slate-200">Personal Access Tokens</span> and create one.</li>
        <li>Paste it here.</li>
      </ol>
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Personal access token"
        className="field"
        autoComplete="off"
        spellCheck={false}
      />
      <button onClick={connect} disabled={busy || token.trim().length < 20} className="btn-primary mt-2 disabled:opacity-40">
        {busy ? "Checking with Oura…" : "Connect"}
      </button>
      {err && <p className="mt-2 text-sm text-readiness-red">{err}</p>}
      {msg && <p className="mt-2 text-sm text-accent-400">{msg}</p>}
      <p className="mt-2 text-xs text-slate-500">
        The token is stored server-side and never sent back to this page — not even to you. Disconnect
        by creating a new one on Oura&apos;s site, which invalidates this one.
      </p>
    </li>
  );
}

function AppleSetup({ token, shortcut, onDone }: { token: string | null; shortcut: string | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<{ token: string; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /**
   * Show the link in full, unmasked and selectable.
   *
   * Masking is right by default — this URL carries a token that writes
   * biometrics for the account, and it renders on a screen people hand around.
   * But it must always be possible to SEE it: the whole point of this panel is
   * to get that string into another app, and a value nobody can read or select
   * has no manual fallback when the clipboard refuses.
   */
  const [reveal, setReveal] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  /**
   * The endpoint a Shortcut posts to — the Supabase Edge Function.
   *
   * IT USED TO BE THE CLOUDFLARE WORKER, WHICH 404'd. Every configured
   * Shortcut posted into a void, silently, every morning. At the time the
   * Worker in production was built from source nobody had, so "deploy the
   * repo's Worker" would have deleted the live AI provider chain — the sync
   * moved to a Supabase function that deploys on its own.
   *
   * The Worker now serves the route (it is in sync with this repo), so that
   * 404 is history — but it accepts POST + Bearer only, and the guide teaches
   * a bare GET with the token in the query string because that is one action
   * in Shortcuts rather than six. So this stays pointed at Supabase, and the
   * reason is now a shape difference rather than a missing deployment.
   *
   * Derived from NEXT_PUBLIC_SUPABASE_URL, which is always set — the app cannot
   * function without it. So unlike the old NEXT_PUBLIC_API_URL, this can never
   * render as a relative path that silently goes nowhere.
   */
  const fnBase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const ingestUrl = `${fnBase}/functions/v1/wearable-ingest`;
  const shown = minted ?? (token && fnBase ? { token, url: ingestUrl } : null);

  /**
   * IS THE ENDPOINT ACTUALLY THERE?
   *
   * For the entire life of this feature it was not: the function this guide
   * points at had never been deployed, so every Shortcut built against it
   * posted into a 404 every morning. The guide was five careful steps to
   * nowhere. It is deployed now — but the probe stays, because the thing that
   * made that so expensive was not the outage, it was that nothing said so.
   *
   * A bare GET is the cheapest possible probe and it is safe: the function
   * answers a link with no metrics on it with "your link works", writes
   * nothing, and an undeployed function answers 404 with a body naming itself.
   *
   * "unknown" while it is in flight, so the guide is never hidden because the
   * network was slow — only when we have actually been told it is missing.
   */
  const [endpoint, setEndpoint] = useState<"unknown" | "live" | "missing">("unknown");
  useEffect(() => {
    if (!fnBase) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(ingestUrl, { method: "GET" });
        if (!cancelled) setEndpoint(res.status === 404 ? "missing" : "live");
      } catch {
        // Offline or blocked: not evidence of anything, so say nothing.
        if (!cancelled) setEndpoint("unknown");
      }
    })();
    return () => { cancelled = true; };
  }, [fnBase, ingestUrl]);

  /**
   * ONE LINK, WITH THE CREDENTIAL ALREADY IN IT.
   *
   * The old setup handed over a URL and a header value, and step four was: tap
   * Show More, change the method to POST, add an Authorization header, paste,
   * switch the body to JSON, add three fields, map each to a Health result. On
   * a phone. Every one of those sub-steps served the transport rather than the
   * athlete, and most people stopped somewhere in the middle — a setup nobody
   * finishes is a feature nobody has.
   *
   * The endpoint now takes a plain GET, so all of it collapses into a single
   * link you paste and drop numbers into. `sleep` is the only one the check-in
   * consumes; HRV and resting HR are shown as an optional extension, because
   * getting somebody to a working sync in ninety seconds beats getting them
   * halfway to a complete one.
   */
  const personalLink = shown ? `${shown.url}?t=${shown.token}` : "";
  const sleepOnly = `${personalLink}&sleep=`;

  /**
   * Minted on the device, written straight to the athlete's own profile row.
   *
   * No server call at all. This used to POST to the Worker purely to have it
   * generate a UUID and PATCH one column — work the browser can do, against a
   * row RLS already lets this user update (`profiles: update own`, migration
   * 0001). The token is random and grants exactly one thing: writing biometrics
   * for this athlete. Who generated it is irrelevant to that.
   *
   * Removing the round trip removes the dependency on a Worker deploy, which is
   * what was broken.
   */
  async function mint() {
    setBusy(true); setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const fresh = crypto.randomUUID();
      // Recorded at the same time so the sync can resolve a dateless payload to
      // the right day — see migration 0066. Best effort: an older database
      // without the column must not stop the token being issued.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let { error } = await supabase.from("profiles")
        .update({ ingest_token: fresh, timezone: tz }).eq("id", user.id);
      if (error && /timezone|column|schema cache/i.test(error.message)) {
        ({ error } = await supabase.from("profiles").update({ ingest_token: fresh }).eq("id", user.id));
      }
      if (error) throw new Error(error.message);

      setMinted({ token: fresh, url: ingestUrl });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * COPY CAN FAIL, AND WHEN IT DOES THE ATHLETE MUST STILL GET THE URL.
   *
   * This was a bare `await navigator.clipboard.writeText(value)` with no catch.
   * On iOS that rejects often enough to matter — an unfocused document, an
   * in-app browser, a home-screen PWA — and when it did, the promise died
   * silently: nothing on the clipboard, the button never said "Copied", and the
   * link was rendered masked so it could not be read or selected by hand
   * either. The reported symptom was "in the Shortcuts app it won't let me
   * paste the url", and it was right: there was nothing to paste, and no way to
   * get at it.
   */
  async function copy(what: string, value: string) {
    const result = await copyText(value);
    if (result === "copied") {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
      return;
    }
    // Reveal it instead. A URL you can long-press and copy by hand is a working
    // route; a Copy button that quietly does nothing is not.
    setReveal(true);
    setCopyFailed(true);
  }

  /**
   * THE ROUTE THAT DOES NOT TOUCH THE CLIPBOARD AT ALL.
   *
   * Two attempts at fixing "it won't let me paste the url" both assumed the
   * clipboard: first that the write was failing, then that the URL field was
   * refusing it. Neither was the whole story, and there is a third possibility
   * neither addressed — iOS 16 added a per-app permission for reading a
   * clipboard written by another app, and with Shortcuts set to Deny it
   * silently refuses every paste from Safari. Nothing this code does can
   * change that setting.
   *
   * The share sheet sidesteps the question. It hands the string to iOS
   * directly, so it can go to Notes, to Messages, or straight into another app
   * without the clipboard being involved — and it is the mechanism people
   * already use to move a link between apps on a phone.
   */
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  async function share(value: string) {
    try {
      await navigator.share({ text: value });
    } catch {
      // Cancelling the share sheet rejects, and a cancel is not an error.
    }
  }

  /**
   * THE READY-MADE SHORTCUT, WHEN THERE IS ONE.
   *
   * The guide below is correct and people could not finish it. Every step in it
   * serves the transport — which Health sample, which sort order, which unit a
   * duration is in — and none of it is anything an athlete should have to learn
   * to see last night's sleep in their log. A shortcut somebody else already
   * built removes all of it: tap, paste, done.
   *
   * Null until the link is published (docs/APPLE-SHORTCUT.md), and null is not
   * a broken state — it is the hand-built guide, which is what everybody has
   * been using. Nothing here is removed, only demoted.
   */
  /**
   * The link, its share fallback and its copy-failed note, as one thing.
   *
   * It sits on its own in the hand-built guide and inside step one of the
   * ready-made one, and those are the same widget — the difference is only
   * where it belongs in the order.
   */
  /**
   * WHICH LINK GOES ON THE CLIPBOARD DEPENDS ON WHO ASSEMBLES THE URL.
   *
   * Hand-built, the athlete types nothing: they paste a link that already ends
   * `&sleep=` and drop the Health variable on the end, so the trailing key is
   * doing real work. The ready-made shortcut builds the whole query itself —
   * sleep, HRV and resting HR — from a base it is handed, and a dangling
   * `&sleep=` pasted into that would land in the middle of the URL it builds.
   */
  const linkToCopy = shortcut ? personalLink : sleepOnly;

  const linkBlock = (
    <>
          {/* ONE LINK, NOT A URL AND A HEADER.
              Copying two values into two different places in the Shortcuts UI
              was where people lost their place. Copy gives you the link with
              `&sleep=` already on the end, so the next thing to do is obvious
              from what is on the clipboard. */}
          <div className="mb-3">
            <Copyable
              label="Your link"
              value={linkToCopy}
              copied={copied === "link"}
              onCopy={() => copy("link", linkToCopy)}
              secret={!reveal}
              onReveal={() => setReveal((v) => !v)}
              revealed={reveal}
            />
            {canShare && (
              <button
                onClick={() => share(linkToCopy)}
                className="tap-target mt-1.5 w-full rounded-xl border border-white/10 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5"
              >
                Share the link instead ↗
              </button>
            )}
            {copyFailed && (
              /* Said plainly, with the way out. Safari refuses the clipboard
                 often enough on a phone that this is a normal path, not an
                 error state — so it reads as an instruction rather than a
                 failure. */
              <p className="mt-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-300">
                Your browser blocked the copy. The full link is shown above — press and hold it,
                choose <b>Select&nbsp;All</b>, then <b>Copy</b>.
              </p>
            )}
          </div>
    </>
  );

  return (
    <li className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      {/* ═══════════════════════════════════════════════════════════════
          THE ESCAPE HATCH GOES FIRST, and it is the most important change
          this panel has had.

          Reported twice as "still far too complicated", and both times the
          answer given was a better guide. That was the wrong answer. Sleep is
          ONE NUMBER and there is a box for it a few inches down this same page
          — so for most people the correct amount of Shortcut-building is none,
          and a screen that opens with four steps has told them the opposite
          before they have read a word.

          Setting it up is worth it, once, for somebody who will otherwise type
          a number every morning for a year. It is not worth it for anybody
          else, and saying so is what makes the rest of this readable.
          ═══════════════════════════════════════════════════════════════ */}
      <p className="mb-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-slate-300">
        <b className="text-slate-100">You don&apos;t need this.</b> Sleep is one number, and there is a box
        for it further down this page. Set this up only if you would rather never type it again.
      </p>
      <p className="mb-2 text-xs text-slate-400">
        Apple doesn&apos;t let a website read Health — the data never leaves your phone unless you send it.
        A <span className="text-slate-200">Shortcut</span> can, and it can run itself every morning.
        {shortcut ? " We built you one." : ""}
      </p>

      {!shown ? (
        <>
          <button onClick={mint} disabled={busy} className="btn-primary">
            {busy ? "Creating…" : "Create my upload link"}
          </button>
          {err && <p className="mt-2 text-sm text-readiness-red">{err}</p>}
        </>
      ) : (
        <>
          {/* SAY IT BEFORE THEY SPEND THE TWO MINUTES, not after.
              Somebody who builds the Shortcut and only then finds nothing
              arrives has learned that the app wasted their time; somebody told
              up front has learned that it is honest with them. */}
          {endpoint === "missing" ? (
            <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2 text-xs text-amber-200">
              <b>Not switched on yet.</b> The endpoint this sends to has not been deployed, so a Shortcut
              built now would post into nothing. The link below is still yours and will keep working once
              it is live — but do not spend the two minutes until this notice has gone.
            </p>
          ) : shortcut ? (
            <p className="mb-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              Two taps and one paste, on your <b>iPhone</b>. Nothing to build — the Shortcut is already
              made, you just tell it where to send your numbers.
            </p>
          ) : (
            <p className="mb-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              Three steps, about two minutes, once. After that it sends by itself every morning and you
              never think about it again. Do it on your <b>iPhone</b>, not a laptop.
            </p>
          )}

          {shortcut ? (
            <ol className="space-y-3 text-xs text-slate-400">
              {/* COPY FIRST, DELIBERATELY. Shortcuts asks for the link while it
                  is installing, and a phone that gets asked for something it
                  does not have yet means backing out of the install, going
                  back to Safari, and starting again. */}
              <Step n={1} title="Copy your link">
                <div className="mt-1.5">{linkBlock}</div>
                The Shortcut asks for this while it installs, so get it onto the clipboard first.
              </Step>
              <Step n={2} title="Add the Shortcut">
                <a
                  href={shortcut}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary mt-1.5 mb-1.5 inline-block !py-2 text-xs"
                >
                  Add the Shortcut ↗
                </a>
                <span className="block">
                  Shortcuts opens and asks for your link — paste it — then tap
                  <b className="text-slate-200"> Add Shortcut</b>. That is the whole setup.
                </span>
                <span className="mt-1 block text-slate-500">
                  Tap this on the iPhone itself. On a laptop the link opens a preview page that cannot
                  install anything.
                </span>
              </Step>
              <Step n={3} title="Run it once">
                Tap it in your Shortcuts list. The first run asks permission to read Health —
                <b className="text-slate-200"> Allow</b> it — and then it answers with the hours it read
                back. If it does, today&apos;s sleep is already in today&apos;s log.
              </Step>
            </ol>
          ) : (
            <>
              {linkBlock}
              <ManualBuild />
            </>
          )}

          <p className="mt-3 text-xs text-slate-500">
            <b className="text-slate-400">Then make it run itself:</b> Shortcuts →
            <b className="text-slate-300"> Automation</b> → <b className="text-slate-300">+</b> →
            <b className="text-slate-300"> Time of Day</b> → 8am daily → pick it, and turn
            <b className="text-slate-300"> Ask Before Running</b> off. (Named differently on some versions —
            look for anything about asking or confirming before it runs.)
          </p>

          {/* THE HAND-BUILT ROUTE, KEPT AND DEMOTED.
              It is the only route on a phone that cannot install from iCloud,
              and it is the one to read when the ready-made shortcut does
              something unexpected — the steps say what it is actually doing. */}
          {shortcut && (
            <details className="mt-3">
              <summary className="tap-target cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-slate-300">
                Rather build it yourself? <span className="text-slate-600">(five minutes, same result)</span>
              </summary>
              <div className="mt-2">
                <ManualBuild />
              </div>
            </details>
          )}

          {/* ONE DISCLOSURE, NOT THREE. A POST alternative, the accepted field
              names and the token controls were three separate blocks of small
              grey text under a guide people already said was too long — and
              every one of them is for somebody who is not stuck. */}
          <details className="mt-2">
            <summary className="tap-target cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-slate-300">
              More options
            </summary>
            <div className="mt-2 space-y-2 text-xs text-slate-500">
              <p>
                <b className="text-slate-400">Prefer a POST?</b> Still supported, and it keeps the token out
                of the URL. POST to <code className="break-all text-slate-400">{shown.url}</code> with an
                <code className="ml-1 text-slate-400">Authorization: Bearer …</code> header and a JSON body of
                <code className="ml-1 text-slate-400">sleepHours</code>,
                <code className="ml-1 text-slate-400">hrv</code>,
                <code className="ml-1 text-slate-400">restingHR</code>.
              </p>
              <button onClick={() => copy("Header", `Bearer ${shown.token}`)} className="chip text-accent-400">
                {copied === "Header" ? "Copied" : "Copy the header value"}
              </button>
              <p>
                Field names are flexible — <span className="text-slate-400">sleep</span>,
                <span className="text-slate-400"> sleepHours</span> and
                <span className="text-slate-400"> restingHeartRate</span> all work, and minutes or hours are
                both understood. Anything you type in yourself is never overwritten by a sync.
              </p>
            </div>
          </details>

          <button onClick={mint} disabled={busy} className="tap-target mt-3 text-xs font-semibold text-slate-400 hover:text-slate-200">
            {busy ? "Creating…" : "Create a new token (stops the old one working)"}
          </button>
          {err && <p className="mt-2 text-sm text-readiness-red">{err}</p>}
          <p className="mt-2 text-xs text-slate-500">
            Anyone with this link can add health data to your account — it cannot read anything, but
            treat it like a password. Making a new one stops the old link working.
          </p>
        </>
      )}
    </li>
  );
}

/**
 * Building the Shortcut by hand, action by action.
 *
 * THIS IS THE FALLBACK NOW, not the front door — see appleShortcutUrl(). It is
 * kept in full and unchanged because it is still the only route for a phone
 * that will not install from iCloud, and because it is the honest description
 * of what the ready-made shortcut does. Nobody should have to take that on
 * trust.
 *
 * Static text only, deliberately: it renders identically inline and inside a
 * <details>, so demoting it took no rewriting and no props.
 */
function ManualBuild() {
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
          WE CANNOT DESCRIBE SOMEBODY ELSE'S APP AND STAY RIGHT.

          Reported as "their Shortcuts app looks different to the instructions",
          and it will keep being reported, because it is true: Apple moves
          buttons, renames panels and redraws the editor between iOS versions,
          and this app is used across several of them at once. A guide written
          as "tap the button in the top right" is wrong for somebody on the day
          it is written and wrong for everybody eventually.

          What does NOT move is the NAME of an action. "Find Health Samples" is
          searchable in every version of Shortcuts that has it. So the steps
          below name things to search for and values to set, and say as little
          as possible about where anything sits on screen — and the note says
          outright that the screen may not match, so a mismatch reads as
          expected rather than as the guide being broken.
          ═══════════════════════════════════════════════════════════════ */}
      <p className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-slate-400">
        <b className="text-slate-300">Your Shortcuts app may not look like this.</b> Apple moves things
        between iOS versions. The <b className="text-slate-300">names</b> below do not change — search for
        each one in the action list and you will find it, wherever the buttons have moved to.
      </p>

      <ol className="space-y-3 text-xs text-slate-400">
        {/* THREE STEPS, NOT FOUR. "Open Shortcuts and tap +" was a numbered
            step of its own, which spends a third of the guide on opening an
            app. It is now the first half of a sentence. */}
        <Step n={1} title="Read last night's sleep">
          Open <b className="text-slate-200">Shortcuts</b>, start a new one, and search for
          <b className="text-slate-200"> Find Health Samples</b>. Set it to
          <b className="text-slate-200"> Sleep</b>, <b className="text-slate-200">Latest First</b>,
          limit <b className="text-slate-200">1</b>.
          <span className="mt-1 block text-slate-500">
            Latest First with a limit of 1 is what makes it last night. On Oldest First it runs every day and
            reports the wrong night.
          </span>
        </Step>

        <Step n={2} title="Turn it into a number">
          Search for <b className="text-slate-200">Get Details of Health Sample</b> and choose
          <b className="text-slate-200"> Duration</b>. Then tap the
          <b className="text-slate-200"> Duration</b> variable it produces and set its unit to
          <b className="text-slate-200"> Hours</b>.
          {/* THE ONE STEP EVERYBODY GETS STUCK ON, now stated where it happens
              rather than as a separate amber warning further down. Reported
              three times as "it won't let me paste the url", and it was never
              the URL: Health renders a duration as "7 hr 32 min", and a URL
              cannot contain a space. */}
          <span className="mt-1 block text-slate-500">
            This is the step everyone misses. Health gives a duration as{" "}
            <span className="font-mono">7 hr 32 min</span>, and a URL cannot contain spaces — set it to Hours
            and you get <span className="font-mono">7.53</span> instead.
          </span>
        </Step>

        <Step n={3} title="Send it">
          Search for <b className="text-slate-200">Text</b> — a plain empty box — and paste your link into it.
          It already ends with <code className="text-slate-300">&amp;sleep=</code>, so put the cursor on the
          end and insert the <b className="text-slate-200">Duration</b> variable there. Then search for
          <b className="text-slate-200"> Get Contents of URL</b>, which picks the Text up on its own.
          <span className="mt-1 block text-slate-500">
            A Text box rather than pasting into the URL field directly — the URL field often will not offer
            you a Paste option, and this one always does.
          </span>
        </Step>
      </ol>

      <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
        <b className="text-slate-200">Now tap Play.</b> It should answer with the hours it read back. If it
        does, today&apos;s sleep is already in today&apos;s log.
      </p>

      {/* HRV AND RESTING HEART RATE ARE THE OPTIONAL HALF, and putting them in
          the main guide is what made this a five-step job. A working sleep sync
          is worth more than an abandoned complete one. */}
      <details className="mt-3">
        <summary className="tap-target cursor-pointer list-none text-xs font-semibold text-slate-400 hover:text-slate-200">
          Add HRV and resting heart rate <span className="text-slate-600">(optional, one more minute)</span>
        </summary>
        <div className="mt-2 space-y-2 text-xs text-slate-500">
          <p>
            Two more <b className="text-slate-300">Find Health Samples</b> before the last step — one
            <b className="text-slate-300"> Heart Rate Variability</b>, one
            <b className="text-slate-300"> Resting Heart Rate</b> — each followed by
            <b className="text-slate-300"> Get Details of Health Sample → Value</b>.
          </p>
          <p>
            Then on the end of the Text, type <code className="text-slate-300">&amp;hrv=</code> and insert the
            HRV value, then <code className="text-slate-300">&amp;rhr=</code> and insert the resting HR value.
          </p>
          <p>
            These are what let readiness compare today against your own normal rather than a textbook. Sleep
            on its own still works.
          </p>
        </div>
      </details>
    </>
  );
}

function Copyable({ label, value, copied, onCopy, secret, onReveal, revealed }: {
  label: string; value: string; copied: boolean; onCopy: () => void; secret?: boolean;
  /** Optional: let the athlete unmask the value and select it by hand. */
  onReveal?: () => void;
  revealed?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        {/* WRAPPED, NOT TRUNCATED, once revealed. A URL cut off with an ellipsis
            cannot be selected in full by hand, which defeats the only fallback
            there is when the clipboard refuses. */}
        <code className={`min-w-0 flex-1 text-xs text-slate-300 ${revealed ? "select-all break-all" : "truncate"}`}>
          {secret ? maskSecret(value) : value}
        </code>
        <button onClick={onCopy} className="chip shrink-0 text-accent-400">{copied ? "Copied" : "Copy"}</button>
      </div>
      {onReveal && (
        <button
          onClick={onReveal}
          className="tap-target mt-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200"
        >
          {revealed ? "Hide" : "Show the full link"}
        </button>
      )}
    </div>
  );
}

/**
 * Hide the credential, keep the shape.
 *
 * The old masking took the first eight characters and the last four, which for
 * a bare token was fine and for a URL rendered "https://····eep=" — no help in
 * telling whether you copied the right thing. A link's secret is one query
 * parameter, so mask that and leave the rest legible.
 */
function maskSecret(value: string): string {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  if (uuid.test(value)) return value.replace(uuid, "••••••••");
  return `${value.slice(0, 8)}····${value.slice(-4)}`;
}

/**
 * One numbered step.
 *
 * The whole guide used to be a four-item list where step three carried a nested
 * list of headers and JSON fields — which is accurate, and unfollowable on a
 * phone with one hand. Each step is now one action with its own heading, so
 * someone can find their place again after looking away.
 */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pitch-400/15 text-[10px] font-extrabold text-accent-400">
        {n}
      </span>
      {/* div, not span: a step's body can hold the copy widget, and that is a
          <div>. Nesting one inside a <span> is invalid HTML and browsers fix it
          by closing the span early, which drops the step's own layout. */}
      <div className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-200">{title}</span>
        <div className="mt-0.5 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}
