import { anatomyActivation, type ActivationLevel, type AnatomyRegion } from "@/lib/muscle-activation";

const colour = (level: ActivationLevel) => level === "primary" ? "#ef4444" : "#f59e0b";

function Active({ level, children }: { level?: ActivationLevel; children: React.ReactNode }) {
  if (!level) return null;
  return (
    <g
      color={colour(level)}
      opacity={level === "primary" ? 0.96 : 0.76}
      style={{ filter: `drop-shadow(0 0 3px ${colour(level)}88)` }}
    >
      {children}
    </g>
  );
}

/** Neutral anatomical mannequin used under the highlighted regions. */
function Body({ back = false }: { back?: boolean }) {
  return (
    <g fill="#cbd5e1" stroke="#475569" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="50" cy="13" r="8.5" strokeWidth="1.5" />
      <path d="M46 21h8v7h-8z" strokeWidth="1.2" />
      <path d="M37 28 Q50 23 63 28 L59 70 Q50 77 41 70 Z" strokeWidth="1.6" />
      <path d="M37 31 Q29 43 25 68" fill="none" strokeWidth="11" />
      <path d="M63 31 Q71 43 75 68" fill="none" strokeWidth="11" />
      <path d="M45 72 Q41 94 38 113 L36 139" fill="none" strokeWidth="12" />
      <path d="M55 72 Q59 94 62 113 L64 139" fill="none" strokeWidth="12" />
      <path d="M30 140h13M57 140h13" fill="none" strokeWidth="4" />
      <g fill="none" stroke="#94a3b8" strokeWidth="0.8" opacity="0.9">
        {back ? (
          <>
            <path d="M50 28v43M40 38q10 8 20 0M41 58q9-5 18 0M44 75q6 5 12 0" />
            <path d="M38 112h8M54 112h8" />
          </>
        ) : (
          <>
            <path d="M38 39q6-7 12 0q6-7 12 0M50 39v31M43 49h14M43 58h14M43 67h14" />
            <path d="M38 112h8M54 112h8" />
          </>
        )}
      </g>
    </g>
  );
}

function Front({ active }: { active: Partial<Record<AnatomyRegion, ActivationLevel>> }) {
  return (
    <g>
      <Body />
      <Active level={active.frontChest}>
        <path d="M39 34 Q44 29 49 34 L49 44 Q43 45 39 40ZM61 34 Q56 29 51 34 L51 44 Q57 45 61 40Z" fill="currentColor" />
      </Active>
      <Active level={active.frontShoulders}>
        <circle cx="37" cy="32" r="5.2" fill="currentColor" /><circle cx="63" cy="32" r="5.2" fill="currentColor" />
      </Active>
      <Active level={active.frontBiceps}>
        <path d="M34 38Q30 45 29 51M66 38Q70 45 71 51" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </Active>
      <Active level={active.frontForearms}>
        <path d="M29 53Q26 61 25 68M71 53Q74 61 75 68" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </Active>
      <Active level={active.frontCore}>
        <rect x="45" y="44" width="10" height="25" rx="4" fill="currentColor" />
        <path d="M50 45v22M45 52h10M45 60h10" fill="none" stroke="#fee2e2" strokeWidth="0.8" opacity="0.55" />
      </Active>
      <Active level={active.frontObliques}>
        <path d="M40 44Q44 49 44 68L40 66 39 49ZM60 44Q56 49 56 68L60 66 61 49Z" fill="currentColor" />
      </Active>
      <Active level={active.frontHipFlexors}>
        <path d="M42 68l7 2-3 11-6-5ZM58 68l-7 2 3 11 6-5Z" fill="currentColor" />
      </Active>
      <Active level={active.frontAdductors}>
        <path d="M48 74Q47 89 45 101M52 74Q53 89 55 101" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </Active>
      <Active level={active.frontQuads}>
        <path d="M43 77Q39 89 40 106M57 77Q61 89 60 106" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      </Active>
      <Active level={active.frontCalves}>
        <path d="M39 116Q37 125 36 136M61 116Q63 125 64 136" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </Active>
    </g>
  );
}

function Back({ active }: { active: Partial<Record<AnatomyRegion, ActivationLevel>> }) {
  return (
    <g>
      <Body back />
      <Active level={active.backTraps}>
        <path d="M43 28h14l-2 16-5 6-5-6Z" fill="currentColor" />
      </Active>
      <Active level={active.backLats}>
        <path d="M39 39Q43 43 49 48L47 63 41 67 39 49ZM61 39Q57 43 51 48L53 63 59 67 61 49Z" fill="currentColor" />
      </Active>
      <Active level={active.backShoulders}>
        <circle cx="37" cy="32" r="5.2" fill="currentColor" /><circle cx="63" cy="32" r="5.2" fill="currentColor" />
      </Active>
      <Active level={active.backTriceps}>
        <path d="M34 38Q30 45 29 52M66 38Q70 45 71 52" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </Active>
      <Active level={active.backForearms}>
        <path d="M29 54Q26 62 25 68M71 54Q74 62 75 68" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </Active>
      <Active level={active.backLower}>
        <path d="M44 58Q50 55 56 58L57 70Q50 74 43 70Z" fill="currentColor" />
      </Active>
      <Active level={active.backGlutes}>
        <ellipse cx="45.5" cy="75" rx="6" ry="6.5" fill="currentColor" /><ellipse cx="54.5" cy="75" rx="6" ry="6.5" fill="currentColor" />
      </Active>
      <Active level={active.backHamstrings}>
        <path d="M43 82Q40 94 40 106M57 82Q60 94 60 106" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      </Active>
      <Active level={active.backCalves}>
        <path d="M39 116Q37 125 36 136M61 116Q63 125 64 136" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </Active>
    </g>
  );
}

/** Front/back anatomical activation map: red leads, amber assists. */
export function ExerciseMuscleMap({ muscles, name, className = "" }: {
  muscles: readonly string[];
  name?: string;
  className?: string;
}) {
  const active = anatomyActivation(muscles);
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl bg-slate-100 p-2 ${className}`}>
      <svg viewBox="0 0 210 158" className="min-h-0 w-full flex-1" role="img" aria-label={`${name ?? "Exercise"} muscle activation, front and back`}>
        <rect x="2" y="2" width="100" height="153" rx="12" fill="#ffffff" />
        <rect x="108" y="2" width="100" height="153" rx="12" fill="#e2e8f0" />
        <text x="52" y="14" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="700" letterSpacing="1.1">FRONT</text>
        <text x="158" y="14" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="700" letterSpacing="1.1">BACK</text>
        <g transform="translate(2 9)"><Front active={active} /></g>
        <g transform="translate(108 9)"><Back active={active} /></g>
      </svg>
      <div className="flex min-w-0 shrink-0 items-center justify-center gap-3 overflow-hidden px-1 pt-1 text-[9px] font-bold uppercase tracking-wide text-slate-600 sm:text-[10px]">
        {muscles[0] && (
          <span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full bg-red-500" /><span className="truncate">{muscles[0]}</span></span>
        )}
        {muscles.length > 1 && (
          <span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" /><span className="truncate">{muscles.slice(1, 4).join(" · ")}</span></span>
        )}
      </div>
    </div>
  );
}
