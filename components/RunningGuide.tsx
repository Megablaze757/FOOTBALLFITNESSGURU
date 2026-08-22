"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { latestMetrics } from "@/lib/benchmarks";
import { ZoneGuide, RunTypeGuide } from "@/components/ZoneGuide";

/**
 * What Zone 1–5 mean, and what each run type is for.
 *
 * MOVED OFF THE EXERCISE LIBRARY, which is where it used to live collapsed
 * under a list of movements. The library answers "how do I do this one thing";
 * zones are a reference you read once and come back to, and burying a page of
 * reading inside a search screen is how neither job gets done well. It lives on
 * Guides now, which is the page for exactly this.
 *
 * It loads its own athlete data rather than taking it as props, because it is
 * now mounted from a page that had no reason to fetch benchmarks or a resting
 * heart rate — and asking that page to learn about them to render a panel it
 * does not otherwise care about is how a page ends up fetching everything.
 *
 * Every input is optional. Without them the guide shows the standard bands and
 * says that is what it is doing.
 */
export function RunningGuide() {
  const user = useCurrentUser();
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [athlete, setAthlete] = useState<{ age: number | null; restingHr: number | null }>({ age: null, restingHr: null });

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    supabase.from("profiles").select("birth_year").eq("id", user.id).maybeSingle().then(({ data }) => {
      const year = (data as { birth_year?: number | null } | null)?.birth_year;
      if (active && year) setAthlete((a) => ({ ...a, age: new Date().getFullYear() - year }));
    });

    /**
     * The latest value of each metric — which is not the latest ROW.
     *
     * The benchmark form saves only what you typed, so a row is a test and not
     * a profile: a runner who logged a squat last week has a newest row with no
     * run time in it, and the guide would fall back to generic pace bands for
     * somebody who has entered their 5k.
     */
    supabase.from("strength_benchmarks").select("test_date, created_at, metrics")
      .order("test_date", { ascending: false }).limit(50)
      .then(({ data }) => { if (active && data?.length) setMetrics(latestMetrics(data)); });

    supabase.from("biometrics").select("resting_hr").not("resting_hr", "is", null)
      .order("metric_date", { ascending: false }).limit(1)
      .then(({ data }) => {
        const hr = (data?.[0] as { resting_hr: number } | undefined)?.resting_hr;
        if (active && hr) setAthlete((a) => ({ ...a, restingHr: hr }));
      });

    return () => { active = false; };
  }, [user.id]);

  return (
    <div className="space-y-4">
      <ZoneGuide metrics={metrics} age={athlete.age} restingHr={athlete.restingHr} />
      <div>
        <h3 className="field-label">The runs themselves</h3>
        <RunTypeGuide />
      </div>
    </div>
  );
}
