"use client";

import Link from "next/link";
import type { LevelInfo, Quest } from "@/lib/gamification";
import { Icon, type IconName } from "@/components/Icon";
import { RankBadge } from "@/components/RankBadge";

/**
 * What each of the day's three jobs looks like.
 *
 * The colours match the destination each row leads to, so the tile you tap here
 * is the colour of the page you land on. Kept to three because that is what
 * dailyQuests() returns — check in, train, eat.
 */
const QUEST_ICON: Record<string, IconName> = {
  checkin: "note",
  train: "barbell",
  nutrition: "plate",
};
const QUEST_TINT: Record<string, string> = {
  checkin: "#38bdf8",
  train: "#e3b53f",
  nutrition: "#4ade80",
};

/**
 * The day, in one card.
 *
 * WHAT THIS REPLACES. Home stacked eleven sections and the daily job was third,
 * under a greeting and a notification strip and above eight more things. For a
 * sixteen-year-old with ninety seconds before training that is not an app, it's
 * a homepage. Worse, the same three actions appeared TWICE — once as real
 * content (today's session, today's calories) and again lower down as "daily
 * quests", so the page asked for the same thing in two different voices.
 *
 * They are one thing now. The quests were always exactly the daily loop —
 * check in, train, eat — so this shows those three WITH their substance: the
 * session's actual name, the calories actually left. A row you can act on, not
 * a checkbox that points at a page that then tells you what to do.
 *
 * ON THE XP. It's here and deliberately quiet — a small number on the right,
 * not a badge with a starburst. The UX audit found athletes saying the app felt
 * like "a second job", which is what happens when a tracker starts issuing
 * assignments. So this is headed "Today", not "Daily quests"; there's no
 * denominator implying a score out of three; and nothing turns red for being
 * undone. The reward for doing it is that it's ticked, and the XP is a bonus
 * you notice rather than a debt you're serviced with.
 */
export function TodayCard({ quests, level, sessionTitle, sessionSub, kcalLeft, readinessLabel }: {
  quests: Quest[];
  level: LevelInfo;
  /** Today's scheduled session, if there is one. */
  sessionTitle: string | null;
  /** "Week 2 · 6 exercises" — the substance NextUp used to carry. */
  sessionSub: string | null;
  /** Calories still to eat. Null when no target is set up. */
  kcalLeft: number | null;
  /** "Ready to train", "Take it easy" — shown once they've checked in. */
  readinessLabel: string | null;
}) {
  const done = quests.filter((q) => q.done).length;
  const xpToday = quests.filter((q) => q.done).reduce((n, q) => n + q.xp, 0);

  // The substance for each row. Without this it's three checkboxes that each
  // send you somewhere to find out what they meant.
  const detailFor = (id: string): string => {
    if (id === "checkin") return readinessLabel ?? "Sleep, soreness, how you feel";
    if (id === "train") return sessionSub ?? sessionTitle ?? "Log anything you do";
    if (id === "nutrition") {
      if (kcalLeft == null) return "Set a calorie target";
      return kcalLeft > 0 ? `${kcalLeft.toLocaleString()} kcal left` : "Target hit";
    }
    return "";
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h2 className="text-lg font-extrabold tracking-tight">Today</h2>
        {/* Progress, stated as a fact rather than a score. "2 done" is a
            record; "2/3" is a mark out of three you are currently failing. */}
        <span className="text-xs text-slate-400">
          {done === quests.length ? (
            <span className="font-bold text-readiness-green">All done ✓</span>
          ) : done > 0 ? `${done} done${xpToday ? ` · +${xpToday} XP` : ""}` : null}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-white/[0.06]">
        {quests.map((q) => (
          <li key={q.id}>
            <Link
              href={q.href}
              className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.03]"
            >
              {/* WAS AN EMPTY CIRCLE — three identical grey rings down the one
                  card an athlete opens every morning, with nothing to tell
                  check-in from training from food until you read the label.
                  Undone rows now show WHAT the row is, in that destination's
                  own colour, so the card can be scanned rather than read. Done
                  rows collapse to the tick, because once it is done the only
                  thing worth saying is that it is done. */}
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition ${
                  q.done ? "border-pitch-400 bg-pitch-400 text-ink-900" : ""
                }`}
                style={
                  q.done
                    ? undefined
                    : {
                        color: QUEST_TINT[q.id] ?? "#94a3b8",
                        background: `linear-gradient(150deg, ${QUEST_TINT[q.id] ?? "#94a3b8"}2e, ${QUEST_TINT[q.id] ?? "#94a3b8"}0d)`,
                        borderColor: `${QUEST_TINT[q.id] ?? "#94a3b8"}3d`,
                        boxShadow: `inset 0 1px 0 ${QUEST_TINT[q.id] ?? "#94a3b8"}40`,
                      }
                }
              >
                {q.done ? <span className="text-xs font-bold">✓</span> : <Icon name={QUEST_ICON[q.id] ?? "check"} size={18} strokeWidth={2.2} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${q.done ? "text-slate-400" : "text-slate-100"}`}>
                  {q.id === "train" && sessionTitle ? sessionTitle : SHORT_LABEL[q.id] ?? q.label}
                </span>
                <span className="block truncate text-xs text-slate-500">{detailFor(q.id)}</span>
              </span>
              {!q.done && <span className="shrink-0 text-[10px] font-bold text-pitch-400">+{q.xp}</span>}
              <span className="shrink-0 text-slate-600">›</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Rank progress closes the card, so the reward sits underneath the work
          rather than in a panel of its own three scrolls away. */}
      <Link
        href="/rewards"
        className="flex items-center gap-3 border-t border-white/[0.06] bg-white/[0.02] px-5 py-3 transition hover:bg-white/[0.05]"
      >
        {/* The insignia, not the medal emoji — three glyphs covered nine tiers,
            so six of them wore a picture belonging to a rank they had nothing
            to do with. See components/RankBadge.tsx. */}
        <RankBadge tier={level.tier} division={level.division} color={level.color} size={22} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-bold" style={{ color: level.color }}>{level.rank}</span>
            <span className="shrink-0 text-[11px] text-slate-500">
              {level.xpForNext - level.xpIntoLevel} XP to go
            </span>
          </span>
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full transition-all"
              style={{ width: `${Math.round(level.progress * 100)}%`, background: level.color }}
            />
          </span>
        </span>
      </Link>
    </section>
  );
}

/**
 * Shorter than the quest labels, which read as instructions ("Log today's
 * check-in"). On a row that already has a tick and a chevron, the verb is
 * carried by the control — the label just has to name the thing.
 */
const SHORT_LABEL: Record<string, string> = {
  checkin: "Check in",
  train: "Train",
  nutrition: "Eat",
};
