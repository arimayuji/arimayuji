import { haversineMeters } from "@/lib/tracking/geoFilter";
import { findFastestStretch, projectRoute } from "@/lib/tracking/routeProjection";
import type { StoredPoint } from "@/lib/tracking/storage";

/**
 * Renders the actual GPS trace as a line, not a real basemap — no tile
 * provider is wired up (no API key, stays offline-first like the rest of the
 * app). Fixed near-black background regardless of app theme, same reasoning
 * as the running-loop video chip: this is a deliberately dark "map surface",
 * not a themed card, so it doesn't invert to a stark light square in light
 * mode.
 */

/**
 * The `points` slice covering the fastest stretch of the run, already
 * projected and joined into an SVG `points` string — null when the run is
 * too short to make "fastest stretch" mean anything (the window scales with
 * total distance, floored at 150m so a few-second test run never highlights
 * itself end to end).
 */
function fastestStretchPolyline(
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[],
  projected: { x: number; y: number }[],
): string | null {
  if (points.length < 3) return null;

  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) totalMeters += haversineMeters(points[i - 1], points[i]);
  if (totalMeters < 150) return null;

  const windowMeters = Math.min(1000, Math.max(150, totalMeters * 0.15));
  const stretch = findFastestStretch(points, windowMeters);
  if (!stretch) return null;

  return projected
    .slice(stretch.startIndex, stretch.endIndex + 1)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

export function RouteMap({
  points,
  className = "",
  live = false,
  square = true,
}: {
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[];
  className?: string;
  /** Pulses the end marker and labels it "here" instead of "finish" — for the in-progress run. */
  live?: boolean;
  /** False lets `className` set an explicit height instead — used for the compact live map, where a full-width square would push the pace readout and controls off-screen. */
  square?: boolean;
}) {
  const route = projectRoute(points);
  const fastestPoints = route ? fastestStretchPolyline(points, route.projected) : null;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-[#0b0e11] ${square ? "aspect-square" : ""} ${className}`}
    >
      {!route ? (
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-xs text-white/40">
          {live ? "Aguardando trajeto GPS…" : "Sem trajeto GPS suficiente pra desenhar o mapa."}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${route.viewBoxSize} ${route.viewBoxSize}`}
          className="pr-svg h-full w-full"
          role="img"
          aria-label="Trajeto percorrido"
        >
          <defs>
            <radialGradient id="route-map-vignette" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#171c22" />
              <stop offset="100%" stopColor="#0b0e11" />
            </radialGradient>
            <filter id="route-map-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="route-map-glow-strong" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width={route.viewBoxSize} height={route.viewBoxSize} fill="url(#route-map-vignette)" />

          {route.polylines.map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke="#5b8dff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#route-map-glow)"
            />
          ))}

          {fastestPoints && (
            <polyline
              points={fastestPoints}
              fill="none"
              stroke="#eaf1ff"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="3.2 2.6"
              filter="url(#route-map-glow-strong)"
            />
          )}

          <circle cx={route.start.x} cy={route.start.y} r="1.8" fill="#ffffff" />

          {live ? (
            <>
              <circle cx={route.end.x} cy={route.end.y} r="4" fill="#5b8dff" className="pr-halo" />
              <circle cx={route.end.x} cy={route.end.y} r="1.8" fill="#5b8dff" />
            </>
          ) : (
            <circle
              cx={route.end.x}
              cy={route.end.y}
              r="1.8"
              fill="#0b0e11"
              stroke="#5b8dff"
              strokeWidth="1.2"
            />
          )}
        </svg>
      )}

      {live && route && (
        <span className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white/80 backdrop-blur-sm">
          você está aqui
        </span>
      )}
    </div>
  );
}
