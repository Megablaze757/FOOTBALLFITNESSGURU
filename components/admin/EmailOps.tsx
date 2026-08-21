"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { RangeToggle } from "@/components/admin/RangeToggle";

/**
 * Is email working, and if not, why not?
 *
 * THE QUESTION NOBODY COULD ANSWER. Every send has written a row to
 * email_delivery_logs since migration 0089 — the provider's id when it worked,
 * its error when it did not — and the only policy on that table was "read own".
 * So an admin querying it saw their own handful of rows and concluded nothing
 * was being sent, which is indistinguishable from nothing being sent. 0095 adds
 * the admin read, and this is the screen that uses it.
 *
 * THE CONFIGURATION CHECK IS NOT OPTIONAL WINDOW DRESSING. It is the most
 * likely answer. GAS_EMAIL_URL and RESEND_API_KEY are Cloudflare secrets, and a
 * secret cannot be read back out — so nothing outside the Worker can tell "no
 * provider configured" from "the cron has not run today". Both look identical
 * from here: no rows. Worse, the Worker is pasted into the dashboard by hand
 * and pasting does not apply wrangler.toml, so a variable set in the repo and
 * never set in the dashboard is simply unset in production. That has already
 * happened to this project more than once.
 */

interface Summary {
  sent: number; failed: number; delivered: number; bounced: number;
  pending: number; success_rate: number | null; last_send: string | null;
}

interface AuditRow {
  sent_at: string; user_id: string | null; recipient: string;
  trigger_kind: string | null; trigger_title: string | null;
  email_category: string | null; status: string; error_message: string | null;
}

interface Status {
  version?: string; provider: string | null; configured: boolean; from: string | null;
  gmailSecretSet?: boolean; resendFallback?: boolean; serviceRoleSet?: boolean;
  crons?: string[]; note?: string;
}

const STATUS_TONE: Record<string, string> = {
  sent: "text-readiness-green", delivered: "text-readiness-green",
  failed: "text-readiness-red", bounced: "text-readiness-red", complained: "text-readiness-red",
  delayed: "text-readiness-yellow", attempted: "text-slate-400", skipped: "text-slate-500",
};

async function callWorker(path: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return { ok: false, data: { error: "NEXT_PUBLIC_API_URL is not set on this build." } };
  const { data: { session } } = await createClient().auth.getSession();
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

export function EmailOps() {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const [summary, audit, status] = await Promise.all([
      supabase.rpc("email_log_summary", { since_days: days }),
      supabase.rpc("email_audit", { since_days: days, max_rows: 100 }),
      callWorker("/email-status"),
    ]);
    return {
      summary: (summary.data?.[0] ?? null) as Summary | null,
      // A missing RPC is the outstanding migration, not an empty log — say
      // which, or the screen reports "no emails" about a query that failed.
      summaryError: summary.error?.message ?? null,
      audit: (audit.data ?? []) as AuditRow[],
      auditError: audit.error?.message ?? null,
      status: (status.ok ? status.data : null) as Status | null,
      statusError: status.ok ? null : String(status.data.error ?? "the Worker did not answer"),
    };
  }, [days], `admin-email:${days}`);

  async function sendTest() {
    setBusy("test"); setNote(null); setError(null);
    const { ok, data: res } = await callWorker("/email-test", testTo.trim() ? { to: testTo.trim() } : {});
    setBusy(null);
    if (ok) { setNote(`Sent to ${res.to} via ${res.provider}.`); reload(); }
    else setError(String(res.error ?? "the test did not send"));
  }

  async function retryQueue() {
    setBusy("retry"); setNote(null); setError(null);
    const { ok, data: res } = await callWorker("/email-retry", {});
    setBusy(null);
    if (ok) { setNote("Queue run. Anything still failing is in the log below."); reload(); }
    else setError(String(res.error ?? "the queue could not be run"));
  }

  const summary = data?.summary;
  const status = data?.status;

  return (
    <div className="space-y-4">
      {/* WHETHER IT CAN SEND AT ALL, before any number about what it did send. */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold text-slate-100">Email configuration</h3>
          {status?.version && <span className="chip text-slate-500">Worker {status.version}</span>}
        </div>
        {data?.statusError ? (
          <p className="text-sm text-readiness-yellow">
            Could not reach the Worker — {data.statusError}. Without it there is no way to tell an unconfigured
            provider from a quiet day.
          </p>
        ) : status ? (
          <div className="space-y-2 text-sm">
            <p className={status.configured ? "text-readiness-green" : "text-readiness-red"}>
              {status.configured ? "✓" : "✕"} {status.note}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-3">
              <Fact label="Provider" value={status.provider ?? "none"} />
              <Fact label="From" value={status.from ?? "not set"} />
              <Fact label="Gmail secret" value={status.gmailSecretSet ? "set" : "not set"} />
              <Fact label="Resend fallback" value={status.resendFallback ? "set" : "not set"} />
              <Fact label="Service role" value={status.serviceRoleSet ? "set" : "not set"} />
              <Fact label="Runs at" value={(status.crons ?? []).join(", ") || "—"} />
            </dl>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Checking…</p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block flex-1">
            <span className="field-label">Send a test to</span>
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="your own address"
              className="field"
              aria-label="Test email recipient"
            />
          </label>
          <button onClick={sendTest} disabled={busy !== null} className="btn-primary w-auto px-4 py-2 text-sm">
            {busy === "test" ? "Sending…" : "Send test"}
          </button>
          <button onClick={retryQueue} disabled={busy !== null} className="btn-ghost w-auto px-4 py-2 text-sm">
            {busy === "retry" ? "Running…" : "Retry the queue"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          The test goes through the same sender the reminders use, so a pass means the real pipeline works —
          not just that one provider answered. Retrying is safe: a failed send never marked itself done, so the
          queue already holds exactly what has not gone out.
        </p>
        {note && <p className="mt-2 text-sm text-readiness-green">{note}</p>}
        {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}
      </div>

      {/* WHAT ACTUALLY WENT OUT. */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold text-slate-100">Delivery</h3>
          <RangeToggle value={days} options={[1, 7, 30]} onChange={setDays} />
        </div>

        {data?.summaryError ? (
          <p className="text-sm text-readiness-yellow">
            {/does not exist|schema cache|PGRST202/i.test(data.summaryError)
              ? "Run migration 0095 — the summary function is not in the database yet."
              : data.summaryError}
          </p>
        ) : loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : summary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Sent" value={summary.sent} tone="text-readiness-green" />
            <Stat label="Failed" value={summary.failed} tone={summary.failed > 0 ? "text-readiness-red" : undefined} />
            <Stat label="Bounced" value={summary.bounced} tone={summary.bounced > 0 ? "text-readiness-yellow" : undefined} />
            {/* Not a status any sender writes — it is the queue, and the only
                number that answers "is the cron running at all". */}
            <Stat label="Queued" value={summary.pending} tone={summary.pending > 20 ? "text-readiness-yellow" : undefined} />
            <Stat label="Success" value={summary.success_rate == null ? "—" : `${summary.success_rate}%`} />
          </div>
        ) : null}
        {summary?.last_send && (
          <p className="mt-3 text-xs text-slate-500">
            Last send attempt {new Date(summary.last_send).toLocaleString()}.
          </p>
        )}
        {summary && summary.sent === 0 && summary.failed === 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Nothing attempted in this window. If the queue above is non-zero, the cron is not reaching the
            Worker or no provider is configured — the panel at the top says which.
          </p>
        )}
      </div>

      {/* WHY EACH ONE WENT OUT — the audit the spec asks for. */}
      <div className="card p-5">
        <h3 className="mb-1 font-bold text-slate-100">What triggered each email</h3>
        <p className="mb-3 text-xs text-slate-500">
          The notification says why it exists; the delivery log says what happened to it. Addresses are masked
          in the database, not in this table — support needs to recognise an address, not read the list.
        </p>
        {data?.auditError ? (
          <p className="text-sm text-readiness-yellow">
            {/does not exist|schema cache|PGRST202/i.test(data.auditError)
              ? "Run migration 0095 — the audit function is not in the database yet."
              : data.auditError}
          </p>
        ) : (data?.audit.length ?? 0) === 0 ? (
          <p className="py-2 text-center text-sm text-slate-500">No sends in the last {days} days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Because</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data!.audit.map((row, i) => (
                  <tr key={`${row.sent_at}-${i}`}>
                    <td className="py-2 pr-3 text-xs tabular-nums text-slate-400">
                      {new Date(row.sent_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-300">{row.recipient}</td>
                    <td className="py-2 pr-3 text-xs text-slate-300">
                      {row.trigger_title ?? <span className="text-slate-600">not from a notification</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{row.email_category ?? row.trigger_kind ?? "—"}</td>
                    <td className={`py-2 text-xs font-semibold ${STATUS_TONE[row.status] ?? "text-slate-400"}`}>
                      {row.status}
                      {row.error_message && (
                        <span className="mt-0.5 block max-w-[24ch] truncate font-normal text-slate-500" title={row.error_message}>
                          {row.error_message}
                        </span>
                      )}
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

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className={`text-2xl font-extrabold tabular-nums ${tone ?? "text-slate-100"}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-600">{label}</dt>
      <dd className="truncate text-slate-300" title={value}>{value}</dd>
    </div>
  );
}
