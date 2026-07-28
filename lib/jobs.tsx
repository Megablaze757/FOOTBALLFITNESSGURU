"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/**
 * Long jobs that keep running when you navigate away.
 *
 * THE PROBLEM. Building a program or analysing a video takes ten to thirty
 * seconds, and both were started inside the component you were looking at. Move
 * to another tab and the component unmounts, its state goes with it, and the
 * work either dies or finishes into nothing. So you had to sit and watch a
 * spinner — on a phone, on a page you'd already read.
 *
 * THE FIX. The work runs in a provider mounted above the router, so it survives
 * navigation. Components read job state instead of owning it: leave the page,
 * come back, and the job is still going or already finished.
 *
 * It does NOT survive a full page reload or the tab being closed — that would
 * need the work to live on a server, which for the in-browser video analysis it
 * cannot. So a running job says so plainly rather than pretending to be durable.
 */

export type JobStatus = "running" | "done" | "error";

export interface Job<T = unknown> {
  id: string;
  /** Groups jobs so a screen can find its own: "program", "video", "injury". */
  kind: string;
  /** Shown to the athlete: "Building your program". */
  label: string;
  status: JobStatus;
  result?: T;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

interface JobsApi {
  jobs: Job[];
  /** Start work that outlives the component that asked for it. */
  start: <T>(kind: string, label: string, run: () => Promise<T>) => string;
  /** The most recent job of a kind, however it ended. */
  latest: (kind: string) => Job | undefined;
  dismiss: (id: string) => void;
}

const Ctx = createContext<JobsApi | null>(null);

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  // The provider never unmounts, so a promise started here always has somewhere
  // to land — which is the whole point.
  const seq = useRef(0);

  const start = useCallback(<T,>(kind: string, label: string, run: () => Promise<T>): string => {
    const id = `${kind}-${++seq.current}-${Date.now()}`;
    setJobs((prev) => [...prev, { id, kind, label, status: "running", startedAt: Date.now() }]);

    void (async () => {
      try {
        const result = await run();
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "done", result, finishedAt: Date.now() } : j)));
      } catch (e) {
        // Keep the real message. Every long job in this app previously ended in
        // a generic "couldn't do that", which is why two broken features went
        // unnoticed for weeks.
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[job] ${kind} failed:`, error);
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "error", error, finishedAt: Date.now() } : j)));
      }
    })();

    return id;
  }, []);

  const latest = useCallback(
    (kind: string) => {
      const of = jobs.filter((j) => j.kind === kind);
      return of.length ? of[of.length - 1] : undefined;
    },
    [jobs]
  );

  const dismiss = useCallback((id: string) => setJobs((prev) => prev.filter((j) => j.id !== id)), []);

  const api = useMemo<JobsApi>(() => ({ jobs, start, latest, dismiss }), [jobs, start, latest, dismiss]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useJobs(): JobsApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useJobs must be used inside <JobsProvider>");
  return ctx;
}
