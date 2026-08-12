import { projectRoute } from "@/lib/tracking/routeProjection";
import type { StoredPoint } from "@/lib/tracking/storage";

/**
 * Renders the actual GPS trace as a line, not a real basemap — no tile
 * provider is wired up (no API key, stays offline-first like the rest of the
 * app). Fixed near-black background regardless of app theme, same reasoning
 * as the running-loop video chip: this is a deliberately dark "map surface",
 * not a themed card, so it doesn't invert to a stark light square in light
 * mode.
 */

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
