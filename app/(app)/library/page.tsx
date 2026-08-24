"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { useCurrentUser } from "@/lib/auth";
import { useTier } from "@/lib/use-tier";
import { can } from "@/lib/subscription";
import { FeatureLock } from "@/components/FeatureLock";
import { EXERCISES, EXERCISE_CATEGORIES, SPORTS, DIFFICULTIES, EQUIPMENT_BUCKETS, getExercisesForSport, rowToExercise, exerciseEquip, withinLevel, type Exercise, type ExerciseCategory, type SportId, type Difficulty, isRunEntry } from "@/lib/exercises";
import { latestMetrics } from "@/lib/benchmarks";
import { ExerciseModal } from "@/components/ExerciseDetail";
import { WhatIfLiftSheet } from "@/components/WhatIfLiftSheet";
import { resolveLift } from "@/lib/strength-standards";
import { CustomExerciseForm } from "@/components/CustomExerciseForm";
import { Tabs, TabPanel } from "@/components/Tabs";
import { MealLibrary } from "@/components/MealLibrary";
import { MEALS } from "@/lib/meal-plan";

/**
 * The page holds two libraries now, so it needs a name that covers both.
 *
 * Movements and recipes are the two reference lists in the app — "how do I do
 * a Bulgarian split squat" and "what's in the katsu curry" are the same kind of
 * question, and the recipes could previously only be read inside whatever plan
 * the app had generated for you. Tabs rather than one merged list, because
 * nobody searches for a squat and a shakshuka in the same breath.
 */
const LIBRARY_TABS = [
  { id: "moves", label: "Exercises", icon: "barbell" },
  { id: "meals", label: "Recipes", icon: "pan" },
] as const;

// How many cards to render at once. Every card carries an animated SVG demo, so
// showing all 300+ was both a 44-screen page and a scrolling performance issue.
const PAGE = 24;

/** How many rows this page can show. Runs are on Guides — see isRunEntry. */
const MOVEMENT_COUNT = EXERCISES.filter((e) => !isRunEntry(e)).length;

const DIFF_COLOR: Record<Difficulty, string> = { easy: "#34d399", medium: "#e3b53f", advanced: "#fb5d6b" };
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Beginner", medium: "Intermediate", advanced: "Advanced" };

export default function LibraryPage() {
  const user = useCurrentUser();
  const { tier, loading: tierLoading } = useTier();
  const [tab, setTab] = useState<(typeof LIBRARY_TABS)[number]["id"]>("moves");
  /**
   * THE STRENGTH CALCULATOR HAD ONE DOOR, AND IT WAS THE WRONG ONE.
   *
   * It lived behind a 24px calculator icon next to an exercise you had already
   * logged in Today's Log — so to find out what your bench is worth you first
   * had to log a bench. "What would 100kg for 5 be?" is a question you ask
   * before you lift, and the page people ask it on is the one full of lifts.
   *
   * null closed, "" open with nothing chosen, a name open and pre-filled.
   */
  const [calc, setCalc] = useState<string | null>(null);
  const [sport, setSport] = useState<SportId | "all">("all");
  const [cat, setCat] = useState<ExerciseCategory | "All">("All");
  const [level, setLevel] = useState<Difficulty>("advanced");
  const [equip, setEquip] = useState<string | "all">("all");
  /**
   * SEEDED FROM THE URL, so a finding elsewhere can lead here.
   *
   * The search already matched muscle names, but the box was local state with
   * no way in — so "your shoulders are two tiers behind" on the Progress tab
   * could name the problem and then leave the athlete to type the word in
   * themselves. A finding you have to act on manually is half a finding.
   *
   * `useSearchParams` needs a Suspense boundary under `output: "export"`; the
   * static export has no server to read a query string on, so the value is
   * pulled straight off `location` on mount instead. First paint is the empty
   * box either way, and this avoids wrapping the page for one string.
   */
  const [q, setQ] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const seed = params.get("q");
    if (seed) setQ(seed);
    // ?tab=meals lands on the recipes, so the Food page's "Recipes" chip can
    // point here honestly rather than dropping you on the exercise list and
    // asking you to find the tab yourself.
    if (params.get("tab") === "meals") setTab("meals");
  }, []);

  /**
   * The tab survives leaving the page and coming back.
   *
   * Reported as the library "resetting" — it is one route with two very
   * different catalogues, and every arrival put you on the movements whether
   * that was where you left off or not. Written with `replaceState` so it does
   * not stack a history entry per tap: Back still leaves the library.
   */
  const selectTab = useCallback((next: (typeof LIBRARY_TABS)[number]["id"]) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "moves") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }, []);
  const [open, setOpen] = useState<Exercise | null>(null);
  const [custom, setCustom] = useState<Exercise[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedOnly, setSavedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  /**
   * Re-read the athlete's own and their coach's exercises.
   *
   * Pulled out of the mount effect so the "add your own" form can call it —
   * an exercise you just created not appearing in the list you created it from
   * reads as the save having failed.
   */
  const reloadCustom = useCallback(async () => {
    const { data } = await createClient().from("custom_exercises").select("*");
    if (data) setCustom(data.map(rowToExercise));
  }, []);

  // Default to the athlete's sport + level, and pull in custom exercises —
  // their own, and any their coach has authored.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    // Two queries lighter than it was. The benchmarks and the resting heart
    // rate were fetched only to shade the zone guide, which has moved to Guides
    // and loads its own — see components/RunningGuide.tsx. A search screen has
    // no business fetching a heart rate.
    supabase.from("profiles").select("sport, level, saved_exercises").eq("id", user.id).maybeSingle().then(({ data }) => {
      const p = data as { sport?: string; level?: string; saved_exercises?: string[] } | null;
      if (!active) return;
      if (p?.sport && SPORTS.some((sp) => sp.id === p.sport)) setSport(p.sport as SportId);
      if (p?.level === "easy" || p?.level === "medium" || p?.level === "advanced") setLevel(p.level);
      setSavedIds(new Set(p?.saved_exercises ?? []));
    });
    void reloadCustom();
    return () => { active = false; };
    // reloadCustom is a useCallback with no deps, so it is stable for the life
    // of the component — listing it changes nothing and only adds a name the
    // next reader has to check.
  }, [user.id, reloadCustom]);

  const list = useMemo(() => {
    const all = [...custom, ...getExercisesForSport(sport)];
    const query = q.trim().toLowerCase();
    return all.filter((e) =>
      // Runs live on Guides now — see isRunEntry and the pointer card below.
      !isRunEntry(e) &&
      (sport === "all" || !e.sports || e.sports.includes(sport)) &&
      (cat === "All" || e.category === cat) &&
      withinLevel(e, level) &&
      (equip === "all" || exerciseEquip(e) === equip) &&
      (!savedOnly || savedIds.has(e.id)) &&
      (!query || e.name.toLowerCase().includes(query) || e.muscles.some((m) => m.toLowerCase().includes(query)))
    );
  }, [sport, cat, level, equip, q, custom, savedOnly, savedIds]);

  /**
   * Drills tagged for this sport, pulled to the front.
   *
   * getExercisesForSport already returns sport-specific entries before the
   * general ones, but "general" is 500+ imported gym movements — so a rugby
   * player's dozen actual rugby drills were the first dozen rows of a list that
   * looked, and scrolled, exactly like everyone else's. Sport tailoring you have
   * to notice isn't tailoring.
   *
   * Only when they haven't started filtering: once someone picks a category or
   * types a query they're hunting for something specific, and a "your sport"
   * band above the results is then in the way.
   */
  const browsing = !q.trim() && cat === "All" && equip === "all";
  const sportDrills = useMemo(
    () => (sport === "all" || !browsing ? [] : list.filter((e) => e.sports?.includes(sport)).slice(0, 6)),
    [list, sport, browsing]
  );

  // Narrowing the filters shouldn't leave you deep in a previous page.
  useEffect(() => { setShown(PAGE); }, [sport, cat, level, equip, q]);

  // "advanced" is the level ceiling, i.e. show everything — so it isn't a
  // filter being applied and shouldn't be counted as one.
  const activeFilters = (level !== "advanced" ? 1 : 0) + (equip !== "all" ? 1 : 0) + (cat !== "All" ? 1 : 0);

  const header = (
    <header>
      <h1 className="text-3xl font-extrabold tracking-tight">Exercises</h1>
      <p className="mt-1 text-sm text-slate-400">
        {tab === "moves"
          // Counted after the runs come out, so the number on the screen is the
          // number of rows you can actually scroll through.
          ? `Look up any movement — how to do it, what it works, and when to use it. ${MOVEMENT_COUNT} in total.`
          : `Every recipe the meal planner can serve — method, timings and macros. ${MEALS.length} in total.`}
      </p>
    </header>
  );

  /**
   * THE LIBRARY IS THE COACHING CONTENT, so it is the paid product.
   *
   * It was free on the reasoning that it earned the right to sell — but this is
   * several hundred movements, every skill drill, the position guides and now
   * every recipe the planner can serve. Giving that away while charging for the
   * plan that arranges it is the wrong way round: the plan is a few pages of
   * output, and this is the thing it is made of.
   *
   * The lock is shown, not hidden. Someone who lands here from a program or a
   * search should see what is behind it and what it costs, rather than a page
   * that quietly isn't in the nav.
   */
  if (tierLoading) {
    return (
      <div className="animate-fade-up space-y-4">
        {header}
        <div className="card h-64 animate-pulse" />
      </div>
    );
  }
  if (!can(tier, "library")) {
    return (
      <div className="animate-fade-up space-y-4">
        {header}
        <FeatureLock
          capability="library"
          title="The library is part of Pro"
          blurb={`Every movement in the catalogue with how to do it, what it works and when to use it — plus every skill drill, the position guides for your sport, and all ${MEALS.length} recipes the meal planner can serve.`}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      {header}

      <Tabs tabs={LIBRARY_TABS} active={tab} onChange={selectTab} label="Library sections" />

      <TabPanel id={tab}>
      {/* Unmounted rather than hidden. Every exercise card carries an animated
          SVG demo — that's why the list pages at 24 — and leaving a screenful
          of them running behind the recipes would spend the budget the
          pagination exists to protect. The filter state lives up here, so
          switching away and back doesn't lose your place. */}
      {tab === "meals" ? <MealLibrary userId={user.id} /> : (
      <div className="space-y-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises or muscles…" className="field" />

      {/* ADDING YOUR OWN WAS INVISIBLE, NOT ABSENT.
          The form existed but was rendered only from /squad, which is
          coaches-only — so this page merged custom exercises into the list and
          into search while offering no way to create one. The database never
          blocked it: the RLS policy asks who owns the row, not whether they're
          a coach. Purely a missing button, on the one page where someone who
          can't find a movement actually is. */}
      <div className="flex flex-wrap items-center gap-3">
        <CustomExerciseForm coachId={user.id} onAdded={reloadCustom} scope="mine" />
        <button
          type="button"
          onClick={() => setSavedOnly((v) => !v)}
          aria-pressed={savedOnly}
          className={`chip-option chip-option-sm ${savedOnly ? "text-pitch-400" : ""}`}
        >
          Saved{savedIds.size ? ` (${savedIds.size})` : ""}
        </button>
        {custom.length > 0 && (
          <span className="text-xs text-slate-500">
            {custom.length} custom exercise{custom.length === 1 ? "" : "s"} in your library
          </span>
        )}
      </div>

      {/* RUNNING IS NOT IN HERE ANY MORE, and the pointer is the whole of what
          replaced it. This page answers "how do I do this movement" — a search
          screen for a catalogue of exercises — and a run is not a movement you
          look up, it is a session with a zone and a duration. The zone guide
          and the run types were a page of reading collapsed under a list, and
          the run entries themselves ("Easy run", "Tempo runs") were rows you
          could open to be told to go for a run.
          Both now live on Guides, which is the page for reference. */}
      {/* ?tab=running, NOT bare /essentials.
          The card promises "Zones 1-5, and what each run type is for" and used
          to land on the position guide — the page's default tab — with the
          running one two taps away behind a scroller. A link that arrives
          somewhere other than what it advertised reads as a broken link, and
          the athlete's next move is to go back rather than to look around.
          The page has read ?tab= since it was built; this simply says which. */}
      {/* Same shape as the Running pointer below it, deliberately: these are the
          two things on this page that are not a movement you scroll to. */}
      <button
        type="button"
        onClick={() => setCalc("")}
        className="card card-hover flex w-full items-center gap-3 p-4 text-left text-sm"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pitch-400/10 text-pitch-400">
          <Icon name="calculator" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-100">Strength calculator</span>
          <span className="block text-xs text-slate-400">
            A weight and the reps you got it for — what that is worth as a one-rep max, and where it ranks.
          </span>
        </span>
        <span className="shrink-0 text-slate-600">›</span>
      </button>

      <Link
        href="/essentials?tab=running"
        className="card card-hover flex items-center gap-3 p-4 text-sm"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-400/10 text-sky-300">
          <Icon name="run" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-100">Running is in Guides</span>
          <span className="block text-xs text-slate-400">Zones 1–5, and what each run type is for.</span>
        </span>
        <span className="shrink-0 text-slate-600">›</span>
      </Link>

      {/* Sport stays visible — it's the filter people change most. The other
          three used to sit under it as three more horizontal scrollers, which
          on a phone meant four rows of chrome before a single exercise. They're
          behind a disclosure now, with a count so it's obvious when filters are
          on and hidden. */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Pill label="All sports" active={sport === "all"} onClick={() => setSport("all")} small />
        {SPORTS.map((s) => (
          <Pill key={s.id} label={<span className="inline-flex items-center gap-1.5"><Icon name={s.icon} size={15} />{s.label}</span>} active={sport === s.id} onClick={() => setSport(s.id)} small />
        ))}
      </div>

      <details className="group rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 open:pb-3">
        {/* min-h, because a `<summary>` shrinks to its line box — this one was
            20px tall and full-width, which is a target you scrub at rather than
            hit. The count badge is a <span>, so it stays a badge and does not
            inherit the tappable-chip floor. */}
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-200">
          <span>
            Filters
            {activeFilters > 0 && <span className="ml-2 chip text-pitch-400">{activeFilters} on</span>}
          </span>
          <span className="text-xs text-slate-500 transition group-open:rotate-180">▾</span>
        </summary>

        <div className="mt-3 space-y-3">
          <div>
            <span className="mb-1.5 block text-xs text-slate-500">Level at most</span>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <Pill key={d.id} label={d.label} active={level === d.id} onClick={() => setLevel(d.id)} small />
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs text-slate-500">Equipment</span>
            <div className="flex flex-wrap gap-2">
              <Pill label="Any kit" active={equip === "all"} onClick={() => setEquip("all")} small />
              {EQUIPMENT_BUCKETS.map((eq) => (
                <Pill key={eq} label={eq} active={equip === eq} onClick={() => setEquip(eq)} small />
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs text-slate-500">Type</span>
            <div className="flex flex-wrap gap-2">
              <Pill label="All" active={cat === "All"} onClick={() => setCat("All")} small />
              {EXERCISE_CATEGORIES.map((c) => (
                <Pill key={c} label={c} active={cat === c} onClick={() => setCat(c)} small />
              ))}
            </div>
          </div>

          {activeFilters > 0 && (
            <button
              onClick={() => { setLevel("advanced"); setEquip("all"); setCat("All"); }}
              className="tap-target text-xs font-semibold text-pitch-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </details>

      {sportDrills.length > 0 && (
        <section>
          <h2 className="field-label">
            Made for {SPORTS.find((s) => s.id === sport)?.label.toLowerCase()}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sportDrills.map((ex) => (
              <button
                key={`sport-${ex.id}`}
                onClick={() => setOpen(ex)}
                className="card card-hover flex items-center gap-3 border-l-4 border-l-pitch-400/60 p-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-100">{ex.name}</span>
                  <span className="truncate text-xs text-slate-400">{ex.category}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-slate-500">
        {sportDrills.length > 0 ? "Everything else · " : ""}
        {list.length} exercises{list.length > shown ? ` · showing ${shown}` : ""}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.slice(0, shown).map((ex) => (
          <button
            key={ex.id}
            onClick={() => setOpen(ex)}
            className="card card-hover group flex items-center gap-4 p-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {ex.difficulty && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DIFF_COLOR[ex.difficulty] }} title={DIFF_LABEL[ex.difficulty]} />}
                <span className="truncate text-xs text-slate-400">{ex.muscles[0] ?? ex.category} · {exerciseEquip(ex)}</span>
              </span>
              <span className="mt-1 block truncate font-bold text-slate-100">{ex.name}</span>
            </span>
            {/* THE ROW USED TO CARRY A DRAWING OF THE MOVEMENT, which at least
                said "there is something to open here". Text alone does not, and
                what is behind the tap is now a video — so the row says so. */}
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-xs text-slate-500 transition group-hover:text-pitch-400">▶</span>
          </button>
        ))}
      </div>
      {/* An empty result used to be a dead end: it named the problem and offered
          no way out, while the only "Clear filters" control was collapsed inside
          the filter disclosure the reader had already closed. Say which filters
          did it, and undo them from here. */}
      {list.length === 0 && (
        <div className="card px-4 py-8 text-center">
          <p className="text-sm text-slate-300">Nothing matches that.</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
            {q.trim()
              ? `No exercise called "${q.trim()}"${activeFilters > 0 ? " with those filters" : ""}.`
              : "The filters are too narrow together."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {q.trim() && (
              <button onClick={() => setQ("")} className="btn-ghost w-auto px-4 py-2 text-xs">
                Clear the search
              </button>
            )}
            {activeFilters > 0 && (
              <button
                onClick={() => { setLevel("advanced"); setEquip("all"); setCat("All"); }}
                className="btn-ghost w-auto px-4 py-2 text-xs"
              >
                Reset {activeFilters} filter{activeFilters === 1 ? "" : "s"}
              </button>
            )}
            {sport !== "all" && (
              <button onClick={() => setSport("all")} className="btn-ghost w-auto px-4 py-2 text-xs">
                Search every sport
              </button>
            )}
          </div>
        </div>
      )}

      {list.length > shown && (
        <button onClick={() => setShown((n) => n + PAGE)} className="btn-ghost">
          Show {Math.min(PAGE, list.length - shown)} more
        </button>
      )}

      {open && <ExerciseModal
        ex={open}
        /* ONLY ON A LIFT THAT CAN ACTUALLY BE RANKED. resolveLift returns null
           for a plank or a ladder drill, and offering to rank one would be a
           button that opens a sheet with nothing to say. */
        action={resolveLift(open.name) ? (
          <button
            type="button"
            onClick={() => { const name = open.name; setOpen(null); setCalc(name); }}
            className="btn-ghost w-full"
          >
            Where does my {open.name.toLowerCase()} rank?
          </button>
        ) : null}
        onClose={() => {
          setOpen(null);
          void createClient().from("profiles").select("saved_exercises").eq("id", user.id).maybeSingle()
            .then(({ data }) => setSavedIds(new Set(((data?.saved_exercises ?? []) as string[]))));
        }}
      />}

      {calc !== null && <WhatIfLiftSheet initialExercise={calc} onClose={() => setCalc(null)} />}
      </div>
      )}
      </TabPanel>
    </div>
  );
}

function Pill({ label, active, onClick, small }: { label: React.ReactNode; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      // `aria-pressed` is new and not cosmetic: this page has twenty-eight of
      // these across five filter groups, and without it every one announced as
      // a plain button, leaving a screen-reader user no way to tell which
      // filters were on.
      aria-pressed={active}
      className={`chip-option ${small ? "chip-option-sm" : ""}`}
    >
      {label}
    </button>
  );
}
