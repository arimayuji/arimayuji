import { formatDeltaDuration } from "@/lib/tracking/geoFilter";
import type { RunRecord } from "@/lib/tracking/personalRecords";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function MedalIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
      <path d="M8 3h8l-2.5 6h-3z" />
      <circle cx="12" cy="15" r="6" />
      <path d="M12 12.5v5M9.5 15h5" />
    </svg>
  );
}

/** One "Seu melhor tempo nos 5 km!" card — only ever rendered for records where `isNewRecord` is true. */
export function PrBadge({ record }: { record: RunRecord }) {
  const beatPrevious = record.previousBestSeconds !== null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <MedalIcon />
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
