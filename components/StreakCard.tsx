import { EARN_EVERY, MAX_BANKED, type StreakState } from "@/lib/load";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INSURANCE NOBODY KNOWS THEY HAVE DOES NOT CHANGE WHAT ANYBODY DOES.
 *
 * The rule in lib/load.ts saves a streak from one missed day. But the moment
 * the feature is for is the evening somebody realises they are not going to
 * check in — and if they do not already know a rest day exists, they have
 * exactly the thought the old rule produced: it's gone, so why bother
 * tomorrow. The number has to be visible BEFORE it is needed.
 *
 * So the shields are shown next to the streak whether or not one has ever been
 * spent, and the progress line says what earns the next one. It is a small
 * card; being seen every day is the whole job.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function StreakCard({ state }: { state: StreakState }) {
  const { streak, banked, covered, toNextBanked } = state;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="field-label !mb-1">Streak</p>
          <p className="text-3xl font-extrabold tracking-tight">
            🔥 {streak}<span className="ml-1 text-base font-semibold text-slate-400">day{streak === 1 ? "" : "s"}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="field-label !mb-1">Rest days</p>
          <p className="text-3xl font-extrabold tracking-tight" aria-label={`${banked} rest days banked`}>
            {/* Empty slots drawn too. "🛡️ 1" says what you have; a dimmed second
                shield says what there is to earn, which is the part that makes
                somebody log tomorrow. */}
            {Array.from({ length: MAX_BANKED }, (_, i) => (
              <span key={i} className={i < banked ? "" : "opacity-25"}>🛡️</span>
            ))}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        {banked > 0
          ? `Miss a day and a rest day covers it — your streak keeps going. Two days in a row still ends it.`
          : `Log ${EARN_EVERY} days in a row to earn a rest day. It covers one missed day so a streak survives a bad week.`}
        {toNextBanked !== null && streak > 0 && (
          <> {toNextBanked} more day{toNextBanked === 1 ? "" : "s"} to the next one.</>
        )}
      </p>

      {covered.length > 0 && (
        /* Named, not hidden. A streak that quietly papers over missed days is a
           number the athlete stops believing; saying which day was covered is
           what keeps it a fact rather than a flattering guess. */
        <p className="mt-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400">
          Covered by a rest day: {covered.map(prettyDay).join(", ")}
        </p>
      )}
    </div>
  );
}

/** "2026-07-11" → "11 Jul". Parsed as UTC so the label cannot slip a day. */
function prettyDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]}`;
}
