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

export function PlaceCard({ place }: { place: RunningPlace }) {
  return (
    <Link href={`/lugares/${place.id}`} className="block rounded-2xl focus:outline-accent">
      <article className="overflow-hidden rounded-2xl border border-border bg-surface">
        {place.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway.
          <img
            src={place.coverImage}
            alt=""
            className="h-32 w-full object-cover"
          />
        )}
        <div className="p-5">
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

          <div className="mt-4 flex flex-col gap-1.5">
            {CRITERIA_KEYS.map((key) => (
              <CriteriaMiniRow key={key} criteriaKey={key} score={place.criteria[key].score} />
            ))}
          </div>

          <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
            <strong className="font-medium text-foreground">Melhor horário:</strong> {place.bestTime}
          </p>
        </div>
      </article>
    </Link>
  );
}
