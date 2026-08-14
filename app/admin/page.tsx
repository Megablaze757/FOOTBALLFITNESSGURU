"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLaunched, setLaunched } from "@/lib/launch";
import { useSession } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { invokeAI } from "@/lib/api";
import { referralLink, waitlistLink } from "@/lib/referral";
import { planFor } from "@/lib/subscription";
import { FunnelReport } from "@/components/FunnelReport";
import { AffiliateEarnings } from "@/components/AffiliateEarnings";
import { ChurnReport } from "@/components/ChurnReport";
import type { Video } from "@/lib/types";

interface Metrics {
  total_users: number;
  subscribers: { silver: number; gold: number; comped: number };
  dau: number;
  check_ins_today: number;
  videos_processing: number;
  videos_failed: number;
}

export default function AdminPage() {
  const { user, loading: sessionLoading } = useSession();
  const router = useRouter();

  const { data, loading } = useAsync(async () => {
    if (!user) return null;
    const supabase = createClient();
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return { forbidden: true as const };
    const [{ data: metrics }, { data: failed }, { data: waitlist }] = await Promise.all([
      supabase.rpc("admin_metrics"),
      supabase.from("videos").select("*").eq("status", "failed").order("created_at", { ascending: false }).limit(10),
      supabase.from("waitlist").select("email, source, created_at").order("created_at", { ascending: false }),
    ]);
    return {
      metrics: metrics as Metrics | null,
      failed: (failed ?? []) as Video[],
      waitlist: (waitlist ?? []) as { email: string; source: string | null; created_at: string }[],
    };
  }, [user?.id]);

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
    if (data && "forbidden" in data) router.replace("/home");
  }, [sessionLoading, user, data, router]);

  if (sessionLoading || loading || !data || "forbidden" in data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
      </div>
    );
  }

  const m = data.metrics;
  /**
   * STRIPE-BACKED ONLY, and that is the whole point of 0077.
   *
   * These counts used to include comped accounts — beta testers on free Pro —
   * so the dashboard reported them as customers and then multiplied them by a
   * price to produce an MRR that did not exist. Comped is counted separately
   * below: worth seeing, not worth billing.
   */
  const silver = m?.subscribers.silver ?? 0;
  const gold = m?.subscribers.gold ?? 0;
  const comped = m?.subscribers.comped ?? 0;
  const mrr = silver * planFor("silver").priceMonthly + gold * planFor("gold").priceMonthly;

  return (
    <main className="mx-auto max-w-3xl animate-fade-up px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="text-sm text-slate-400">Back-office metrics.</p>
        </div>
        <Link href="/home" className="text-sm text-slate-400 hover:text-pitch-400">← App</Link>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="MRR" value={`£${mrr}`} accent />
        <Metric label="Paid subs" value={`${silver + gold}`} />
        <Metric label="DAU" value={`${m?.dau ?? 0}`} />
        <Metric label="Total users" value={`${m?.total_users ?? 0}`} />
        <Metric label="Silver" value={`${silver}`} />
        <Metric label="Gold" value={`${gold}`} />
        {/* Beta testers and anyone else on comped Pro. Shown so they are not
            invisible, kept out of "Paid subs" and MRR so those mean revenue. */}
        <Metric label="Comped (beta)" value={`${comped}`} />
        <Metric label="Videos processing" value={`${m?.videos_processing ?? 0}`} />
        <Metric label="Videos failed" value={`${m?.videos_failed ?? 0}`} />
      </section>

      <section className="mt-8">
        <LaunchToggle />
      </section>

      <section className="mt-8">
        <WaitlistAnnounce />
      </section>

      <section className="mt-10">
        <FunnelReport />
      </section>

      {/* The other half of the funnel. Knowing where people arrive is only
          useful next to why they leave. */}
      <section className="mt-10">
        <ChurnReport />
      </section>

      <section className="mt-10">
        <CreateBetaAccount />
      </section>

      <section className="mt-10">
        <Affiliates />
      </section>

      <section className="mt-10">
        <AffiliateEarnings />
      </section>

      <section className="mt-10">
        <Users />
      </section>

      <section className="mt-10">
        <Waitlist rows={data.waitlist} />
      </section>

      <section className="mt-10">
        <h2 className="field-label mb-3">Failed video jobs</h2>
        {!data.failed.length ? (
          <p className="card px-4 py-6 text-center text-sm text-slate-500">No failed jobs. 🎉</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 pt-3 pb-2">Video</th><th className="px-4 pt-3 pb-2">User</th><th className="px-4 pt-3 pb-2">Created</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.failed.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">{v.id.slice(0, 8)}…</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">{v.user_id.slice(0, 8)}…</td>
                    <td className="px-4 py-2 text-slate-400">{v.created_at.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function LaunchToggle() {
  const launched = useLaunched();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Optimistic local view so the button reflects the click immediately.
  const [local, setLocal] = useState<boolean | null>(null);
  const isLaunched = local ?? launched;

  async function toggle() {
    setBusy(true); setErr(null);
    const next = !isLaunched;
    const error = await setLaunched(next);
    setBusy(false);
    if (error) { setErr(error); return; }
    setLocal(next);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="field-label !mb-0">🚀 Launch status</h2>
          <p className="mt-1 text-sm text-slate-300">
            {isLaunched
              ? "Live — the beta badge is hidden across the app."
              : "In beta — a “Beta” badge shows next to the logo for everyone."}
          </p>
        </div>
        <span className={`chip ${isLaunched ? "text-readiness-green" : "text-pitch-400"}`}>
          {isLaunched ? "Launched" : "Beta"}
        </span>
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        className={`mt-4 ${isLaunched ? "btn-ghost" : "btn-primary"}`}
      >
        {busy ? "Saving…" : isLaunched ? "Put back into beta" : "Mark app as fully launched"}
      </button>
      {err && <p className="mt-2 text-sm text-readiness-red">{err}</p>}
    </div>
  );
}

/**
 * Tell the waitlist the app is live.
 *
 * THIS IS THE ONE CONTROL IN THE PANEL THAT CANNOT BE UNDONE. Everything else
 * here flips a flag or edits a row; this puts mail in other people's inboxes,
 * and there is no recalling it. So the design is deliberately slower than the
 * rest of the admin page:
 *
 *   - the count is shown BEFORE anything is pressed, because a bulk send whose
 *     size you learn afterwards is one you cannot sanity-check;
 *   - "Preview" sends nothing and reports exactly who would get it;
 *   - the send itself takes two deliberate presses, not one;
 *   - it goes in batches and tells you what is left, because the function has a
 *     wall clock and the mail provider has a rate limit.
 *
 * Repeat presses are safe by construction: each row is stamped as it sends and
 * the query only picks unstamped ones. Nobody gets it twice.
 */
/** What the SQL sender returns: one row of (emailed, remaining, note). */
interface SendResult { emailed?: number; remaining?: number; note?: string }

/**
 * How many go out per press. pg_net queues each request rather than waiting on
 * it, so this is not bounded by a wall clock the way the Edge Function was, but
 * a smaller number is still a smaller mistake and the button says what is left.
 */
const BATCH = 50;

function WaitlistAnnounce() {
  const launched = useLaunched();
  const { user } = useSession();
  const [stats, setStats] = useState<{ total: number; unsubscribed: number; emailed: number; pending: number } | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "send" | "test" | "key">(null);
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Prefilled with whoever is signed in, but editable — the point of a test
  // send is often to see it in a DIFFERENT client from your own.
  const [testTo, setTestTo] = useState("");
  useEffect(() => { if (user?.email) setTestTo((t) => t || user.email!); }, [user?.email]);

  /**
   * Whether Postgres can see a Resend key, and a box to give it one.
   *
   * The key already exists — in the Cloudflare Worker, as a secret. Secrets are
   * write-only by design, so it cannot be read back out and handed to the
   * database; the same key has to be pasted in a second place. That is a
   * one-line SQL call, but the person doing it is on a phone, so it is a box
   * instead. `has_resend_key` returns a boolean and never the key.
   */
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const checkKey = useCallback(async () => {
    const { data, error } = await createClient().rpc("has_resend_key");
    if (error) { setHasKey(null); return; }
    setHasKey(data === true);
  }, []);
  useEffect(() => { void checkKey(); }, [checkKey]);

  async function saveKey() {
    setBusy("key"); setErr(null); setNote(null);
    const { data, error } = await createClient().rpc("set_resend_key", { p_key: keyInput.trim() });
    setBusy(null);
    if (error) {
      setErr(/does not exist|schema cache|PGRST202/i.test(error.message)
        ? "Paste supabase/announce-launch.sql into the SQL editor first."
        : error.message);
      return;
    }
    setKeyInput("");
    setNote(data === "replaced" ? "Key replaced." : "Key stored. You can send now.");
    void checkKey();
  }

  const loadStats = useCallback(async () => {
    const { data, error } = await createClient().rpc("waitlist_launch_stats");
    if (error) { setErr(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setStats({
        total: Number(row.total) || 0,
        unsubscribed: Number(row.unsubscribed) || 0,
        emailed: Number(row.emailed) || 0,
        pending: Number(row.pending) || 0,
      });
    }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  /**
   * THE SEND GOES THROUGH THE DATABASE, NOT AN EDGE FUNCTION.
   *
   * `announce_launch` is a security-definer Postgres function (see
   * supabase/announce-launch.sql) that calls Resend over pg_net. Calling it by
   * rpc means this button works with nothing deployed - no CLI, no CI secret,
   * no function editor. That matters because the person who needs to press it
   * is usually holding a phone, and "wait until you are at a laptop" is not a
   * launch plan.
   *
   * It is admin-gated inside the function, not out here. A button is not a
   * permission check, and rpc is callable by anyone with a session.
   */
  async function callSend(args: Record<string, unknown>): Promise<{ row?: SendResult; failed?: boolean }> {
    const { data, error } = await createClient().rpc("announce_launch", args);
    if (error) {
      // The likeliest error by far is that the SQL has not been pasted yet, and
      // "function does not exist" tells you nothing about what to do about it.
      setErr(
        /does not exist|schema cache|PGRST202/i.test(error.message)
          ? "The sender is not installed yet. Paste supabase/announce-launch.sql into the Supabase SQL editor, then try again."
          : /resend key in vault/i.test(error.message)
            ? "No Resend key stored. Run: select vault.create_secret('re_xxx', 'resend_api_key');"
            : error.message
      );
      return { failed: true };
    }
    return { row: (Array.isArray(data) ? data[0] : data) as SendResult };
  }

  /**
   * One copy of the real email, to one address, touching nothing.
   *
   * Reading the copy on screen is not the same as receiving it: dark mode,
   * Gmail stripping CSS, whether the button survives Outlook, whether the
   * subject gets cut off on a phone. The launch send is a bad moment to learn
   * any of that.
   */
  async function sendTest() {
    setBusy("test"); setErr(null); setNote(null);
    const { row, failed } = await callSend({ p_test_to: testTo.trim() });
    setBusy(null);
    if (failed) return;
    setNote(row?.note ?? `Test queued to ${testTo.trim()}.`);
  }

  async function send() {
    setBusy("send"); setErr(null); setNote(null);
    const { row, failed } = await callSend({ p_limit: BATCH });
    setBusy(null);
    setArmed(false);
    if (failed) return;
    setNote(row?.note ?? "Done.");
    void loadStats();
  }

  /**
   * Preview is a read, not a send. It costs nothing and answers the only
   * question worth asking first: how many people is this about to reach.
   */
  async function preview() {
    setBusy("preview"); setErr(null); setNote(null);
    await loadStats();
    setBusy(null);
    setNote(
      pending === 0
        ? "Nobody is waiting - everyone on the list has either been emailed or unsubscribed."
        : `Nothing sent. ${pending} would be emailed, ${Math.min(pending, BATCH)} on the next press.`
    );
  }

  const pending = stats?.pending ?? 0;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="field-label !mb-0">📣 Announce to the waitlist</h2>
          <p className="mt-1 text-sm text-slate-300">
            One email telling everyone the app is open. Each person gets it once.
          </p>
        </div>
        <span className="chip text-pitch-400">{pending} to send</span>
      </div>

      {stats && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="On the list" value={stats.total} />
          <Stat label="Already emailed" value={stats.emailed} />
          <Stat label="Unsubscribed" value={stats.unsubscribed} />
        </div>
      )}

      {/* Announcing a launch while the app still shows a beta badge is almost
          certainly a mistake, but it is not mine to block — someone may be
          deliberately warming the list first. */}
      {!launched && (
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
          The app is still marked as <span className="font-semibold">Beta</span>. This email says it is
          live. Flip the switch above first unless you mean to.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => void preview()} disabled={busy !== null} className="btn-ghost">
          {busy === "preview" ? "Checking…" : "Preview (sends nothing)"}
        </button>

        {!armed ? (
          <button onClick={() => { setArmed(true); setNote(null); }} disabled={busy !== null || pending === 0} className="btn-primary">
            Send the announcement
          </button>
        ) : (
          <>
            <button onClick={() => void send()} disabled={busy !== null} className="btn-primary !bg-readiness-red !text-white">
              {busy === "send" ? "Sending…" : `Yes — email ${Math.min(pending, BATCH)} people now`}
            </button>
            <button onClick={() => setArmed(false)} disabled={busy !== null} className="btn-ghost">Cancel</button>
          </>
        )}
      </div>

      {armed && (
        <p className="mt-2 text-xs text-slate-400">
          This cannot be undone. Sends up to {BATCH} at a time — press again for the rest.
        </p>
      )}

      {/* Nothing can send without this, so it sits above the send controls and
          only while it is missing. Once a key is in, the box disappears rather
          than lingering as a field inviting someone to paste over a working
          setup. */}
      {hasKey === false && (
        <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
          <p className="text-sm font-bold text-amber-300">Resend key needed</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Your key is in the Cloudflare Worker as a secret, and secrets cannot be read back out —
            so the database needs its own copy of the same key. Paste it here once. If you no longer
            have it, make another in Resend; extra keys are free and revoking one does not touch the
            others.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="re_..."
              autoComplete="off"
              className="field !mb-0 max-w-xs flex-1"
            />
            <button
              onClick={() => void saveKey()}
              disabled={busy !== null || !keyInput.trim()}
              className="btn-ghost shrink-0"
            >
              {busy === "key" ? "Saving…" : "Save key"}
            </button>
          </div>
        </div>
      )}

      {/* Separate from the buttons above on purpose. This one is safe, and
          sitting it next to the irreversible one invites the wrong click. */}
      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <span className="field-label">Send yourself a test first</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className="field !mb-0 max-w-xs flex-1"
          />
          <button
            onClick={() => void sendTest()}
            disabled={busy !== null || !testTo.trim()}
            className="btn-ghost shrink-0"
          >
            {busy === "test" ? "Sending…" : "Send test"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The real email, to one address. Nobody on the waitlist is emailed, marked or skipped.
        </p>
      </div>
      {note && <p className="mt-3 text-sm text-slate-300">{note}</p>}
      {err && <p className="mt-2 text-sm text-readiness-red">{err}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2 py-2">
      <div className="text-lg font-bold tabular-nums text-slate-100">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function Waitlist({ rows }: { rows: { email: string; source: string | null; created_at: string }[] }) {
  const [copied, setCopied] = useState(false);
  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.email).join(", "));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="field-label !mb-0">📧 Email waitlist · {rows.length}</h2>
        {rows.length > 0 && (
          <button onClick={copyEmails} className="tap-target text-xs font-semibold text-pitch-400 hover:underline">
            {copied ? "Copied ✓" : "Copy all emails"}
          </button>
        )}
      </div>
      {!rows.length ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-500">No signups yet. Share pocketathlete.com/waitlist.</p>
      ) : (
        <div className="card max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-ink-800/95 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 pt-3 pb-2">Email</th><th className="px-4 pt-3 pb-2">Via</th><th className="px-4 pt-3 pb-2">Joined</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.email}>
                  <td className="px-4 py-2 text-slate-200">{r.email}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.source || "—"}</td>
                  <td className="px-4 py-2 text-slate-400">{r.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface AdminUser {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  beta: boolean;
  tier: string;
  status: string;
  referral_code: string | null;
  affiliate_name: string | null;
  created_at: string;
  suspended_at: string | null;
  comped: boolean;
  last_sign_in_at: string | null;
}

const TIER_STYLE: Record<string, string> = {
  gold: "text-pitch-400",
  silver: "text-slate-200",
  bronze: "text-slate-500",
};

/** Everyone on the app: plan, beta status, and who referred them. */
function Users() {
  const [filter, setFilter] = useState<"all" | "beta" | "paid" | "free">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await createClient().rpc("admin_users");
    if (error) throw error;
    return (data ?? []) as AdminUser[];
  }, [], "admin-users");

  async function act(id: string, run: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(id);
    const { error } = await run();
    setBusy(null);
    // Surface the database's own refusal — "you cannot suspend your own
    // account" is more useful than a generic failure.
    setNote(error ? error.message : done);
    setTimeout(() => setNote(null), 5000);
    if (!error) reload();
  }

  const suspend = (u: AdminUser) =>
    act(u.user_id,
      () => createClient().rpc("admin_set_suspended", {
        p_user: u.user_id, p_suspended: !u.suspended_at, p_reason: null,
      }),
      u.suspended_at
        ? `${u.email} restored — they can sign in again.`
        : `${u.email} deactivated. Any comped access has been revoked.`);

  const toggleComped = (u: AdminUser) =>
    act(u.user_id,
      () => createClient().rpc("admin_set_comped", { p_user: u.user_id, p_on: !u.comped }),
      u.comped ? `Pro removed from ${u.email}.` : `${u.email} now has comped Pro.`);

  const rows = data ?? [];
  const paid = rows.filter((r) => r.tier !== "bronze");
  const shown = rows.filter((r) =>
    filter === "all" ? true
      : filter === "beta" ? r.beta
      : filter === "paid" ? r.tier !== "bronze"
      : r.tier === "bronze" && !r.beta
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="field-label !mb-0">👥 Users · {rows.length}</h2>
        <span className="text-xs text-slate-400">
          {rows.filter((r) => r.beta).length} beta · {paid.length} paid
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["all", "beta", "paid", "free"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
              filter === f ? "border-pitch-400/40 bg-pitch-400/10 text-pitch-400" : "border-white/10 bg-white/[0.03] text-slate-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error ? (
        <p className="card px-4 py-6 text-center text-sm text-readiness-red">
          Couldn&apos;t load users — has migration 0034 been applied?
        </p>
      ) : loading ? (
        <div className="card h-24 animate-pulse" />
      ) : !shown.length ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-500">No users match that filter.</p>
      ) : (
        <div className="card max-h-[28rem] overflow-auto">
          {/* Six columns don't fit a phone; scroll the table, not the page. */}
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="sticky top-0 bg-ink-800/95 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 pt-3 pb-2">User</th>
                <th className="px-4 pt-3 pb-2">Plan</th>
                <th className="px-4 pt-3 pb-2">Referred by</th>
                <th className="px-4 pt-3 pb-2">Joined</th>
                <th className="px-4 pt-3 pb-2">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {shown.map((u) => (
                <tr key={u.user_id} className={u.suspended_at ? "opacity-50" : ""}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-slate-200">{u.email}</span>
                      {u.suspended_at && <span className="chip shrink-0 text-readiness-red">deactivated</span>}
                      {u.beta && <span className="chip shrink-0 text-pitch-400">beta</span>}
                      {u.role !== "athlete" && <span className="chip shrink-0 text-slate-400">{u.role}</span>}
                    </div>
                    {u.full_name && <div className="text-xs text-slate-500">{u.full_name}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`font-semibold capitalize ${TIER_STYLE[u.tier] ?? "text-slate-400"}`}>{u.tier}</span>
                    {/* past_due and cancelled both still read as their tier in
                        the DB, so the status is what tells you it's not money. */}
                    {u.tier !== "bronze" && u.status !== "active" && (
                      <span className="block text-xs text-readiness-red">{u.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.affiliate_name
                      ? <span className="text-slate-300">{u.affiliate_name}</span>
                      : u.referral_code
                        ? <span className="text-slate-400" title="Code has no matching affiliate">{u.referral_code}</span>
                        : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{u.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-400">{u.last_sign_in_at?.slice(0, 10) ?? "never"}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {/* Only offered for COMPED access. A real Stripe
                          subscription has to be changed in Stripe — quietly
                          cutting off someone who is still being billed is the
                          worst thing this panel could do. */}
                      {(u.comped || u.tier === "bronze") && !u.suspended_at && (
                        <button
                          onClick={() => toggleComped(u)}
                          disabled={busy === u.user_id}
                          className="tap-target rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 disabled:opacity-40"
                        >
                          {u.comped ? "Remove Pro" : "Give Pro"}
                        </button>
                      )}
                      <button
                        onClick={() => suspend(u)}
                        disabled={busy === u.user_id}
                        className={`tap-target rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                          u.suspended_at
                            ? "border-readiness-green/40 text-readiness-green"
                            : "border-readiness-red/40 text-readiness-red"
                        }`}
                      >
                        {u.suspended_at ? "Restore" : "Deactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function randomPassword() {
  return "GURU-" + Math.random().toString(36).slice(2, 8);
}

interface AffiliateStat { code: string; name: string; email: string | null; signups: number; paid: number; waitlist: number }

function Affiliates() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    const { data, error } = await createClient().rpc("affiliate_stats");
    if (error) throw error;
    return (data ?? []) as AffiliateStat[];
  }, []);

  const suggested = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

  async function add() {
    const finalCode = (code.trim() || suggested);
    if (!name.trim() || !finalCode) return;
    setBusy(true); setError(null);
    const { error } = await createClient().from("affiliates").insert({
      name: name.trim(), email: email.trim() || null, code: finalCode,
    });
    setBusy(false);
    if (error) { setError(error.message.includes("duplicate") ? "That code is already taken." : error.message); return; }
    setName(""); setEmail(""); setCode("");
    reload();
  }

  // Two links per affiliate: the landing page, and straight to the waitlist for
  // pre-launch sharing. Both carry the same ?ref=, so attribution is identical.
  async function copy(c: string, kind: "site" | "waitlist") {
    try {
      await navigator.clipboard.writeText(kind === "waitlist" ? waitlistLink(c) : referralLink(c));
      setCopied(`${c}:${kind}`);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard blocked */ }
  }

  const rows = data ?? [];
  const totalSignups = rows.reduce((n, r) => n + Number(r.signups), 0);
  const totalPaid = rows.reduce((n, r) => n + Number(r.paid), 0);
  const totalWaitlist = rows.reduce((n, r) => n + Number(r.waitlist ?? 0), 0);

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="field-label !mb-0">🤝 Affiliates</h2>
        <span className="text-xs text-slate-400">{totalWaitlist} waitlist · {totalSignups} signups · {totalPaid} paid</span>
      </div>
      <p className="mb-3 text-xs text-slate-400">Give each partner a link — signups through it are attributed to them.</p>

      <div className="grid gap-2 sm:grid-cols-3">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Affiliate name" />
        <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" type="email" />
        <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder={suggested || "code"} />
      </div>
      <button onClick={add} disabled={busy || !name.trim()} className="btn-primary mt-3">{busy ? "Adding…" : "Add affiliate"}</button>
      {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}

      <div className="mt-5">
        {loading ? (
          <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No affiliates yet.</p>
        ) : (
          // Six columns will not fit a phone. Scroll the table, not the page —
          // a body-level horizontal scroll breaks every other screen too.
          <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="pb-2">Affiliate</th><th className="pb-2">Code</th><th className="pb-2 text-right">Waitlist</th><th className="pb-2 text-right">Signups</th><th className="pb-2 text-right">Paid</th><th className="pb-2" /></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.code}>
                  <td className="py-2">
                    <div className="font-semibold text-slate-100">{r.name}</div>
                    {r.email && <div className="text-xs text-slate-500">{r.email}</div>}
                  </td>
                  <td className="py-2 font-mono text-xs text-slate-300">{r.code}</td>
                  <td className="py-2 text-right text-slate-300">{r.waitlist}</td>
                  <td className="py-2 text-right font-bold text-slate-100">{r.signups}</td>
                  <td className="py-2 text-right font-bold text-pitch-400">{r.paid}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => copy(r.code, "waitlist")} className="whitespace-nowrap text-xs text-slate-400 hover:text-pitch-400">
                        {copied === `${r.code}:waitlist` ? "Copied ✓" : "Waitlist link"}
                      </button>
                      <button onClick={() => copy(r.code, "site")} className="whitespace-nowrap text-xs text-slate-400 hover:text-pitch-400">
                        {copied === `${r.code}:site` ? "Copied ✓" : "Site link"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateBetaAccount() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [role, setRole] = useState("athlete");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null); setResult(null);
    try {
      await invokeAI<{ ok?: boolean; error?: string }>("admin-create-user", { email: email.trim(), password, full_name: name.trim(), role });
      setResult(`✅ Created ${email} — password: ${password} (share these, they can change it later).`);
      setEmail(""); setName(""); setPassword(randomPassword());
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setError(
        /admins only|403/.test(m)
          ? "Rejected. Set SUPABASE_SERVICE_ROLE_KEY on the Cloudflare Worker (wrangler secret put) and redeploy — it's needed to verify your admin role and create users."
          : m || "Failed to create the account."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="field-label mb-1">Create beta account</h2>
      <p className="mb-3 text-xs text-slate-400">Instantly provision a tester (email is auto-confirmed — they can sign in right away).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tester@email.com" type="email" />
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name (optional)" />
        <input className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temp password" />
        <select className="field [color-scheme:dark]" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="athlete">Athlete</option>
          <option value="coach">Coach</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button onClick={create} disabled={busy || !email.trim() || password.length < 6} className="btn-primary mt-3">
        {busy ? "Creating…" : "Create account"}
      </button>
      {result && <p className="mt-2 break-words text-sm text-pitch-400">{result}</p>}
      {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "shadow-glow ring-1 ring-pitch-400/40" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${accent ? "text-pitch-400" : "text-slate-100"}`}>{value}</div>
    </div>
  );
}
