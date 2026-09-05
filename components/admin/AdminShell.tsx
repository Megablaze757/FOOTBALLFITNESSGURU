"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { initialTab, tabForAnchor, type TabDef } from "@/lib/admin-tabs";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";

/**
 * The frame every admin page sits in.
 *
 * WHY IT EXISTS. Admin was one 980-line page holding twelve stacked sections —
 * launch controls, the funnel, churn, affiliates, earnings, every user, every
 * waitlist address, failed video jobs — each rendered as a card of identical
 * weight. Nothing said which belonged together or which mattered today, and
 * finding anything meant scrolling past everything. Splitting it by job means
 * each page answers one question, and the tabs make the set of questions
 * visible without reading any of them.
 *
 * THE GATE LIVES HERE, once. Repeating the role check per page is how one page
 * eventually ships without it. It is a convenience redirect, not the security
 * boundary — every RPC behind these screens checks is_admin() server-side, and
 * that is what actually protects the data.
 */
const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/growth", label: "Growth" },
  { href: "/admin/money", label: "Money" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/social", label: "Social" },
  { href: "/admin/ops", label: "Ops" },
];

export function AdminShell({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);

  const { data, loading } = useAsync(async () => {
    if (!user) return null;
    const { data: profile } = await createClient()
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    return { admin: (profile as { role?: string } | null)?.role === "admin" };
  }, [user?.id]);

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
    if (data && !data.admin) router.replace("/home");
  }, [sessionLoading, user, data, router]);

  // Bring the current tab into view. Without it, opening /admin/ops on a phone
  // shows a row scrolled to the left with the selected tab off the right edge —
  // the one state where the scroll affordance actively misleads, because
  // nothing appears selected at all.
  useEffect(() => {
    const el = navRef.current?.querySelector('[aria-current="page"]');
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  if (sessionLoading || loading || !data || !data.admin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
      </div>
    );
  }

  // Trailing slashes, because the site is a static export and every route is a
  // directory. Comparing raw strings would leave no tab looking selected.
  const here = pathname.replace(/\/$/, "") || "/admin";

  return (
    <main className="mx-auto max-w-3xl animate-fade-up px-6 py-10">
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          {note && <p className="text-sm text-slate-400">{note}</p>}
        </div>
        <Link href="/home" className="tap-target shrink-0 text-sm text-slate-400 hover:text-accent-400">← App</Link>
      </header>

      {/* Scrolls sideways rather than wrapping to a second row. Five tabs fit on
          a desktop and not on a 320px phone, and a nav that changes height as
          you move between pages makes the content below jump. */}
      {/* SCROLLS SIDEWAYS RATHER THAN WRAPPING. Five tabs measure 392px and a
          390px phone has 342px to give them, so something has to move. Wrapping
          to a second row changes the nav's height between pages and makes the
          content below jump; cramming the labels costs legibility on every
          device to fix one. A partly-visible tab is the standard scroll
          affordance, and the effect below guarantees the tab you are actually
          on is the one in view. */}
      <nav ref={navRef} className="-mx-6 mb-6 overflow-x-auto px-6" aria-label="Admin sections">
        <div className="flex w-max gap-1 rounded-xl bg-white/[0.04] p-1">
          {TABS.map((t) => {
            const active = here === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`tap-target rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                  active ? "bg-pitch-400 text-on-accent" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
    </main>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE JOB ON SCREEN AT A TIME.
 *
 * Reported as "make the social page easier to navigate" against a screenshot
 * of five full sections on one scroll — the share loop, three different ways
 * of making a video, and the whole posting schedule. Each is a separate job,
 * and reaching the fourth meant scrolling past three you did not come for, on
 * a phone.
 *
 * The choice is remembered per device, and a LINK BEATS THE MEMORY — see
 * lib/admin-tabs.ts for why that ordering is the whole point.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function AdminTabs({ tabs, storageKey, children }: {
  tabs: TabDef[];
  /** Where the choice is remembered. Per page, so two pages do not fight. */
  storageKey: string;
  children: (active: string) => ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(storageKey); } catch { /* no storage */ }
    setActive(initialTab(tabs, window.location.hash, remembered));
    // `tabs` is a literal built on every render; keying the effect on it would
    // re-run this forever and stamp on the tab somebody just chose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  /**
   * A link arriving while the page is already open.
   *
   * The schedule's "build this" link is a plain anchor, so following it from
   * the Plan tab changes the hash without remounting anything. Without this
   * the URL updates and the panel it points at stays hidden.
   */
  useEffect(() => {
    const onHash = () => {
      const linked = tabForAnchor(tabs, window.location.hash);
      if (linked) setActive(linked);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (id: string) => {
    setActive(id);
    try { localStorage.setItem(storageKey, id); } catch { /* no storage */ }
  };

  return (
    <>
      <div role="tablist" aria-label="Sections" className="-mx-6 mb-6 flex gap-2 overflow-x-auto px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => choose(tab.id)}
            className={`tap-target shrink-0 rounded-full border px-4 text-sm font-semibold transition ${
              active === tab.id
                ? "border-pitch-400/50 bg-pitch-400/10 text-accent-400"
                : "border-white/10 text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children(active)}
    </>
  );
}

/** A titled group of related cards. Replaces twelve sections of equal weight. */
export function AdminArea({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="field-label !mb-0.5">{title}</h2>
      {note && <p className="mb-3 text-xs text-slate-500">{note}</p>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * Folded away until asked for.
 *
 * Long tables are occasionally essential and usually just distance between the
 * things above and below them. Uses the same disclosure marker as the rest of
 * the app rather than `list-none` with the word "tap" — that was a real finding
 * in the UI audit and it applies here too.
 */
export function Drawer({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="card group overflow-hidden">
      <summary className="tap-target flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-200">
        <span className="text-slate-500 transition group-open:rotate-90">▶</span>
        {summary}
      </summary>
      <div className="border-t border-white/[0.06] p-4">{children}</div>
    </details>
  );
}
