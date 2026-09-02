import Link from "next/link";
import type { RunningPlace } from "@/lib/places";
import { CRITERIA_KEYS } from "@/lib/placeRatings";
import { CriteriaMiniRow } from "./criteria";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <path d="M9 10l2 2 4-4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Real turn-by-turn directions, not just a pin — Google Maps geocodes a
 * `name, city` text query on its own, same as the design handoff's own
 * link. No stored lat/lon on `RunningPlace` itself (only optional circuit
 * polylines) worth reaching for here; a name+city query is exactly as
 * precise as what a runner would type into Maps by hand anyway.
 */
function directionsUrl(place: RunningPlace): string {
  const destination = encodeURIComponent(`${place.name}, ${place.city}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function PlaceCard({ place }: { place: RunningPlace }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface lg:rounded-xl lg:border-0 lg:bg-transparent">
      <Link href={`/lugares/${place.id}`} className="pr-press block hover:bg-foreground/[0.04] focus:outline-accent active:scale-[0.98]">
        {place.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway.
          <img
            src={place.coverImage}
            alt=""
            className="h-32 w-full object-cover"
          />
        )}
        <div className="p-5 pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{place.name}</h3>
              <p className="mt-0.5 truncate text-xs text-muted">{place.neighborhood}</p>
            </div>
            {place.loopDistanceMeters && (
              <span className="shrink-0 rounded-full bg-background px-2.5 py-1 font-mono text-[11px] tabular-nums text-muted">
                {(place.loopDistanceMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}km volta
              </span>
            )}
          </div>

          {place.safetyFlag && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-bad/10 px-2.5 py-2 text-xs leading-relaxed text-bad text-pretty">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" {...STROKE}>
                <path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
              </svg>
              {place.safetyFlag}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2">
            {CRITERIA_KEYS.map((key) => (
              <CriteriaMiniRow key={key} criteriaKey={key} score={place.criteria[key].score} />
            ))}
          </div>
        </div>
      </Link>

      <div className="flex items-end justify-between gap-3 border-t border-border p-5 pt-4">
        <p className="text-xs leading-relaxed text-muted">
          <strong className="font-medium text-foreground">Melhor horário:</strong> {place.bestTime}
        </p>
        <a
          href={directionsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="pr-press flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-bold whitespace-nowrap text-accent-foreground hover:opacity-90 active:scale-95"
        >
          <MapPinIcon className="h-3.5 w-3.5" />
          Ir
        </a>
      </div>
    </article>
  );
}
