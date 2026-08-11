"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { EXERCISES, EXERCISE_CATEGORIES, SPORTS, DIFFICULTIES, EQUIPMENT_BUCKETS, getExercisesForSport, demoImplement, rowToExercise, exerciseEquip, withinLevel, type Exercise, type ExerciseCategory, type SportId, type Difficulty } from "@/lib/exercises";
import { ExerciseDemo } from "@/components/ExerciseDemo";
import { ExerciseModal } from "@/components/ExerciseDetail";
import { CustomExerciseForm } from "@/components/CustomExerciseForm";
import { ZoneGuide, RunTypeGuide } from "@/components/ZoneGuide";
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
  { id: "moves", label: "Exercises", icon: "🏋" },
  { id: "meals", label: "Recipes", icon: "🍳" },
] as const;

// How many cards to render at once. Every card carries an animated SVG demo, so
// showing all 300+ was both a 44-screen page and a scrolling performance issue.
const PAGE = 24;

const DIFF_COLOR: Record<Difficulty, string> = { easy: "#34d399", medium: "#e3b53f", advanced: "#fb5d6b" };
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Beginner", medium: "Intermediate", advanced: "Advanced" };

export default function LibraryPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<(typeof LIBRARY_TABS)[number]["id"]>("moves");
  const [sport, setSport] = useState<SportId | "all">("all");
  const [cat, setCat] = useState<ExerciseCategory | "All">("All");
  const [level, setLevel] = useState<Difficulty>("advanced");
  const [equip, setEquip] = useState<string | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Exercise | null>(null);
  const [custom, setCustom] = useState<Exercise[]>([]);
  const [shown, setShown] = useState(PAGE);
  // Feeds the zone guide so it shows THIS athlete's paces and heart rates
  // rather than a generic table. All optional — the guide degrades to the
  // standard bands and says so.
  const [benchmarks, setBenchmarks] = useState<Record<string, number> | null>(null);
  const [athlete, setAthlete] = useState<{ age: number | null; restingHr: number | null }>({ age: null, restingHr: null });

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
    supabase.from("profiles").select("sport, level, birth_year").eq("id", user.id).maybeSingle().then(({ data }) => {
      const p = data as { sport?: string; level?: string; birth_year?: number | null } | null;
      if (!active) return;
      if (p?.sport && SPORTS.some((sp) => sp.id === p.sport)) setSport(p.sport as SportId);
      if (p?.level === "easy" || p?.level === "medium" || p?.level === "advanced") setLevel(p.level);
      if (p?.birth_year) setAthlete((a) => ({ ...a, age: new Date().getFullYear() - p.birth_year! }));
    });
    void reloadCustom();
    // Latest test only — zones should follow current fitness, not a personal
    // best from two seasons ago.
    supabase.from("strength_benchmarks").select("metrics").order("test_date", { ascending: false }).limit(1)
      .then(({ data }) => {
        if (active && data?.[0]) setBenchmarks((data[0] as { metrics: Record<string, number> }).metrics);
      });
    supabase.from("biometrics").select("resting_hr").not("resting_hr", "is", null)
      .order("metric_date", { ascending: false }).limit(1)
      .then(({ data }) => {
        if (active && data?.[0]) setAthlete((a) => ({ ...a, restingHr: (data[0] as { resting_hr: number }).resting_hr }));
      });
    return () => { active = false; };
    // reloadCustom is a useCallback with no deps, so it is stable for the life
    // of the component — listing it changes nothing and only adds a name the
    // next reader has to check.
  }, [user.id, reloadCustom]);

  const list = useMemo(() => {
    const all = [...custom, ...getExercisesForSport(sport)];
    const query = q.trim().toLowerCase();
    return all.filter((e) =>
      (sport === "all" || !e.sports || e.sports.includes(sport)) &&
      (cat === "All" || e.category === cat) &&
      withinLevel(e, level) &&
      (equip === "all" || exerciseEquip(e) === equip) &&
      (!query || e.name.toLowerCase().includes(query) || e.muscles.some((m) => m.toLowerCase().includes(query)))
    );
  }, [sport, cat, level, equip, q, custom]);

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

  return (
    <div className="animate-fade-up space-y-4">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-slate-400">
          {tab === "moves"
            ? `Look up any movement — how to do it, what it works, and when to use it. ${EXERCISES.length} in total.`
            : `Every recipe the meal planner can serve — method, timings and macros. ${MEALS.length} in total.`}
        </p>
      </header>

      <Tabs tabs={LIBRARY_TABS} active={tab} onChange={setTab} label="Library sections" />

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
        {custom.length > 0 && (
          <span className="text-xs text-slate-500">
            {custom.length} custom exercise{custom.length === 1 ? "" : "s"} in your library
          </span>
        )}
      </div>

      {/* Running zones — the reference every run prescription points back at.
          Collapsed by default: it's a page of reading, and the library's job is
          still to find a movement. Not gated on the athlete's sport, because
          runs are now programmed in every sport and a footballer told to do a
          Zone 2 run needs to know what that means as much as a runner does. */}
      <details className="group card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-semibold text-slate-200">
          <span>
            Running zones
            <span className="ml-2 text-xs font-normal text-slate-500">what Zone 1–5 actually mean</span>
          </span>
          <span className="text-xs text-slate-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="space-y-4 border-t border-white/[0.08] p-4">
          <ZoneGuide metrics={benchmarks} age={athlete.age} restingHr={athlete.restingHr} />
          <div>
            <h3 className="field-label">The runs themselves</h3>
            <RunTypeGuide />
          </div>
        </div>
      </details>

      {/* Sport stays visible — it's the filter people change most. The other
          three used to sit under it as three more horizontal scrollers, which
          on a phone meant four rows of chrome before a single exercise. They're
          behind a disclosure now, with a count so it's obvious when filters are
          on and hidden. */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Pill label="All sports" active={sport === "all"} onClick={() => setSport("all")} small />
        {SPORTS.map((s) => (
          <Pill key={s.id} label={`${s.emoji} ${s.label}`} active={sport === s.id} onClick={() => setSport(s.id)} small />
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
              className="text-xs font-semibold text-pitch-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </details>

      {sportDrills.length > 0 && (
        <section>
          <h2 className="field-label">
            {SPORTS.find((s) => s.id === sport)?.emoji} Made for {SPORTS.find((s) => s.id === sport)?.label.toLowerCase()}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sportDrills.map((ex) => (
              <button
                key={`sport-${ex.id}`}
                onClick={() => setOpen(ex)}
                className="card card-hover flex items-center gap-3 border-l-4 border-l-pitch-400/60 p-3 text-left"
              >
                <span className="grid h-14 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  <ExerciseDemo pattern={ex.demo} implement={demoImplement(ex)} className="h-11 w-9" />
                </span>
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
            className="card card-hover flex items-center gap-4 p-4 text-left"
          >
            <span className="grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              <ExerciseDemo pattern={ex.demo} implement={demoImplement(ex)} className="h-16 w-12" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {ex.difficulty && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DIFF_COLOR[ex.difficulty] }} title={DIFF_LABEL[ex.difficulty]} />}
                <span className="truncate text-xs text-slate-400">{ex.muscles[0] ?? ex.category} · {exerciseEquip(ex)}</span>
              </span>
              <span className="mt-1 block truncate font-bold text-slate-100">{ex.name}</span>
            </span>
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

      {open && <ExerciseModal ex={open} onClose={() => setOpen(null)} />}
      </div>
      )}
      </TabPanel>
    </div>
  );
}

function Pill({ label, active, onClick, small }: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
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
