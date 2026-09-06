"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { useCurrentUser } from "@/lib/auth";
import { poundsFromPennies } from "@/lib/affiliate";
import { referralLink, signupLink } from "@/lib/referral";

/**
 * An affiliate's own dashboard.
 *
 * WHY IT EXISTS. Everything about the programme lived behind the admin screens
 * — earnings, signups, conversion, the lot — so somebody promoting the app had
 * no way to find out whether it was working except to ask the owner. That does
 * not scale past about three affiliates, and it makes the arrangement feel like
 * a favour rather than a business one.
 *
 * NOT UNDER /admin, and not gated on a subscription. An affiliate is not
 * necessarily a paying athlete, and several are not athletes at all; making
 * them buy Pro to see what they have earned would be absurd. It sits inside the
 * authenticated app because it needs an account to know who is asking, and
 * nothing more than that.
 *
 * RENDERS NOTHING FOR NON-AFFILIATES. `my_affiliate_stats` returns no rows for
 * an account that is not one, and the page says so plainly rather than showing
 * a dashboard full of zeroes — "you have earned £0" and "you are not in the
 * programme" are different sentences.
 */
interface Stats {
  code: string;
  name: string;
  active: boolean;
  rate_pct: string | number | null;
  created_at: string;
  referred_signups: number;
  paying_clients: number;
  waitlist: number;
  pending_pennies: number;
  approved_pennies: number;
  paid_pennies: number;
  reversed_pennies: number;
}

interface LedgerRow {
  earned_on: string;
  level: number;
  amount_pennies: number;
  status: string;
}

export default function PartnerPage() {
  const user = useCurrentUser();
  const [copied, setCopied] = useState<string | null>(null);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();

    /**
     * CLAIM FIRST, THEN READ.
     *
     * Affiliates created before any of this have no `user_id`, only an email,
     * and matching on an email forever is not safe — an address can change, and
     * whoever holds it next would inherit somebody's commission. The first load
     * writes the link; every load after that is an exact match. It cannot be
     * claimed twice, and a failure here is not fatal because the read below
     * still falls back to the email.
     */
    await supabase.rpc("claim_affiliate");

    const [{ data: stats }, { data: ledger }] = await Promise.all([
      supabase.rpc("my_affiliate_stats"),
      supabase.rpc("my_affiliate_ledger", { limit_n: 30 }),
    ]);
    return {
      stats: ((stats ?? []) as Stats[])[0] ?? null,
      ledger: (ledger ?? []) as LedgerRow[],
    };
  }, [user.id], `partner:${user.id}`);

  async function copy(what: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-56 animate-pulse rounded-lg bg-white/5" />
        <div className="card h-64 animate-pulse" />
      </div>
    );
  }

  const s = data?.stats;

  if (!s) {
    return (
      <div className="animate-fade-up">
        <h1 className="mb-2 text-2xl font-extrabold text-slate-100">Partner dashboard</h1>
        <div className="card p-5">
          <p className="text-sm text-slate-300">
            This account is not linked to an affiliate code.
          </p>
          {/* THE ACTUAL FIX, SAID OUT LOUD. Most people who land here with no
              link are affiliates whose row was created without an email, or
              with a different one from the account they signed in with — and
              they cannot tell that from being rejected. */}
          <p className="mt-2 text-xs text-slate-500">
            If you are one of our partners, your code was probably set up before we had this page, or
            against a different email. We link them by the address on your account —{" "}
            <span className="text-slate-400">{user.email}</span> — so send us that and we will attach it.
          </p>
        </div>
      </div>
    );
  }

  const owed = s.pending_pennies + s.approved_pennies;
  const rate = s.rate_pct != null ? Number(s.rate_pct) : null;

  return (
    <div className="animate-fade-up space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-100">Partner dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          {s.name} · code <span className="font-mono text-slate-300">{s.code}</span>
          {rate != null && <> · {rate}% commission</>}
          {!s.active && <span className="ml-2 text-readiness-red">paused</span>}
        </p>
      </header>

      {/* THE TWO NUMBERS THAT ARE NOT THE SAME NUMBER.
          Approved has cleared the 30-day refund window and can be paid;
          pending has not. Showing one total would mean an affiliate counting on
          money that might still be clawed back, which is the conversation this
          distinction exists to prevent. */}
      <section className="grid grid-cols-2 gap-3">
        <Stat label="Ready to pay" value={`${poundsFromPennies(s.approved_pennies)}`} tone="good" />
        <Stat label="Still in the refund window" value={`${poundsFromPennies(s.pending_pennies)}`} />
        <Stat label="Paid out so far" value={`${poundsFromPennies(s.paid_pennies)}`} />
        <Stat
          label="Refunded back"
          value={`${poundsFromPennies(s.reversed_pennies)}`}
          tone={s.reversed_pennies > 0 ? "bad" : undefined}
        />
      </section>

      <section className="card p-5">
        <h2 className="field-label">Where it comes from</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Count label="On the waitlist" n={s.waitlist} />
          <Count label="Signed up" n={s.referred_signups} />
          <Count label="Paying" n={s.paying_clients} />
        </div>
        {/* The conversion rate, computed rather than left as an exercise —
            it is the number that tells them whether to keep going. */}
        {s.referred_signups > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {Math.round((s.paying_clients / s.referred_signups) * 100)}% of the people you have sent us
            are on a paid plan.
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="field-label">Your links</h2>
        <div className="space-y-2">
          <LinkRow
            label="Site"
            value={referralLink(s.code)}
            copied={copied === "site"}
            onCopy={() => copy("site", referralLink(s.code))}
          />
          <LinkRow
            label="Sign up"
            value={signupLink(s.code)}
            copied={copied === "signup"}
            onCopy={() => copy("signup", signupLink(s.code))}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Anyone who arrives through these is attributed to you on first touch — so it still counts if
          they come back a week later and sign up directly.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="field-label">Recent commission</h2>
        {data!.ledger.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing yet. Commission appears here the first time somebody you sent us pays.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {data!.ledger.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-slate-400">
                  {new Date(r.earned_on).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  {/* Level 2 is commission on somebody THEIR referral brought
                      in, and it looks like a mistake unless it is labelled. */}
                  {r.level > 1 && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-600">sub-partner</span>}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="text-xs text-slate-500">{r.status}</span>
                  <b className={r.status === "reversed" ? "text-slate-600 line-through" : "text-slate-100"}>
                    {poundsFromPennies(r.amount_pennies)}
                  </b>
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* NO CUSTOMER NAMES, and it is worth saying why rather than leaving it
            looking like an omission. */}
        <p className="mt-3 text-[11px] text-slate-600">
          Dates and amounts only — we do not share who your referrals are.
        </p>
      </section>

      {owed > 0 && (
        <p className="text-center text-xs text-slate-500">
          {poundsFromPennies(owed)} earned in total. Payouts are made once commission clears the
          refund window. <Link href="/profile" className="text-accent-400">Questions?</Link>
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-accent-400" : tone === "bad" ? "text-readiness-red" : "text-slate-100";
  return (
    <div className="card p-4">
      <div className="stat-label !mb-1">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <div className="text-2xl font-extrabold tabular-nums text-slate-100">{n}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function LinkRow({ label, value, copied, onCopy }: {
  label: string; value: string; copied: boolean; onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <code className="min-w-0 flex-1 truncate text-xs text-slate-300">{value}</code>
      <button onClick={onCopy} className="chip shrink-0 text-accent-400">{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
