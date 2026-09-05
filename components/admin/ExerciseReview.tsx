"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { draftProblems } from "@/lib/exercise-draft";
import { createClient } from "@/lib/supabase/client";
import { invokeAI } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { FormGuideEmbed } from "@/components/FormGuideEmbed";
import { formGuide } from "@/lib/form-guide";
import {
  EXERCISE_CATEGORIES, DEMO_PATTERNS, DIFFICULTIES,
  type ExerciseCategory, type DemoPattern, type Difficulty,
} from "@/lib/exercises";
import {
  parseYouTubeId, videoSearchUrl, normaliseDraft, publishBlockers, publishRow,
  EMPTY_DRAFT, type ExerciseDraft,
} from "@/lib/exercise-review";
import { screen, blockReasons } from "@/lib/exercise-moderation";
import { autoPlan, autoSummary, type AutoRow } from "@/lib/exercise-auto";

/** Automatic mode is per-device and sticky — it is a working preference. */
const AUTO_KEY = "pa:admin:exercise-auto";

/**
 * The queue that turns what somebody typed into a library entry.
 *
 * WHAT THIS IS FOR. The library has always had two tiers: a catalogue compiled
 * into the app, and custom_exercises, a table anybody can add to that only
 * their own squad can see. Good movements kept landing in the second tier and
 * staying there — a Copenhagen plank added by one person, invisible to the four
 * hundred who would have used it — and the only route out was a code change.
 *
 * So: pick the ones worth keeping, let the model write the detail nobody types
 * mid-session, attach a video, read it, publish. After that it is a library
 * card like any other and stops belonging to whoever added it (migration 0099
 * moves write access to admins at the moment of publishing).
 *
 * THE MODEL DRAFTS, A HUMAN PUBLISHES, and nothing shortens that. Two rules
 * hold it in place:
 *
 *   1. The video is never the model's. An eleven-character YouTube id is the
 *      perfect shape to hallucinate — trivial to imitate, impossible to guess —
 *      so it returns a search, somebody watches the clip, and the id comes in
 *      through parseYouTubeId. The panel plays it back before Publish unlocks,
 *      which is a stronger check than any API: somebody watched it.
 *   2. Publish is blocked until the entry is actually finished, and it says
 *      which field is missing. A card with a name and no cues looks answered
 *      and is not, which is worse than not having the card.
 */

interface Row {
  id: string;
  name: string;
  coach_id: string;
  category: string | null;
  sport: string | null;
  demo: string | null;
  equipment: string | null;
  muscles: string[] | null;
  cues: string[] | null;
  why: string | null;
  description: string | null;
  difficulty: string | null;
  tempo: string | null;
  youtube_id: string | null;
  published: boolean | null;
  published_at: string | null;
  /** Set when the AI last drafted this row — null means never. */
  ai_drafted_at: string | null;
  /** Why the last draft was held, from draftProblems(). Null = nothing flagged. */
  review_notes: string | null;
  created_at: string;
}

/** Everything migration 0099 adds, so a database without it fails one way. */
const COLUMNS =
  "id, name, coach_id, category, sport, demo, equipment, muscles, cues, why, description, " +
  "difficulty, tempo, youtube_id, published, published_at, ai_drafted_at, review_notes, created_at";

export function ExerciseReview() {
  const { data, loading, reload } = useAsync(async () => {
    const { data: rows, error } = await createClient()
      .from("custom_exercises").select(COLUMNS)
      .order("created_at", { ascending: false }).limit(500);
    return { rows: (rows ?? []) as unknown as Row[], error: error?.message ?? null };
  }, [], "admin-exercise-review");

  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<string | null>(null);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE QUEUE RUNS ITSELF.
   *
   * "It wasn't auto publishing and clearing from the queue, they weren't even
   * auto drafting — I still needed to click the draft button. I wanted this
   * completely automated."
   *
   * Every step was a button, and for thirty submissions that is ninety
   * interactions to move text from one place to another. It drafts what is
   * undrafted and publishes what clears every check, on load, without being
   * asked. What is left is only what a person has to look at.
   *
   * The one thing it will not do is attach a video — see lib/exercise-auto.ts.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    try { setAuto(localStorage.getItem(AUTO_KEY) !== "off"); } catch { /* no storage */ }
  }, []);
  const setAutoMode = (on: boolean) => {
    setAuto(on);
    try { localStorage.setItem(AUTO_KEY, on ? "on" : "off"); } catch { /* no storage */ }
  };

  /**
   * TRIED ONCE EACH, EVER, PER VISIT.
   *
   * The pass reloads and re-runs, which terminates only while every pass
   * strictly reduces the work — and it would not if an update failed silently
   * behind a policy. Then it is an unbounded loop of AI calls nobody asked
   * for. A row-and-action that has been attempted is never attempted again,
   * so termination does not depend on the server behaving.
   */
  const attempted = useRef<Set<string>>(new Set());
  const running = useRef(false);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  /**
   * ONE ROW PER MOVEMENT, WITH THE COUNT KEPT.
   *
   * Thirty people adding "Copenhagen plank" is thirty rows and one decision,
   * and a flat list makes you scroll past twenty-nine near-identical entries to
   * reach the next real one. The count is the interesting part anyway: it is
   * the catalogue telling you what it is missing.
   *
   * The row kept is the OLDEST — whoever typed it first usually wrote the
   * fullest version, before the name became something people copied.
   */
  const queue = useMemo(() => {
    const byName = new Map<string, { row: Row; count: number }>();
    for (const r of rows) {
      if (r.published) continue;
      const key = r.name.trim().toLowerCase();
      const held = byName.get(key);
      if (!held) byName.set(key, { row: r, count: 1 });
      else {
        held.count += 1;
        if (r.created_at < held.row.created_at) held.row = r;
      }
    }
    return [...byName.values()].sort((a, b) => b.count - a.count || b.row.created_at.localeCompare(a.row.created_at));
  }, [rows]);

  const live = useMemo(() => rows.filter((r) => r.published), [rows]);

  /**
   * Never drafted, so drafting them costs one request each and skips nothing.
   * A row that has been drafted and held is deliberately NOT in here — running
   * the same prompt again on the same text is paying twice for the same answer.
   */
  const undrafted = useMemo(() => queue.filter((q) => !q.row.ai_drafted_at), [queue]);

  /** The queue as the automatic pass sees it. */
  const autoRows = useMemo<AutoRow[]>(() => queue.map(({ row }) => ({
    id: row.id,
    name: row.name,
    aiDraftedAt: row.ai_drafted_at,
    reviewNotes: row.review_notes,
    draft: { ...EMPTY_DRAFT, ...fromRow(row) },
  })), [queue]);
  const plan = useMemo(() => autoPlan(autoRows), [autoRows]);
  const summary = useMemo(() => autoSummary(plan), [plan]);

  /**
   * Held in a ref because the runner closes over THIS render's queue, and the
   * effect must not re-subscribe every time one of those values changes —
   * that is every render, and the pass fires AI calls.
   */
  const runnerRef = useRef<() => Promise<void>>(async () => {});
  runnerRef.current = runAuto;
  useEffect(() => {
    if (!auto || loading || running.current) return;
    void runnerRef.current();
    // `plan` is the work: when it stops changing, this stops firing.
  }, [auto, loading, plan]);

  if (data?.error) {
    return (
      <p className="text-sm text-readiness-yellow">
        {/permission|policy|row-level/i.test(data.error)
          ? "Run migration 0095 — admins cannot read custom_exercises yet."
          : /published|youtube_id|column|schema cache/i.test(data.error)
            ? "Run migration 0099 — the review columns are not on the table yet."
            : data.error}
      </p>
    );
  }
  if (loading) return <p className="py-2 text-center text-sm text-slate-500">Loading…</p>;

  /**
   * Draft several at once, one request at a time.
   *
   * Sequential rather than Promise.all: this is a metered AI call per exercise
   * and firing fifteen at a Worker cold-start is how you get half of them back
   * as timeouts and no way to tell which. Slower and legible beats fast and
   * partly done.
   */
  async function draftPicked(ids: string[] = [...picked]) {
    let held = 0;
    for (let i = 0; i < ids.length; i++) {
      const row = queue.find((q) => q.row.id === ids[i])?.row;
      if (!row) continue;
      setBulk(`Drafting ${i + 1} of ${ids.length} — ${row.name}`);
      try {
        const res = await invokeAI<{ draft?: unknown }>("draft-exercise", {
          name: row.name, category: row.category, sport: row.sport,
          equipment: row.equipment, note: row.description,
          // Free rungs only. A queue of thirty is thirty requests nobody is
          // waiting on, and the paid model is there for the athlete-facing
          // calls that somebody is. See complete() in the Worker.
        });
        const draft = normaliseDraft(res?.draft, fromRow(row));

        /**
         * THE SAME CHECKS A HUMAN REVIEW WOULD RUN, RUN FIRST.
         *
         * lib/exercise-draft.ts already validates a draft against the row's own
         * description: a cue may only name equipment the exercise uses and body
         * parts its own text mentions, no therapeutic or "best exercise"
         * claims, and house style on length and count. It was written for the
         * offline script and never wired to the screen that drafts in bulk —
         * so a fluent cue about the wrong exercise was saved silently and
         * waited for somebody to notice it by reading.
         *
         * Held drafts are still SAVED. The reasons go in review_notes and the
         * row stays unpublished, because "held" means "read this one", not
         * "this one is wrong" — and throwing the draft away would mean paying
         * to generate it again.
         */
        const problems = draftProblems(
          { id: row.id, why: draft.why, cues: draft.cues },
          {
            id: row.id,
            name: row.name,
            category: draft.category,
            equipment: draft.equipment,
            muscles: draft.muscles,
            description: draft.description || row.description || "",
          },
        );
        held += problems.length ? 1 : 0;

        await createClient().from("custom_exercises").update({
          category: draft.category, demo: draft.demo, difficulty: draft.difficulty,
          equipment: draft.equipment, muscles: draft.muscles, cues: draft.cues,
          tempo: draft.tempo || null, why: draft.why, description: draft.description,
          ai_drafted_at: new Date().toISOString(),
          review_notes: problems.length ? problems.join("; ") : null,
        }).eq("id", row.id);
      } catch {
        // One failure does not stop the batch — the row simply stays undrafted,
        // and the queue shows that plainly.
      }
    }
    setBulk(held ? `Done — ${held} held for review, reasons on each row.` : null);
    if (held) setTimeout(() => setBulk(null), 6000);
    setPicked(new Set());
    reload();
  }

  /**
   * Publish the rows that cleared every check, one at a time.
   *
   * Only the publish columns: the drafted fields were written to the row when
   * it was drafted, and re-sending them from a client-side reconstruction is
   * a chance to write back something stale.
   */
  async function publishAll(ids: string[]) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    for (let i = 0; i < ids.length; i++) {
      const row = queue.find((q) => q.row.id === ids[i])?.row;
      if (!row) continue;
      setBulk(`Publishing ${i + 1} of ${ids.length} — ${row.name}`);
      const draft = { ...EMPTY_DRAFT, ...fromRow(row) };
      await supabase.from("custom_exercises")
        .update(publishRow(draft, user.id)).eq("id", row.id);
    }
  }

  /**
   * One automatic pass: draft what is undrafted, or publish what is ready.
   *
   * Drafting FIRST and then returning, rather than doing both in one pass: a
   * row drafted here has no fields to judge until the reload brings them back,
   * so publishing in the same pass would be publishing the pre-draft text.
   */
  async function runAuto() {
    const take = (action: "draft" | "publish") => plan
      .filter((step) => step.action === action)
      .map((step) => step.id)
      .filter((id) => !attempted.current.has(`${id}:${action}`));

    const toDraft = take("draft");
    const toPublish = take("publish");
    if (!toDraft.length && !toPublish.length) return;

    running.current = true;
    try {
      if (toDraft.length) {
        for (const id of toDraft) attempted.current.add(`${id}:draft`);
        await draftPicked(toDraft);
        return;
      }
      for (const id of toPublish) attempted.current.add(`${id}:publish`);
      await publishAll(toPublish);
      setBulk(null);
      reload();
    } finally {
      running.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Movements athletes added for themselves. Publish one and it joins the main library for
        everybody, as a normal card — and it stops being editable by whoever added it.
      </p>

      {/* WHAT THE AUTOMATIC PASS IS DOING, AND THE ONE THING IT WILL NOT DO.
          A queue that empties itself is only trustworthy if it says what it
          emptied and what it left behind. */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <label className="tap-target flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAutoMode(e.target.checked)}
            className="h-5 w-5 accent-pitch-500"
          />
          Draft and publish automatically
        </label>
        <p className="mt-1 text-[11px] text-slate-500">
          {bulk ? bulk
            : summary.draft > 0 ? `${summary.draft} still to draft…`
            : summary.publish > 0 ? `${summary.publish} ready to publish…`
            : summary.needVideo > 0
              ? `${summary.needVideo} ${summary.needVideo === 1 ? "entry needs" : "entries need"} a video before it can go live — open one, watch the clip, paste the link.`
              : summary.hold > 0 ? `${summary.hold} held for you to read — the reason is on each row.`
              : "Nothing waiting."}
        </p>
        <p className="mt-1 text-[11px] text-slate-600">
          It never picks the video. A YouTube id is eleven characters a model will invent as
          readily as recall, and this is a page telling somebody how to load their spine.
        </p>
      </div>

      {/* THE WHOLE QUEUE, WITHOUT SELECTING IT FIRST.
          Drafting was per-row or per-selection, which is fine for three and a
          chore for thirty — and thirty is what a library gets after a week of
          submissions. Free rungs only, so the cost of running it over the
          backlog is nothing. */}
      {undrafted.length > 0 && (
        <button
          onClick={() => draftPicked(undrafted.map((q) => q.row.id))}
          disabled={!!bulk}
          className="tap-target w-full rounded-xl border border-pitch-400/30 bg-pitch-400/[0.06] px-3 py-2.5 text-sm font-semibold text-accent-300 disabled:opacity-50"
        >
          {bulk ?? `Draft all ${undrafted.length} undrafted — free models, checked as they land`}
        </button>
      )}

      {queue.length === 0 ? (
        <p className="py-2 text-center text-sm text-slate-500">Nothing waiting. Nobody has added an exercise yet.</p>
      ) : (
        <>
          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-pitch-400/25 bg-pitch-400/[0.06] px-3 py-2">
              <span className="text-xs font-semibold text-accent-300">{picked.size} selected</span>
              <button onClick={() => draftPicked()} disabled={!!bulk} className="chip text-accent-400 disabled:opacity-40">
                {bulk ?? "Draft the detail for these"}
              </button>
              <button onClick={() => setPicked(new Set())} className="chip text-slate-400">Clear</button>
              {/* Said here rather than discovered at the Publish button. */}
              <span className="w-full text-[11px] text-slate-500">
                Drafting writes cues, a how-to and muscles. Each still needs a video you have watched
                before it can go live.
              </span>
            </div>
          )}

          <ul className="space-y-2">
            {queue.map(({ row, count }) => (
              <li key={row.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
                <div className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={picked.has(row.id)}
                    onChange={(e) => setPicked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(row.id); else next.delete(row.id);
                      return next;
                    })}
                    aria-label={`Select ${row.name}`}
                    className="h-4 w-4 shrink-0 accent-pitch-400"
                  />
                  <button onClick={() => setOpenId(openId === row.id ? null : row.id)} className="tap-target min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-slate-100">{row.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {row.category || "Strength"}
                      {count > 1 && <> · <span className="text-accent-400">{count} people added this</span></>}
                      {" · "}{readiness(row)}
                    </span>
                    {/* TRIAGE, WHICH IS THE POINT OF THE FILTER HERE.
                        An admin reading three hundred submissions should have
                        the four worth looking at hard marked for them, rather
                        than finding them by reading everything. */}
                    {flagsFor(row).length > 0 && (
                      <span className="mt-1 block text-[11px] text-amber-300">
                        ⚠ {flagsFor(row).join(" · ")}
                      </span>
                    )}
                    {/* Why the AI draft was held. Not a rejection — the checks
                        lean towards holding, because a cue that is fluent,
                        confident and about a different exercise is the failure
                        that gets somebody hurt, and five seconds of reading is
                        the cheaper side of that trade. */}
                    {row.review_notes && (
                      <span className="mt-1 block text-[11px] text-readiness-yellow">
                        Held: {row.review_notes}
                      </span>
                    )}
                  </button>
                  <span className="shrink-0 text-slate-600">{openId === row.id ? "▾" : "▸"}</span>
                </div>
                {openId === row.id && (
                  <Editor
                    row={row}
                    /* The compiled catalogue is checked in publishBlockers; the
                       entries already promoted are only knowable here. */
                    liveNames={live.map((l) => l.name)}
                    onDone={() => { setOpenId(null); reload(); }}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {live.length > 0 && (
        <details className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
          <summary className="tap-target cursor-pointer list-none text-xs font-semibold text-slate-400">
            In the main library · {live.length}
          </summary>
          <ul className="mt-2 space-y-1">
            {live.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-300">{r.name}</span>
                <span className="shrink-0 text-slate-600">{(r.published_at ?? "").slice(0, 10)}</span>
                <button
                  onClick={async () => {
                    await createClient().from("custom_exercises")
                      .update({ published: false, published_at: null }).eq("id", r.id);
                    reload();
                  }}
                  className="chip shrink-0 text-slate-400"
                >
                  Take down
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Anything the screening filter wants a human to look at. */
function flagsFor(row: Row): string[] {
  const { findings } = screen({
    name: row.name, equipment: row.equipment, muscles: row.muscles,
    cues: row.cues, why: row.why, description: row.description,
  });
  return [...new Set(findings.map((f) => f.message))];
}

/** What the row still needs, in three words, so the queue is scannable. */
function readiness(row: Row): string {
  if (!row.cues?.length || !row.description) return "needs detail";
  if (!row.youtube_id) return "needs a video";
  return "ready to publish";
}

function fromRow(row: Row): Partial<ExerciseDraft> {
  return {
    category: (EXERCISE_CATEGORIES as string[]).includes(row.category ?? "")
      ? (row.category as ExerciseCategory) : "Strength",
    demo: DEMO_PATTERNS.some((d) => d.id === row.demo) ? (row.demo as DemoPattern) : "squat",
    difficulty: DIFFICULTIES.some((d) => d.id === row.difficulty) ? (row.difficulty as Difficulty) : null,
    equipment: row.equipment ?? "",
    muscles: row.muscles ?? [],
    cues: row.cues ?? [],
    tempo: row.tempo ?? "",
    why: row.why ?? "",
    description: row.description ?? "",
    youtubeId: row.youtube_id,
    videoSearch: `${row.name} form guide`,
  };
}

function Editor({ row, liveNames, onDone }: { row: Row; liveNames: string[]; onDone: () => void }) {
  const [name, setName] = useState(row.name);
  const [draft, setDraft] = useState<ExerciseDraft>({ ...EMPTY_DRAFT, ...fromRow(row) });
  const [busy, setBusy] = useState<null | "draft" | "save" | "publish">(null);
  const [err, setErr] = useState<string | null>(null);
  /**
   * The link box is its own state, not derived from the id.
   *
   * Somebody pastes a whole watch URL with a ?t= on it and expects to see it
   * sitting there while they check it is the right clip. Rendering the parsed
   * id back into the box swallows what they typed the instant it is valid,
   * which reads as the field rejecting the paste.
   */
  const [videoInput, setVideoInput] = useState("");

  const set = <K extends keyof ExerciseDraft>(k: K, v: ExerciseDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const alreadyLive = liveNames.some((n) => key(n) === key(name)) ;
  /**
   * Screened on what is about to be SAVED, not on what arrived.
   *
   * The admin has been editing these fields — that is the whole job — so
   * screening the original row would either block a submission they have
   * already cleaned up or pass one they have just broken. Only the draft in
   * front of them is the thing being published.
   */
  const screened = screen({
    name, equipment: draft.equipment, muscles: draft.muscles,
    cues: draft.cues, why: draft.why, description: draft.description,
  });
  const blockers = [
    ...publishBlockers(draft, name),
    ...blockReasons({
      name, equipment: draft.equipment, muscles: draft.muscles,
      cues: draft.cues, why: draft.why, description: draft.description,
    }),
    ...(alreadyLive ? ["Another published entry already uses this name."] : []),
  ];
  const warnings = screened.findings.filter((f) => f.severity === "flag");

  /** A curated clip for this exact name, if the app already has one. */
  const curated = formGuide(name)?.videoId ?? null;

  async function drafting() {
    setBusy("draft"); setErr(null);
    try {
      const res = await invokeAI<{ draft?: unknown }>("draft-exercise", {
        name, category: row.category, sport: row.sport,
        equipment: row.equipment, note: row.description,
      });
      setDraft((d) => normaliseDraft(res?.draft, d));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save(publish: boolean) {
    setBusy(publish ? "publish" : "save"); setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const base = {
        name: name.trim(),
        category: draft.category, demo: draft.demo, difficulty: draft.difficulty,
        equipment: draft.equipment.trim() || null, muscles: draft.muscles, cues: draft.cues,
        tempo: draft.tempo.trim() || null, why: draft.why.trim(), description: draft.description.trim(),
        youtube_id: draft.youtubeId,
      };
      const { error } = await supabase.from("custom_exercises")
        .update(publish ? { ...base, ...publishRow(draft, user.id) } : base)
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-white/[0.06] p-3">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className="field" />
      </Field>

      <button onClick={drafting} disabled={busy !== null} className="btn-ghost w-full text-xs disabled:opacity-40">
        {busy === "draft" ? "Writing…" : draft.cues.length ? "Draft it again" : "Draft the detail with AI"}
      </button>
      {/* The honesty line. Everything below the button is a first draft by a
          model that has never seen the movement performed. */}
      <p className="text-[11px] text-slate-500">
        Writes cues, a how-to, muscles and a suggested search. It never picks the video — read all of
        it before publishing.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <select value={draft.category} onChange={(e) => set("category", e.target.value as ExerciseCategory)} className="field">
            {EXERCISE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Movement">
          <select value={draft.demo} onChange={(e) => set("demo", e.target.value as DemoPattern)} className="field">
            {DEMO_PATTERNS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Level">
          <select
            value={draft.difficulty ?? ""}
            onChange={(e) => set("difficulty", (e.target.value || null) as Difficulty | null)}
            className="field"
          >
            <option value="">—</option>
            {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Equipment">
          <input value={draft.equipment} onChange={(e) => set("equipment", e.target.value)} placeholder="None" className="field" />
        </Field>
      </div>

      <Field label="Muscles" hint="comma separated">
        <input
          value={draft.muscles.join(", ")}
          onChange={(e) => set("muscles", e.target.value.split(",").map((m) => m.trim()).filter(Boolean))}
          className="field"
        />
      </Field>

      <Field label="Cues" hint="one per line, 2–4">
        <textarea
          value={draft.cues.join("\n")}
          onChange={(e) => set("cues", e.target.value.split("\n").map((c) => c.trim()).filter(Boolean))}
          rows={3}
          className="field"
        />
      </Field>

      <Field label="Tempo">
        <input value={draft.tempo} onChange={(e) => set("tempo", e.target.value)} placeholder="3s down · explode up" className="field" />
      </Field>

      <Field label="Why it helps" hint="one line">
        <input value={draft.why} onChange={(e) => set("why", e.target.value)} className="field" />
      </Field>

      <Field label="How to do it">
        <textarea value={draft.description} onChange={(e) => set("description", e.target.value)} rows={6} className="field" />
      </Field>

      {/* --- the video, which is the part that cannot be automated ------------ */}
      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Video guide</p>

        {curated && !draft.youtubeId && (
          <button onClick={() => set("youtubeId", curated)} className="chip mb-2 text-accent-400">
            Use the curated guide we already have
          </button>
        )}

        <div className="flex gap-2">
          <input
            value={videoInput}
            onChange={(e) => {
              setVideoInput(e.target.value);
              const id = parseYouTubeId(e.target.value);
              if (id) set("youtubeId", id);
            }}
            placeholder="Paste a YouTube link"
            className="field flex-1"
          />
          <a
            href={videoSearchUrl(draft.videoSearch || `${name} form guide`)}
            target="_blank"
            rel="noreferrer"
            className="chip shrink-0 self-center text-slate-300"
          >
            Search ↗
          </a>
        </div>
        {videoInput && !parseYouTubeId(videoInput) && (
          <p className="mt-1.5 text-[11px] text-readiness-yellow">
            That is not a YouTube video link. A search results page has no video in it — open one and
            copy the link from the player.
          </p>
        )}

        {draft.youtubeId && (
          <div className="mt-2">
            {/* PLAY IT BEFORE PUBLISHING IT. This is the whole verification
                step: no API can tell you the clip teaches the right movement,
                and somebody watching it can. */}
            <FormGuideEmbed videoId={draft.youtubeId} title={name} />
            <button onClick={() => { set("youtubeId", null); setVideoInput(""); }} className="chip mt-1.5 text-slate-400">
              Choose a different one
            </button>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-0.5 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-100/90">
          <li className="font-semibold text-amber-200">Worth a read before publishing:</li>
          {[...new Set(warnings.map((w) => `${w.field}: ${w.message}`))].map((w) => <li key={w}>· {w}</li>)}
        </ul>
      )}

      {blockers.length > 0 && (
        <ul className="space-y-0.5 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">
          <li className="font-semibold text-slate-300">Before it can go live:</li>
          {blockers.map((b) => <li key={b}>· {b}</li>)}
        </ul>
      )}

      {err && <p className="text-sm text-readiness-red">{err}</p>}

      <div className="flex gap-2">
        <button onClick={() => save(false)} disabled={busy !== null} className="btn-ghost flex-1 text-xs disabled:opacity-40">
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <button
          onClick={() => save(true)}
          disabled={busy !== null || blockers.length > 0}
          className="btn-primary flex-1 text-xs disabled:opacity-40"
        >
          {busy === "publish" ? "Publishing…" : "Publish to the library"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}{hint && <span className="ml-1 font-medium normal-case tracking-normal text-slate-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
