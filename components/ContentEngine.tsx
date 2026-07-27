"use client";

import { useMemo, useState } from "react";
import { SKILL_DRILLS, type SkillDrill } from "@/lib/skills";
import { buildDrillCardSvg, type CardStyle } from "@/lib/drill-card";
import { buildDemoCardSvg, DEMO_SCREENS, type DemoScreen } from "@/lib/demo-card";
import { FACT_GROUPS, PILLARS, LAUNCH_SEQUENCE, CHANNELS, NEVER_CLAIM, allFacts } from "@/lib/content";
import { guideSports, sportLabel } from "@/lib/seo";
import { invokeAI } from "@/lib/api";
import type { SportId } from "@/lib/exercises";

/**
 * The content engine.
 *
 * Four tools that share one source of truth (lib/content.ts): a plan for what
 * to post, images generated from the drills we've already written, mockups of
 * real app screens, and an AI writer that may only build on verified facts.
 *
 * All of it lives in admin because it's a marketing back-office, not a user
 * feature — and because the AI writer spends real money per call.
 */
type Tab = "plan" | "drills" | "demos" | "write";

const TABS: { id: Tab; label: string }[] = [
  { id: "plan", label: "📋 Plan" },
  { id: "drills", label: "🎯 Drill cards" },
  { id: "demos", label: "📱 App demos" },
  { id: "write", label: "✍️ AI writer" },
];

export function ContentEngine() {
  const [tab, setTab] = useState<Tab>("plan");

  return (
    <div>
      <h2 className="field-label mb-3">🎬 Content engine</h2>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`tap-target shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                : "border-white/10 bg-white/[0.03] text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "plan" && <PlanTab />}
      {tab === "drills" && <DrillCardsTab />}
      {tab === "demos" && <DemosTab />}
      {tab === "write" && <WriterTab />}
    </div>
  );
}

// --- Plan --------------------------------------------------------------------

function PlanTab() {
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h3 className="text-base font-extrabold">What to post</h3>
        <p className="mt-1 text-sm text-slate-400">
          Rotate all four. An account that only sells gets no reach; one that only teaches gets
          no signups.
        </p>
        <div className="mt-4 space-y-3">
          {PILLARS.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-slate-100">{p.name}</h4>
                <span className="chip shrink-0">{p.share} in 10</span>
              </div>
              <p className="mt-1 text-sm text-slate-400">{p.purpose}</p>
              <ul className="mt-2 space-y-1">
                {p.prompts.map((x) => (
                  <li key={x} className="text-xs text-slate-500">• {x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h3 className="text-base font-extrabold">Launch sequence</h3>
        <p className="mt-1 text-sm text-slate-400">
          Work backwards from the date — and don&apos;t announce one until a real card has gone
          through Checkout.
        </p>
        <ol className="mt-4 space-y-3">
          {LAUNCH_SEQUENCE.map((s) => (
            <li key={s.when} className="flex gap-3">
              <span className="w-14 shrink-0 text-sm font-extrabold text-pitch-400">{s.when}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-100">{s.what}</span>
                <span className="block text-sm text-slate-400">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5">
        <h3 className="text-base font-extrabold">Where it goes</h3>
        <ol className="mt-3 space-y-2">
          {CHANNELS.map((c, i) => (
            <li key={c.name} className="text-sm">
              <span className="font-semibold text-slate-100">{i + 1}. {c.name}</span>
              <span className="block text-slate-400">{c.note}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-readiness-red/20 bg-readiness-red/[0.03] p-5">
        <h3 className="text-base font-extrabold text-slate-100">Never claim</h3>
        <p className="mt-1 text-sm text-slate-400">
          These are the ones you can&apos;t walk back. The AI writer is instructed against them and
          filters anything that slips through, but it can&apos;t filter what you type yourself.
        </p>
        <ul className="mt-3 space-y-1.5">
          {NEVER_CLAIM.map((c) => (
            <li key={c} className="text-sm text-slate-300">✗ {c}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// --- Shared export -----------------------------------------------------------

async function rasterise(svg: string, size = 1080): Promise<Blob> {
  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
  );
}

async function downloadPng(svg: string, name: string) {
  const url = URL.createObjectURL(await rasterise(svg));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function CardPreview({ svg, onDownload, label, busy }: { svg: string; onDownload: () => void; label: string; busy: boolean }) {
  return (
    <div>
      {/* A data-URI <img> so the preview is byte-for-byte what exports. */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
        alt={label}
        className="w-full rounded-2xl border border-white/10"
      />
      <button
        onClick={onDownload}
        disabled={busy}
        className="tap-target mt-2 w-full rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50"
      >
        {busy ? "Exporting…" : `Download PNG`}
      </button>
    </div>
  );
}

// --- Drill cards -------------------------------------------------------------

function DrillCardsTab() {
  const [sport, setSport] = useState<SportId>("football");
  const [style, setStyle] = useState<CardStyle>("drill");
  const [handle, setHandle] = useState("pocketathlete.com/drills");
  const [busy, setBusy] = useState<string | null>(null);

  const drills = useMemo(() => SKILL_DRILLS.filter((d) => d.sport === sport), [sport]);

  async function one(d: SkillDrill) {
    setBusy(d.id);
    try {
      await downloadPng(buildDrillCardSvg({ drill: d, sportLabel: sportLabel(sport), style, handle }), `${d.id}-${style}.png`);
    } finally { setBusy(null); }
  }

  async function all() {
    for (const d of drills) {
      await one(d);
      // Browsers throttle or silently drop a burst of simultaneous downloads.
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5">
        <Picker label="Sport" options={guideSports().map((s) => [s, sportLabel(s)])} value={sport} onChange={(v) => setSport(v as SportId)} />
        <Picker
          label="Layout"
          options={[["drill", "Full drill"], ["cue", "Cue only"]]}
          value={style}
          onChange={(v) => setStyle(v as CardStyle)}
        />
        <label className="block">
          <span className="field-label">Footer link</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} className="field" />
          <span className="mt-1 block text-xs text-slate-500">
            Add your <code>?ref=</code> code so signups get attributed.
          </span>
        </label>
        <button onClick={all} disabled={!!busy} className="btn-primary">
          {busy ? "Exporting…" : `Download all ${drills.length}`}
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {drills.map((d) => (
          <CardPreview
            key={d.id}
            label={d.name}
            busy={busy === d.id}
            svg={buildDrillCardSvg({ drill: d, sportLabel: sportLabel(sport), style, handle })}
            onDownload={() => one(d)}
          />
        ))}
      </div>
    </div>
  );
}

// --- App demos ---------------------------------------------------------------

function DemosTab() {
  const [headlines, setHeadlines] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function one(screen: DemoScreen) {
    setBusy(screen);
    try {
      await downloadPng(buildDemoCardSvg({ screen, headline: headlines[screen] || undefined }), `demo-${screen}.png`);
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <p className="card p-4 text-sm text-slate-400">
        These screens are <b className="text-slate-200">drawn, not screenshotted</b> — so they
        can&apos;t leak a real athlete&apos;s data and can&apos;t drift into showing a feature that
        doesn&apos;t exist. Edit the headline on any of them.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        {DEMO_SCREENS.map((s) => (
          <div key={s.id}>
            <CardPreview
              label={s.label}
              busy={busy === s.id}
              svg={buildDemoCardSvg({ screen: s.id, headline: headlines[s.id] || undefined })}
              onDownload={() => one(s.id)}
            />
            <input
              value={headlines[s.id] ?? ""}
              onChange={(e) => setHeadlines((h) => ({ ...h, [s.id]: e.target.value }))}
              placeholder={s.caption}
              aria-label={`Headline for ${s.label}`}
              className="field mt-2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- AI writer ---------------------------------------------------------------

const FORMATS: [string, string][] = [
  ["caption", "Caption"],
  ["hook", "Video hook"],
  ["carousel", "Carousel"],
  ["script", "Video script"],
  ["thread", "Thread"],
];

function WriterTab() {
  const [format, setFormat] = useState("caption");
  const [topic, setTopic] = useState("");
  const [groups, setGroups] = useState<string[]>(FACT_GROUPS.map((g) => g.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ options: { title: string; body: string }[]; rejected: number } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const facts = useMemo(
    () => FACT_GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => g.facts),
    [groups],
  );

  async function generate() {
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await invokeAI<{ options?: { title: string; body: string }[]; rejected?: number }>(
        "generate-content",
        { format, topic: topic.trim(), facts, count: 3 },
        45_000,
      );
      setResult({ options: r.options ?? [], rejected: r.rejected ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5">
        <Picker label="Format" options={FORMATS} value={format} onChange={setFormat} />

        <label className="block">
          <span className="field-label">What&apos;s it about?</span>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="e.g. why a centre back shouldn't train like a winger"
            className="field resize-none"
          />
        </label>

        <div>
          <span className="field-label">Facts it may use</span>
          <div className="flex flex-wrap gap-2">
            {FACT_GROUPS.map((g) => {
              const on = groups.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => setGroups((s) => (on ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                  aria-pressed={on}
                  className={`tap-target rounded-full border px-3 py-1.5 text-sm transition ${
                    on ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 text-slate-300"
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {facts.length} verified facts. It&apos;s told to invent nothing and use only these —
            narrow the selection to keep a post on one idea.
          </p>
        </div>

        <button onClick={generate} disabled={busy || !topic.trim()} className="btn-primary">
          {busy ? "Writing…" : "Generate 3 options"}
        </button>
        {error && <p className="text-sm text-readiness-red">{error}</p>}
      </div>

      {result && (
        <div className="space-y-3">
          {result.rejected > 0 && (
            <p className="rounded-2xl border border-readiness-red/20 bg-readiness-red/[0.04] p-4 text-sm text-slate-300">
              {result.rejected} option{result.rejected > 1 ? "s were" : " was"} discarded for making a
              claim we can&apos;t back up — invented user numbers or a medical promise. Worth knowing
              the model reaches for those.
            </p>
          )}
          {!result.options.length && (
            <p className="card p-4 text-sm text-slate-400">
              Nothing usable came back. Try a more specific topic.
            </p>
          )}
          {result.options.map((o, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-bold text-pitch-400">{o.title}</h4>
                <button
                  onClick={() => { navigator.clipboard.writeText(o.body); setCopied(i); setTimeout(() => setCopied(null), 1500); }}
                  className="tap-target shrink-0 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300"
                >
                  {copied === i ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{o.body}</p>
            </div>
          ))}
        </div>
      )}

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">
          The {allFacts().length} facts it can draw on
        </summary>
        <div className="mt-3 space-y-3">
          {FACT_GROUPS.map((g) => (
            <div key={g.id}>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">{g.label}</h4>
              <ul className="mt-1 space-y-1">
                {g.facts.map((f) => <li key={f} className="text-sm text-slate-400">• {f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// --- Bits --------------------------------------------------------------------

function Picker({ label, options, value, onChange }: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(([id, text]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-pressed={value === id}
            className={`tap-target rounded-full border px-3 py-1.5 text-sm transition ${
              value === id ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 text-slate-300"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
