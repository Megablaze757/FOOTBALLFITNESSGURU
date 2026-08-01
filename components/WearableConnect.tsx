"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invokeAI } from "@/lib/api";
import { useAsync } from "@/lib/use-async";

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
 * The last two are shown as what they are rather than as buttons that fail.
 * A disabled control with a reason is more use than one that looks live.
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
            state={oura?.connected ? (oura.last_error ? "error" : "connected") : "available"}
            detail={
              oura?.connected
                ? oura.last_error
                  ? `Last sync failed — ${oura.last_error}`
                  : oura.last_sync_at
                    ? `Syncing. Last update ${new Date(oura.last_sync_at).toLocaleDateString()}.`
                    : "Connected."
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
                ? "Set up. Your Shortcut can post to the app whenever you like."
                : "Via a Shortcut on your iPhone — it can send your sleep and HRV every morning."
            }
            onClick={() => setOpen(open === "apple" ? null : "apple")}
            action={data?.ingestToken ? "Show setup" : "Set up"}
          />
          {open === "apple" && <AppleSetup token={data?.ingestToken ?? null} onDone={reload} />}

          {/* Not buttons. Both are waiting on an application only the operator
              can file, and a control that looks live and always fails is worse
              than one that explains itself. */}
          <Row
            name="Whoop"
            icon="⌚"
            state="blocked"
            detail="Needs a developer application approved by Whoop before it can be switched on. Import a CSV export below for now."
          />
          <Row
            name="Garmin"
            icon="⌚"
            state="blocked"
            detail="Garmin's health data is behind their Connect Developer Program, which has to be applied for. Import a CSV export below for now."
          />
        </ul>
      )}
    </div>
  );
}

function Row({ name, icon, state, detail, onClick, action }: {
  name: string;
  icon: string;
  state: "connected" | "available" | "error" | "blocked";
  detail: string;
  onClick?: () => void;
  action?: string;
}) {
  const dot = state === "connected" ? "bg-readiness-green"
    : state === "error" ? "bg-readiness-red"
    : state === "blocked" ? "bg-slate-600" : "bg-slate-500";

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
   * The endpoint a Shortcut posts to.
   *
   * NEXT_PUBLIC_API_URL is EMPTY unless the Worker is configured, and this line
   * used to interpolate it regardless — so on any revisit, once a token already
   * existed, the URL rendered as the relative path "/wearable-ingest". Pasted
   * into a Shortcut that sends the morning's sleep precisely nowhere, silently,
   * forever. A freshly minted one was fine because the Worker returns an
   * absolute URL, which is why it looked like it worked when it was set up.
   *
   * No Worker means no push endpoint at all — it isn't deployed as a Supabase
   * function — so say that instead of handing over an address that can't work.
   */
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
  const shown = minted ?? (token && apiBase ? { token, url: `${apiBase}/wearable-ingest` } : null);

  if (!apiBase && !minted) {
    return (
      <li className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-slate-400">
        Pushing from a Shortcut needs the backend to be deployed — it isn&apos;t configured for this
        build, so there is nowhere for your phone to send to yet. Until then, the CSV import below
        takes an Apple Health export.
      </li>
    );
  }

  async function mint() {
    setBusy(true); setErr(null);
    try {
      setMinted(await invokeAI<{ token: string; url: string }>("ingest-token", {}));
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(what: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <li className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <p className="mb-2 text-xs text-slate-400">
        Apple doesn&apos;t let a website read Health directly — the data never leaves your phone unless you
        send it. A <span className="text-slate-200">Shortcut</span> can, and it can run itself every morning.
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
          {/* HONEST ABOUT THE COST UP FRONT.
              This is a five-minute job and it is fiddly, and pretending
              otherwise is how someone starts it on a bus and gives up halfway.
              Saying "once" is the important half: they never do it again. */}
          <p className="mb-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
            About 5 minutes, once. After that it sends by itself every morning and you never
            think about it again. Do it on your <b>iPhone</b>, not a laptop.
          </p>

          <div className="mb-3 space-y-2">
            <Copyable label="URL" value={shown.url} copied={copied === "URL"} onCopy={() => copy("URL", shown.url)} />
            <Copyable label="Header" value={`Bearer ${shown.token}`} copied={copied === "Header"} onCopy={() => copy("Header", `Bearer ${shown.token}`)} secret />
          </div>

          <ol className="space-y-3 text-xs text-slate-400">
            <Step n={1} title="Open Shortcuts and start a new one">
              It&apos;s the app with the two coloured squares — already on your phone. Tap
              <b className="text-slate-200"> + </b> in the top right.
            </Step>
            <Step n={2} title="Add your sleep">
              Search <b className="text-slate-200">Find Health Samples</b> and tap it. Set
              <b className="text-slate-200"> Sleep Analysis</b>, sort by
              <b className="text-slate-200"> Start Date</b>, limit <b className="text-slate-200">1</b>.
            </Step>
            <Step n={3} title="Add HRV and resting heart rate">
              Two more <b className="text-slate-200">Find Health Samples</b> actions, the same way — one for
              <b className="text-slate-200"> Heart Rate Variability</b>, one for
              <b className="text-slate-200"> Resting Heart Rate</b>.
            </Step>
            <Step n={4} title="Send it">
              Add <b className="text-slate-200">Get Contents of URL</b> and paste the URL above. Tap
              <b className="text-slate-200"> Show More</b>, set Method to <b className="text-slate-200">POST</b>.
              Under <b className="text-slate-200">Headers</b> add a key called
              <b className="text-slate-200"> Authorization</b> and paste the Header value above.
              Set Request Body to <b className="text-slate-200">JSON</b> and add three fields —
              <b className="text-slate-200"> sleepHours</b>, <b className="text-slate-200">hrv</b> and
              <b className="text-slate-200"> restingHR</b> — each set to the matching Health result.
            </Step>
            <Step n={5} title="Make it run itself">
              Name it, then go to the <b className="text-slate-200">Automation</b> tab →
              <b className="text-slate-200"> +</b> → <b className="text-slate-200">Time of Day</b> → 8am, daily,
              and pick your shortcut. Turn <b className="text-slate-200">Ask Before Running</b> off, or it
              will just sit there waiting for you.
            </Step>
          </ol>

          <p className="mt-3 text-xs text-slate-500">
            Tap Play once to test it. If it worked, today&apos;s numbers appear on your check-in
            straight away. Field names are flexible — <span className="text-slate-400">sleep</span>,
            <span className="text-slate-400"> restingHeartRate</span> and similar all work, and minutes
            or hours are both understood.
          </p>

          <button onClick={mint} disabled={busy} className="mt-3 text-xs font-semibold text-slate-400 hover:text-slate-200">
            {busy ? "Creating…" : "Create a new token (stops the old one working)"}
          </button>
          {err && <p className="mt-2 text-sm text-readiness-red">{err}</p>}
          <p className="mt-2 text-xs text-slate-500">
            Anyone with this token can add health data to your account. Treat it like a password.
          </p>
        </>
      )}
    </li>
  );
}

function Copyable({ label, value, copied, onCopy, secret }: {
  label: string; value: string; copied: boolean; onCopy: () => void; secret?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <code className="min-w-0 flex-1 truncate text-xs text-slate-300">
        {secret ? `${value.slice(0, 8)}····${value.slice(-4)}` : value}
      </code>
      <button onClick={onCopy} className="chip shrink-0 text-pitch-400">{copied ? "Copied" : "Copy"}</button>
    </div>
  );
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
