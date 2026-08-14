"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The "XP gained" strip on the finish screen — a bar that animates from
 * where the athlete's lifetime total sat *before* this run to where it sits
 * *now*, inside the current rung of one of the collectible ladders (see
 * emblems.ts/collectibles.ts). Deliberately only shown when this run didn't
 * cross a milestone for that ladder: crossing one already gets its own
 * dedicated "Novo emblema!" unlock card right above this on the finish
 * screen, and showing both for the same ladder would either double up or
 * (worse) show a bar snapping to 0% right after a full one — this is for
 * the far more common case of a run that moved the needle without finishing
 * the rung.
 */
export function EmblemProgressBar({
  icon,
  accent,
  label,
  deltaLabel,
  milestoneLabel,
  beforeProgress,
  afterProgress,
  remainingLabel,
}: {
  icon: ReactNode;
  accent: string;
  label: string;
  /** e.g. "+0,42 km" — what this specific run added. */
  deltaLabel: string;
  /** e.g. "10 km" — the next rung being filled toward. */
  milestoneLabel: string;
  /** 0–1, the fill *before* this run counted. */
  beforeProgress: number;
  /** 0–1, the fill *after* — always ≥ `beforeProgress` for the same rung. */
  afterProgress: number;
  /** e.g. "Faltam 1,58 km" — read together with `milestoneLabel` as "Faltam 1,58 km pro emblema de 10 km". */
  remainingLabel: string;
}) {
  const [filled, setFilled] = useState(false);

  // Mounts at `beforeProgress`, then animates to `afterProgress` on the next
  // frame — a CSS transition needs the "before" width to actually paint
  // first, or the browser has nothing to transition *from*.
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
          <span aria-hidden="true" style={{ color: accent }}>
            {icon}
          </span>
          {label}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: accent, backgroundColor: `${accent}22` }}
        >
          {deltaLabel}
        </span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${(filled ? afterProgress : beforeProgress) * 100}%`, backgroundColor: accent }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {remainingLabel} pro emblema de {milestoneLabel}
      </p>
    </div>
  );
}
