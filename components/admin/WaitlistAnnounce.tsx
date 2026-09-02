"use client";

import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth";
import { useCallback, useEffect, useState } from "react";
import { useLaunched } from "@/lib/launch";

interface SendResult { emailed?: number; remaining?: number; note?: string }

/**
 * How many go out per press. pg_net queues each request rather than waiting on
 * it, so this is not bounded by a wall clock the way the Edge Function was, but
 * a smaller number is still a smaller mistake and the button says what is left.
 */
const BATCH = 50;

export function WaitlistAnnounce() {
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
  /**
   * WHICH SENDER IS ACTUALLY LIVE, and therefore which setup is required.
   *
   * The Worker already holds RESEND_API_KEY, so when its route is deployed
   * nothing needs installing and the key box below would be a scary amber
   * warning about a problem that does not exist. The database function is the
   * fallback and needs its own copy of the key in Vault.
   *
   * Probed with `dryRun`, which the route answers before it sends anything —
   * a plain POST would have run the real send. A 404 is the one status that
   * means "route not deployed"; anything else, including 401 and 403, means it
   * is there.
   */
  const [sender, setSender] = useState<"worker" | "database" | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      const base = process.env.NEXT_PUBLIC_API_URL;
      if (base) {
        try {
          const { data: { session } } = await createClient().auth.getSession();
          const res = await fetch(`${base}/announce-launch`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ dryRun: true }),
          });
          if (!live) return;
          if (res.status !== 404) { setSender("worker"); return; }
        } catch {
          // Unreachable Worker. Fall through and ask the database instead.
        }
      }
      if (!live) return;
      setSender("database");
      const { data, error } = await createClient().rpc("has_resend_key");
      if (live) setHasKey(error ? null : data === true);
    })();
    return () => { live = false; };
  }, []);

  const checkKey = useCallback(async () => {
    const { data, error } = await createClient().rpc("has_resend_key");
    setHasKey(error ? null : data === true);
  }, []);

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
  /**
   * TWO SENDERS, WORKER FIRST.
   *
   * The Worker is where RESEND_API_KEY already lives — a Cloudflare secret that
   * cannot be read back out, so the send happening there is the only way to use
   * the key that is already configured. That is the preferred path.
   *
   * The database function is the fallback, for the window before the Worker
   * route is deployed (it ships on the next push to main) and for anyone
   * running without a Worker at all. It needs its own copy of the key in Vault,
   * which is what the box above is for.
   *
   * Tried in that order so the common case needs nothing installed, and the
   * uncommon one still works.
   */
  async function callSend(args: { p_limit?: number; p_test_to?: string }): Promise<{ note?: string; failed?: boolean }> {
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (base) {
      try {
        const { data: { session } } = await createClient().auth.getSession();
        const res = await fetch(`${base}/announce-launch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ limit: args.p_limit, testTo: args.p_test_to }),
        });
        // A 404 means the route is not deployed yet — fall through to the
        // database. Anything else is a real answer and should be reported.
        if (res.status !== 404) {
          const j = await res.json().catch(() => ({})) as
            { error?: string; note?: string; sent?: number; failed?: number; remaining?: number };
          if (!res.ok || j.error) { setErr(j.error || `Send failed (${res.status})`); return { failed: true }; }
          if (args.p_test_to) return { note: j.note ?? `Test sent to ${args.p_test_to}.` };
          return {
            note: `Sent ${j.sent ?? 0}.` +
              (j.failed ? ` ${j.failed} failed - they stay on the list for the next run.` : "") +
              (j.remaining ? ` ${j.remaining} still to go - press again.` : " Nobody left to email."),
          };
        }
      } catch {
        // Network trouble reaching the Worker. The database path may still work.
      }
    }

    const { data, error } = await createClient().rpc("announce_launch", args);
    if (error) {
      setErr(
        /does not exist|schema cache|PGRST202/i.test(error.message)
          ? "The sender is not installed yet. Paste supabase/announce-launch.sql into the Supabase SQL editor, then try again."
          : /resend key in vault/i.test(error.message)
            ? "No Resend key stored. Paste it into the box above, or deploy the Worker route."
            : error.message
      );
      return { failed: true };
    }
    const row = (Array.isArray(data) ? data[0] : data) as SendResult;
    return { note: row?.note };
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
    const { note: n, failed } = await callSend({ p_test_to: testTo.trim() });
    setBusy(null);
    if (failed) return;
    setNote(n ?? `Test queued to ${testTo.trim()}.`);
  }

  async function send() {
    setBusy("send"); setErr(null); setNote(null);
    const { note: n, failed } = await callSend({ p_limit: BATCH });
    setBusy(null);
    setArmed(false);
    if (failed) return;
    setNote(n ?? "Done.");
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
        <span className="text-right">
          <span className="chip text-accent-400">{pending} to send</span>
          {sender && (
            <span className="mt-1 block text-[11px] text-slate-500">
              via {sender === "worker" ? "the Worker" : "the database"}
            </span>
          )}
        </span>
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
            <button onClick={() => void send()} disabled={busy !== null} className="btn-primary !bg-readiness-red !text-[#ffffff]">
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
      {sender === "database" && hasKey === false && (
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
