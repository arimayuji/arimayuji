import type { CSSProperties } from "react";
import { formatDeltaDuration } from "@/lib/tracking/geoFilter";
import { TIER_LABEL, type Achievement } from "@/lib/tracking/achievements";
import type { RunRecord } from "@/lib/tracking/personalRecords";
import { TIER_PAINT } from "@/lib/plateMetal";
import { AchievementPlate } from "./achievement-plate";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * A shoe, not a medal — the generic ribbon-and-circle medal is what every
 * fitness app uses for a PR, which is exactly the "muito cara do Strava"
 * the badge design is meant to move away from. Same line-icon language as
 * the rest of the app (STROKE above).
 */
function ShoeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
      <path d="M3 17.5h17.2c.9 0 1.5-.9 1-1.7-.8-1.3-2.3-2.1-4-2.1h-.2l-.6-3a1 1 0 0 0-1.4-.7l-1 .5a1 1 0 0 0-.5.6l-.6 2c-3 .3-5.4 1.7-6.2 3.6H4.5a1.5 1.5 0 0 0-1.5 1.5z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" {...STROKE}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * One "Seu melhor tempo nos 5 km!" card — only ever rendered for records where
 * `isNewRecord` is true. Pressing it opens the unboxing.
 *
 * An unopened card gives away nothing about the tier: it keeps the neutral
 * accent treatment and the shoe chip, so the rarity is still a surprise when
 * the lid comes off. Once opened it wears the item it contained — the same
 * plate, the same cut, the same colour, since both are derived from the same
 * seed — and the card is how the athlete recognises it in the list afterwards.
 */
export function PrBadge({
  record,
  achievement,
  opened,
  onOpen,
}: {
  record: RunRecord;
  achievement: Achievement;
  opened: boolean;
  onOpen: () => void;
}) {
  const beatPrevious = record.previousBestSeconds !== null;
  const paint = TIER_PAINT[achievement.tier];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${
        opened ? "" : "border-accent/30 bg-accent/10"
      }`}
      style={opened ? { borderColor: `${paint.glow}55`, backgroundColor: `${paint.glow}14` } : undefined}
    >
      {opened ? (
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <span
            className="absolute inset-[-16%] rounded-full blur-[6px]"
            style={{ background: `radial-gradient(closest-side, ${paint.glow}bb, transparent 72%)` }}
          />
          <AchievementPlate
            achievement={achievement}
            label={record.label}
            compact
            className="relative block h-full w-full"
          />
        </span>
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <ShoeIcon />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Seu melhor tempo nos {record.label}!
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {opened && (
            <span
              className="pr-tier-label font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={
                {
                  "--pr-tier-on-light": paint.glowOnLight,
                  "--pr-tier-on-dark": paint.glow,
                } as CSSProperties
              }
            >
              {TIER_LABEL[achievement.tier]}
            </span>
          )}
          {beatPrevious ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-xs font-medium text-good">
              ▼ {formatDeltaDuration(record.previousBestSeconds! - record.splitSeconds)}
            </span>
          ) : (
            <span className="text-xs text-muted">Primeira vez nessa distância</span>
          )}
        </div>
      </div>

      {opened ? (
        <ChevronIcon />
      ) : (
        <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
          Abrir
        </span>
      )}
    </button>
  );
}
