"use client";

import { useMemo, useState } from "react";
import { SKILL_DRILLS, type SkillDrill } from "@/lib/skills";
import { buildDrillCardSvg, type CardStyle } from "@/lib/drill-card";
import { POST_SIZES, svgDimensions, type PostSize } from "@/lib/post-size";
import { drillCaption, demoCaption, renderCaption, captionProblems } from "@/lib/caption";
import { buildDemoCardSvg, DEMO_SCREENS, type DemoScreen } from "@/lib/demo-card";
import { FACT_GROUPS, PILLARS, LAUNCH_SEQUENCE, CHANNELS, NEVER_CLAIM, allFacts } from "@/lib/content";
import { guideSports, sportLabel } from "@/lib/seo";
import { plannedPosts, type PlannedPost } from "@/lib/post-plan";
import { postTriggers, type Trigger } from "@/lib/post-triggers";
import { reelHref, reelKindFor } from "@/lib/reel-link";
import { nearMisses, gapSummary } from "@/lib/content-gaps";
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
type Tab = "schedule" | "plan" | "drills" | "demos" | "write";

const TABS: { id: Tab; label: string }[] = [
  { id: "schedule", label: "🗓 This week" },
  { id: "plan", label: "📋 Plan" },
  { id: "drills", label: "🎯 Drill cards" },
  { id: "demos", label: "📱 App demos" },
  { id: "write", label: "✍️ AI writer" },
];

export function ContentEngine() {
  // Opens on the schedule, because "what do I post today" is the question,
  // and the plan tab answers "what kinds of thing should I post" — good
  // advice you need once, in front of the thing you need every day.
  const [tab, setTab] = useState<Tab>("schedule");

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
                ? "border-pitch-400/50 bg-pitch-400/10 text-accent-400"
                : "border-white/10 bg-white/[0.03] text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "schedule" && <ScheduleTab />}
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
              <span className="w-14 shrink-0 text-sm font-extrabold text-accent-400">{s.when}</span>
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

async function rasterise(svg: string): Promise<Blob> {
  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  await img.decode();
  // READ FROM THE MARKUP. This took a `size` and set width AND height from it,
  // so the first non-square card would have been squashed into a square — and
  // silently, because the preview is the SVG and only the export is the canvas.
  const { w, h } = svgDimensions(svg);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
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

/**
 * The caption, next to the picture it belongs to.
 *
 * Exporting an image and then writing the words somewhere else is where the
 * habit dies — 38 drills is 38 posts only if the post is finished when the
 * download completes. Re-checked against the claim rules on the way out, so a
 * hand-edit that reintroduces a banned claim is visible before it is posted
 * rather than after.
 */
function CaptionBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const problems = captionProblems(text);
  return (
    <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">{text}</pre>
      {problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-readiness-red">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="tap-target mt-2 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06]"
      >
        {copied ? "Caption copied" : "Copy caption"}
      </button>
    </div>
  );
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
  const [size, setSize] = useState<PostSize>("portrait");
  const [handle, setHandle] = useState("pocketathlete.com/drills");
  const [busy, setBusy] = useState<string | null>(null);

  const drills = useMemo(() => SKILL_DRILLS.filter((d) => d.sport === sport), [sport]);

  async function one(d: SkillDrill) {
    setBusy(d.id);
    try {
      await downloadPng(buildDrillCardSvg({ drill: d, sportLabel: sportLabel(sport), style, handle, size }), `${d.id}-${style}-${size}.png`);
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
        <Picker
          label="Size"
          options={POST_SIZES.map((o) => [o.id, `${o.label} · ${o.note.split(" · ")[1] ?? o.note}`] as [string, string])}
          value={size}
          onChange={(v) => setSize(v as PostSize)}
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
          <div key={d.id}>
            <CardPreview
              label={d.name}
              busy={busy === d.id}
              svg={buildDrillCardSvg({ drill: d, sportLabel: sportLabel(sport), style, handle, size })}
              onDownload={() => one(d)}
            />
            <CaptionBox text={renderCaption(drillCaption(d, { link: handle }))} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- App demos ---------------------------------------------------------------

function DemosTab() {
  const [headlines, setHeadlines] = useState<Record<string, string>>({});
  const [size, setSize] = useState<PostSize>("portrait");
  const [busy, setBusy] = useState<string | null>(null);

  async function one(screen: DemoScreen) {
    setBusy(screen);
    try {
      await downloadPng(buildDemoCardSvg({ screen, headline: headlines[screen] || undefined, size }), `demo-${screen}-${size}.png`);
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <p className="card p-4 text-sm text-slate-400">
        Drawn, not screenshotted — so they can&apos;t leak an athlete&apos;s data or show a
        feature that doesn&apos;t exist. Edit any headline.
      </p>

      <div className="card p-5">
        <Picker
          label="Size"
          options={POST_SIZES.map((o) => [o.id, `${o.label} · ${o.note.split(" · ")[1] ?? o.note}`] as [string, string])}
          value={size}
          onChange={(v) => setSize(v as PostSize)}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {DEMO_SCREENS.map((s) => (
          <div key={s.id}>
            <CardPreview
              label={s.label}
              busy={busy === s.id}
              svg={buildDemoCardSvg({ screen: s.id, headline: headlines[s.id] || undefined, size })}
              onDownload={() => one(s.id)}
            />
            <input
              value={headlines[s.id] ?? ""}
              onChange={(e) => setHeadlines((h) => ({ ...h, [s.id]: e.target.value }))}
              placeholder={s.caption}
              aria-label={`Headline for ${s.label}`}
              className="field mt-2"
            />
            <CaptionBox text={renderCaption(demoCaption(s.id))} />
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
                    on ? "border-pitch-400/50 bg-pitch-400/10 text-accent-400" : "border-white/10 text-slate-300"
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
                <h4 className="text-sm font-bold text-accent-400">{o.title}</h4>
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
        <summary className="min-h-[44px] cursor-pointer text-sm font-semibold text-slate-200">
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
              value === id ? "border-pitch-400/50 bg-pitch-400/10 text-accent-400" : "border-white/10 text-slate-300"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- the schedule ------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PLAN SAID WHAT KINDS OF THING TO POST. THIS SAYS WHAT TO POST.
 *
 * Every tool on the other tabs begins with a blank field — the writer wants a
 * topic typed in, the drill cards want a drill chosen. So the first step is
 * always somebody deciding what today's subject is, which is the step that
 * does not happen on a busy Tuesday. A content engine full of good tools
 * produces nothing because of one empty box at the front of it.
 *
 * The subjects come out of catalogues that already exist and were already
 * researched: a hundred skill drills, the costed collections, the strength
 * standards, the protein index, the app's own screens. See lib/post-plan.ts —
 * it is derived from the date, so there is no queue to keep in step and the
 * same week shows on every device.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function ScheduleTab() {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const posts = useMemo(() => plannedPosts(from, 7), [from]);
  /**
   * WHAT HAPPENED, ABOVE WHAT WAS PLANNED.
   *
   * The schedule covers an ordinary Tuesday. It cannot cover the day the
   * protein index moves or the first athlete publishes a page — those are news
   * rather than content, they are the posts with a reason to exist, and they
   * are exactly the ones that go unposted because the data changed in a file
   * and no screen ever mentioned it. See lib/post-triggers.ts.
   *
   * Not fetched: every trigger is computed from catalogues compiled into this
   * bundle, so the list is right the moment the page renders. The two that
   * need a count from the database are passed in by the panel that already
   * has them.
   */
  const triggers = useMemo(() => postTriggers(), []);
  const gaps = useMemo(() => nearMisses(), []);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /**
   * One draft, from the topic the schedule already wrote.
   *
   * The facts are the ones that post is allowed to draw on — narrower than the
   * writer tab's default of everything, because a post about one drill has no
   * business quoting the protein index.
   */
  /** A trigger drafts exactly like a scheduled post — same writer, same rule
   *  about which facts it may use. Only the key differs. */
  function draftTrigger(t: Trigger) {
    return write(t.id, t.topic, t.factGroups);
  }

  async function write(key: string, topic: string, factGroups: string[]) {
    setBusy(key);
    setError(null);
    try {
      const facts = FACT_GROUPS.filter((g) => factGroups.includes(g.id)).flatMap((g) => g.facts);
      const r = await invokeAI<{ options?: { title: string; body: string }[] }>(
        "generate-content",
        { format: "caption", topic, facts, count: 1 },
        45_000,
      );
      const body = r.options?.[0]?.body?.trim();
      setDrafts((d) => ({ ...d, [key]: body || "Nothing usable came back — try again." }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /**
   * ONE IMPLEMENTATION. A scheduled post and a trigger differ in where the
   * topic came from and in nothing else — two copies of this fetch would be
   * two things to keep in step, and the one that drifts is always the one
   * nobody is looking at.
   */
  function draft(post: PlannedPost) {
    return write(post.date, post.topic, post.factGroups);
  }

  /**
   * SEQUENTIAL, NOT Promise.all.
   *
   * Seven at once is seven simultaneous requests at a rate-limited free tier,
   * and the way that fails is five drafts and two errors — worse than waiting.
   * It also stops on the first failure rather than burning the remaining quota
   * against a provider that is plainly not answering.
   */
  async function draftAll() {
    for (const post of posts) {
      if (drafts[post.date]) continue;
      await draft(post);
      if (error) return;
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="field-label">Week beginning</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value || from)}
              className="field"
            />
          </label>
          <button onClick={draftAll} disabled={busy !== null} className="btn-primary">
            {busy ? "Writing…" : "Draft all seven"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Subjects come from the drills, collections, standards and screens already in the app —
          nothing here is invented. The mix follows the pillars on the Plan tab. Drafting is free:
          admin tools are pinned to the zero-cost models so a week of captions costs nothing and
          leaves the paid allowance for athletes.
        </p>
        {error && <p className="text-sm text-readiness-red">{error}</p>}
      </div>

      {gaps.length > 0 && (
        /* ═══════════════════════════════════════════════════════════════════
           THE PAGES THAT ALMOST EXIST.

           Not a post — a to-do list, and the only one on this project that is
           derived rather than written. Every line is an indexable page that
           does not exist, priced in how many things it is short of. It sits on
           the social tab because "publish a page that answers a search" is the
           same job as posting, done once and for good.

           See lib/content-gaps.ts. Some entries are a tagging fix rather than
           new content, and the copy says which — but says to check, because
           one of the first two it suggested was wrong.
           ═══════════════════════════════════════════════════════════════════ */
        <details className="rounded-2xl border border-white/10 p-4">
          <summary className="min-h-[44px] cursor-pointer text-sm font-semibold text-slate-200">
            📄 {gapSummary()}
          </summary>
          <ul className="mt-3 space-y-2">
            {gaps.map((g) => (
              <li key={g.href} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip shrink-0 text-accent-400">{g.short} short</span>
                  <span className="chip shrink-0">{g.kind}</span>
                  <span className="text-sm font-bold text-slate-100">{g.name}</span>
                  <span className="text-xs text-slate-500">{g.have}/{g.need}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{g.todo}</p>
                <span className="text-xs text-slate-600">{g.href}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {triggers.filter((t) => t.heat === "news").length > 0 && (
        <div className="rounded-2xl border border-pitch-400/30 bg-pitch-400/[0.05] p-4">
          <h4 className="text-sm font-extrabold text-accent-400">Worth posting now</h4>
          <p className="mt-1 text-xs text-slate-400">
            These are things that have actually changed. Post one instead of the day&apos;s scheduled
            subject — news beats rotation.
          </p>
          <ul className="mt-3 space-y-2">
            {triggers.filter((t) => t.heat === "news").map((t) => (
              <li key={t.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-sm font-bold text-slate-100">{t.headline}</p>
                <p className="mt-1 text-sm text-slate-400">{t.topic}</p>
                <button
                  onClick={() => draftTrigger(t)}
                  disabled={busy !== null}
                  className="tap-target mt-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300"
                >
                  {busy === t.id ? "Writing…" : drafts[t.id] ? "Redraft" : "Draft"}
                </button>
                {drafts[t.id] && (
                  <p className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-200">
                    {drafts[t.id]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {posts.map((post) => (
        <div key={post.date} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip shrink-0">{dayLabel(post.date)}</span>
                <span className="chip shrink-0 text-accent-400">{post.pillarName}</span>
                <span className="chip shrink-0">{post.asset}</span>
              </div>
              <h4 className="mt-2 text-sm font-bold text-slate-100">{post.subject}</h4>
              <p className="mt-1 text-sm text-slate-400">{post.topic}</p>
              {post.href && (
                <a href={post.href} className="mt-1 inline-block text-xs text-accent-400">
                  {post.href}
                </a>
              )}
            </div>
            <span className="flex shrink-0 flex-wrap gap-2">
              {/* THE PLAN AND THE THING THAT MAKES IT, JOINED UP.
                  The row already knows the subject and the asset; finding it in
                  the studio below meant scrolling, choosing the kind and
                  retyping the name. Only offered where a reel is honestly the
                  asset — "Text only" is a caption, and a link to a picker with
                  nothing in it is worse than no link. */}
              {reelKindFor(post.asset) && (
                <a
                  href={reelHref({ kind: reelKindFor(post.asset)!, query: post.subject })}
                  className="tap-target rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"
                >
                  Make the reel
                </a>
              )}
              <button
                onClick={() => draft(post)}
                disabled={busy !== null}
                className="tap-target rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"
              >
                {busy === post.date ? "Writing…" : drafts[post.date] ? "Redraft" : "Draft"}
              </button>
            </span>
          </div>

          {drafts[post.date] && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <p className="whitespace-pre-wrap text-sm text-slate-200">{drafts[post.date]}</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(drafts[post.date]);
                  setCopied(post.date);
                  setTimeout(() => setCopied(null), 1500);
                }}
                className="tap-target mt-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300"
              >
                {copied === post.date ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** "2026-09-07" → "Mon 7 Sep". UTC, so a label never slips a day. */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${day} ${d.getUTCDate()} ${month}`;
}
