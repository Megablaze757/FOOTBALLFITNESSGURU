"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { createClient } from "@/lib/supabase/client";
import { invokeAI } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { syncHealth, daysSinceSync } from "@/lib/biometrics";

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
      <h2 className="field-label !mb-1">🔗 Connect a wearable</h2>
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
                : "One link and a two-minute Shortcut on your iPhone — then your sleep is there every morning."
            }
            onClick={() => setOpen(open === "apple" ? null : "apple")}
            action={data?.ingestToken ? "Show setup" : "Set up"}
          />
          {open === "apple" && <AppleSetup token={data?.ingestToken ?? null} onDone={reload} />}

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
        <button onClick={onClick} className="chip shrink-0 text-pitch-400 hover:bg-white/[0.08]">{action}</button>
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
      {msg && <p className="mt-2 text-sm text-pitch-400">{msg}</p>}
      <p className="mt-2 text-xs text-slate-500">
        The token is stored server-side and never sent back to this page — not even to you. Disconnect
        by creating a new one on Oura&apos;s site, which invalidates this one.
      </p>
    </li>
  );
}

function AppleSetup({ token, onDone }: { token: string | null; onDone: () => void }) {
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
   * IT USED TO BE THE CLOUDFLARE WORKER, AND THAT ROUTE DOES NOT EXIST. Live
   * answers 404 on both /ingest-token and /wearable-ingest, so "Set up" failed
   * and every configured Shortcut posted into a void. The Worker running in
   * production is built from source that is not in this repo, so the fix could
   * not be "deploy the repo's Worker" — that would delete the AI provider work
   * that is live. The sync shares nothing with the AI routes, so it moved to a
   * Supabase function that deploys on its own.
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
   * It was not — and had not been for the entire life of this feature. The
   * Supabase function this guide points at has never been deployed, so every
   * Shortcut anyone built against it posted into a 404, silently, every morning.
   * The guide was five careful steps to nowhere.
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

  return (
    <li className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <p className="mb-2 text-xs text-slate-400">
        Apple doesn&apos;t let a website read Health directly — the data never leaves your phone unless you
        send it. A <span className="text-slate-200">Shortcut</span> can, and it can run itself every morning.
        It is four taps and one paste.
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
          ) : (
            <p className="mb-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              Three steps, about two minutes, once. After that it sends by itself every morning and you
              never think about it again. Do it on your <b>iPhone</b>, not a laptop.
            </p>
          )}

          {/* ONE LINK, NOT A URL AND A HEADER.
              Copying two values into two different places in the Shortcuts UI
              was where people lost their place. Copy gives you the link with
              `&sleep=` already on the end, so the next thing to do is obvious
              from what is on the clipboard. */}
          <div className="mb-3">
            <Copyable
              label="Your link"
              value={sleepOnly}
              copied={copied === "link"}
              onCopy={() => copy("link", sleepOnly)}
              secret={!reveal}
              onReveal={() => setReveal((v) => !v)}
              revealed={reveal}
            />
            {canShare && (
              <button
                onClick={() => share(sleepOnly)}
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

          <ol className="space-y-3 text-xs text-slate-400">
            <Step n={1} title="Open Shortcuts and start a new one">
              It&apos;s the app with the two coloured squares — already on your phone. Tap
              <b className="text-slate-200"> + </b> in the top right.
            </Step>
            <Step n={2} title="Find last night's sleep">
              Search <b className="text-slate-200">Find Health Samples</b> and tap it. Set
              <b className="text-slate-200"> Sleep Analysis</b>, sort by
              <b className="text-slate-200"> Start Date</b>, and — this one matters —
              order <b className="text-slate-200">Latest First</b> with the limit on and set to
              <b className="text-slate-200"> 1</b>. Then add
              <b className="text-slate-200"> Get Details of Health Sample</b> and choose
              <b className="text-slate-200"> Duration</b>.
              <span className="mt-1 block text-slate-500">
                Latest First and a limit of 1 is what makes it last night. On Oldest First it sends the
                oldest night in the window instead — it will run, and report the wrong night, every day.
              </span>
            </Step>
            {/* PASTE INTO A TEXT ACTION, NOT INTO THE URL FIELD.
                This used to say "add Get Contents of URL and paste your link".
                That field is a URL field, and on iOS tapping it often opens it
                for editing without placing a cursor — so the long-press Paste
                menu never appears and the athlete is left holding a link the
                app will not accept. Reported as "it won't let me paste the
                url", and the guide had no other route to offer.

                A Text action is a plain multi-line box: paste always works
                there, the variable is easier to drop on the end because you can
                see the whole string, and Get Contents of URL takes the Text as
                its input. One extra action, and it removes the only step in
                this guide that can refuse you. */}
            {/* THE ACTUAL CAUSE, FOUND ON THE THIRD ATTEMPT.
                Reported three times as "it won't let me paste the url", and it
                was never the URL: the link the app copies is 115 characters
                with no whitespace in it, verified against the exact template.
                The space arrives from the DURATION. iOS renders a Health
                sample's duration as "7 hr 32 min", so the moment that variable
                is dropped after `&sleep=` the field contains spaces — and
                Shortcuts will not accept a URL with a space in it.

                Two earlier notes here blamed the clipboard and then an iOS
                privacy setting. Both were guesses, one of them sent somebody
                looking for a setting that does not exist on their phone, and
                neither would have helped. This one is checkable: paste the
                link on its own and it is accepted; add the variable and it is
                not. */}
            <li className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2.5 text-xs leading-relaxed text-amber-100/90">
              <b className="text-amber-200">If Shortcuts refuses the URL, it is the space.</b> Health gives a
              duration as <span className="font-mono">7 hr 32 min</span>, and a URL cannot contain spaces — so
              the moment you drop that variable in, the field is rejected. The link itself is fine.
              <span className="mt-1 block">
                Fix it by tapping the <b className="text-amber-200">Duration</b> variable after you insert it and
                setting it to <b className="text-amber-200">Hours</b> — that gives a plain number like 7.53.
              </span>
              <span className="mt-1 block text-amber-100/60">
                Building the URL in a Text action, as below, is what makes this easy to see and to fix — the
                whole string stays visible while you edit it.
              </span>
            </li>

            <Step n={3} title="Paste your link into a Text box">
              Search <b className="text-slate-200">Text</b> and tap it — a plain empty box. Tap inside it and
              paste. Your link already ends with <code className="text-slate-300">&amp;sleep=</code>, so put the
              cursor right at the end and tap the <b className="text-slate-200">Duration</b> variable above the
              keyboard. Then tap that variable once more and set it to
              <b className="text-slate-200"> Hours</b>, so it goes in as a number rather than
              <span className="font-mono"> 7 hr 32 min</span>.
              <span className="mt-1 block text-slate-500">
                Use a Text box rather than pasting into the URL field directly — the URL field often will not
                offer you a Paste option, and this one always does.
              </span>
            </Step>
            <Step n={4} title="Send it">
              Add <b className="text-slate-200">Get Contents of URL</b>. It will pick up the
              <b className="text-slate-200"> Text</b> above it automatically — if it does not, tap the URL field
              once and choose the <b className="text-slate-200">Text</b> variable. That is the whole shortcut:
              no headers, no JSON, nothing to switch on.
            </Step>
          </ol>

          {/* TEST IT BEFORE AUTOMATING IT.
              Somebody who schedules a shortcut they have never run finds out it
              was broken a week later, if at all. The endpoint answers with the
              numbers it saved for exactly this. */}
          <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
            <b className="text-slate-200">Now tap Play.</b> It should answer with the hours it read back.
            If it does, today&apos;s sleep is already on your check-in.
          </p>

          <p className="mt-3 text-xs text-slate-500">
            <b className="text-slate-400">Then make it run itself:</b> name it, go to the
            <b className="text-slate-300"> Automation</b> tab → <b className="text-slate-300">+</b> →
            <b className="text-slate-300"> Time of Day</b> → 8am, daily, and pick it. Turn
            <b className="text-slate-300"> Ask Before Running</b> off, or it will sit there waiting for you.
          </p>

          {/* THE OPTIONAL HALF, KEPT OUT OF THE WAY.
              HRV and resting heart rate sharpen readiness; sleep is what the
              check-in actually consumes. Putting all three in the main guide is
              what made this a five-step job, and a working sleep sync is worth
              more than an abandoned complete one. */}
          <details className="mt-3">
            <summary className="tap-target cursor-pointer list-none text-xs font-semibold text-slate-400 hover:text-slate-200">
              Add HRV and resting heart rate too <span className="text-slate-600">(optional, one more minute)</span>
            </summary>
            <div className="mt-2 space-y-2 text-xs text-slate-500">
              <p>
                Two more <b className="text-slate-300">Find Health Samples</b> actions before the last step —
                one <b className="text-slate-300">Heart Rate Variability</b>, one
                <b className="text-slate-300"> Resting Heart Rate</b> — each followed by
                <b className="text-slate-300"> Get Details of Health Sample → Value</b>.
              </p>
              <p>
                Then at the end of the URL type <code className="text-slate-300">&amp;hrv=</code> and tap the HRV
                value, then <code className="text-slate-300">&amp;rhr=</code> and tap the resting HR value.
              </p>
              <p>
                These are what let readiness compare today against your own normal rather than a
                textbook. Sleep on its own still works.
              </p>
            </div>
          </details>

          <details className="mt-2">
            <summary className="tap-target cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-slate-300">
              Prefer a POST with a header?
            </summary>
            <div className="mt-2 space-y-2 text-xs text-slate-500">
              <p>
                Still supported, and it keeps the token out of the URL. POST to
                <code className="ml-1 break-all text-slate-400">{shown.url}</code> with an
                <code className="ml-1 text-slate-400">Authorization: Bearer …</code> header and a JSON body of
                <code className="ml-1 text-slate-400">sleepHours</code>,
                <code className="ml-1 text-slate-400">hrv</code>,
                <code className="ml-1 text-slate-400">restingHR</code>.
              </p>
              <button onClick={() => copy("Header", `Bearer ${shown.token}`)} className="chip text-pitch-400">
                {copied === "Header" ? "Copied" : "Copy the header value"}
              </button>
            </div>
          </details>

          <p className="mt-3 text-xs text-slate-500">
            Field names are flexible — <span className="text-slate-400">sleep</span>,
            <span className="text-slate-400"> sleepHours</span> and
            <span className="text-slate-400"> restingHeartRate</span> all work, and minutes or hours are
            both understood. Anything you type in yourself is never overwritten by a sync.
          </p>

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
        <button onClick={onCopy} className="chip shrink-0 text-pitch-400">{copied ? "Copied" : "Copy"}</button>
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
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pitch-400/15 text-[10px] font-extrabold text-pitch-400">
        {n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-200">{title}</span>
        <span className="mt-0.5 block leading-relaxed">{children}</span>
      </span>
    </li>
  );
}
