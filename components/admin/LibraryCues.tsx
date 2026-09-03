"use client";

import { useMemo, useState } from "react";
import { EXERCISES, isRunEntry } from "@/lib/exercises";
import { draftTargets, draftProblems, parseDraft, type Draft, type DraftTarget } from "@/lib/exercise-draft";
import { invokeAI } from "@/lib/api";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAFTING THE LIBRARY'S MISSING CUES, ON THE KEY THAT IS ALREADY DEPLOYED.
 *
 * 197 movements in lib/exercise-catalog.ts have a real how-to written by a
 * person and `why: "Builds the back.", cues: []`. That is 221 of the pages
 * still under 200 words — the last large piece of content work on the site.
 *
 * The offline script does this too, and needs a key on the machine running it.
 * The Worker already HAS one — NVIDIA's, free, on the same ladder as the rest
 * — so this screen borrows it: /draft-exercise with `freeOnly`, which restricts
 * the ladder to its zero-cost rungs. No key to set, nothing to paste, and the
 * spend cap stays for the calls an athlete is waiting on.
 *
 * WHAT IT WILL NOT DO. It cannot save anything. These exercises are a compiled
 * TypeScript file, not a table, so the only way one reaches an athlete is a
 * person reading a diff and committing it. The output is text to paste, which
 * is a stronger gate than any review queue.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const TARGETS = draftTargets(EXERCISES.filter((e) => !isRunEntry(e)));

interface Drafted {
  target: DraftTarget;
  draft: Draft;
  problems: string[];
}

/** A COACHING line, keyed by lowercased name exactly as build() reads it. */
function coachingLine(d: Drafted): string {
  const q = (s: string) => JSON.stringify(s);
  return `  ${q(d.target.name.toLowerCase())}: { cues: [${d.draft.cues.map(q).join(", ")}], why: ${q(d.draft.why)} },`;
}

export function LibraryCues() {
  const [limit, setLimit] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Drafted[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const clean = useMemo(() => done.filter((d) => d.problems.length === 0), [done]);
  const held = useMemo(() => done.filter((d) => d.problems.length > 0), [done]);
  const remaining = useMemo(
    () => TARGETS.filter((t) => !done.some((d) => d.target.id === t.id)),
    [done],
  );

  async function run() {
    setError(null);
    const batch = remaining.slice(0, limit);
    for (let i = 0; i < batch.length; i++) {
      const target = batch[i];
      setBusy(`${i + 1} of ${batch.length} — ${target.name}`);
      try {
        const res = await invokeAI<{ draft?: unknown }>("draft-exercise", {
          name: target.name,
          category: target.category,
          equipment: target.equipment,
          // The row's OWN how-to, so the model writes cues for this movement
          // rather than for what it assumes from the name. It is also what
          // draftProblems checks the cues against.
          note: target.description,
          freeOnly: true,
        });
        const raw = res?.draft as { cues?: unknown; why?: unknown } | undefined;
        const draft = parseDraft(JSON.stringify({ cues: raw?.cues ?? [], why: raw?.why ?? "" }), target.id);
        if (!draft) { setError(`${target.name}: the model returned nothing usable.`); continue; }
        setDone((d) => [...d, { target, draft, problems: draftProblems(draft, target) }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setBusy(null);
  }

  const paste = clean.map(coachingLine).join("\n");

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        {TARGETS.length} movements have a written how-to and no coaching cues. Drafted on the
        Worker&apos;s free models, checked against each movement&apos;s own description, and output as
        lines to paste into <code>COACHING</code> in <code>lib/exercise-catalog.ts</code>. Nothing is
        saved from here — the library is code.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {[5, 20, 50].map((n) => (
          <button
            key={n}
            onClick={() => setLimit(n)}
            aria-pressed={limit === n}
            className={`tap-target rounded-full border px-3 py-1.5 text-sm transition ${
              limit === n ? "border-pitch-400/50 bg-pitch-400/10 text-accent-400" : "border-white/10 text-slate-300"
            }`}
          >
            {n} at a time
          </button>
        ))}
        <button onClick={run} disabled={!!busy || remaining.length === 0} className="btn-primary">
          {busy ?? (remaining.length === 0 ? "All drafted" : `Draft ${Math.min(limit, remaining.length)}`)}
        </button>
        <span className="text-xs text-slate-500">{remaining.length} left</span>
      </div>

      {error && <p className="text-sm text-readiness-red">{error}</p>}

      {done.length > 0 && (
        <>
          <p className="text-sm text-slate-300">
            {clean.length} clean, {held.length} held.{" "}
            <span className="text-slate-500">
              Held means read this one — a leg press does train the glutes, so a cue mentioning them
              is held when the description does not name them, and it is usually fine.
            </span>
          </p>

          {clean.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300">{paste}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(paste); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="tap-target mt-2 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"
              >
                {copied ? `Copied ${clean.length} lines` : `Copy ${clean.length} COACHING lines`}
              </button>
            </div>
          )}

          {held.map((d) => (
            <div key={d.target.id} className="rounded-2xl border border-readiness-yellow/25 p-3">
              <div className="text-sm font-bold text-slate-100">{d.target.name}</div>
              <ul className="mt-1 text-xs text-readiness-yellow">
                {d.problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-slate-400">{coachingLine(d)}</pre>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
