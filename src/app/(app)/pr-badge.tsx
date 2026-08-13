import { formatDeltaDuration } from "@/lib/tracking/geoFilter";
import type { RunRecord } from "@/lib/tracking/personalRecords";

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

/** One "Seu melhor tempo nos 5 km!" card — only ever rendered for records where `isNewRecord` is true. */
export function PrBadge({ record }: { record: RunRecord }) {
  const beatPrevious = record.previousBestSeconds !== null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <ShoeIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Seu melhor tempo nos {record.label}!
        </p>
        {beatPrevious ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-xs font-medium text-good">
            ▼ {formatDeltaDuration(record.previousBestSeconds! - record.splitSeconds)}
          </span>
        ) : (
          <span className="mt-1 inline-block text-xs text-muted">Primeira vez nessa distância</span>
        )}
      </div>
    </div>
  );
}
