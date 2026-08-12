"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
// Pinned to maplibre-gl 5: 6.x splits its web worker into sibling ES modules
// that import each other by relative path, and Turbopack content-hashes those
// filenames when it emits them, so the worker 404s on its own import and the
// map renders an empty background — no tiles, no line. 5.x inlines the worker
// in the bundle, which is what a static export needs.
import { AttributionControl, Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { maptilerStyleUrl, type ColorScheme } from "@/lib/maptiler";
import { haversineMeters } from "@/lib/tracking/geoFilter";
import {
  findFastestStretch,
  projectRoute,
  routeSegments,
  type FastestStretch,
} from "@/lib/tracking/routeProjection";
import type { StoredPoint } from "@/lib/tracking/storage";

/**
 * The GPS trace on a real MapTiler basemap, so the run reads as streets the
 * user recognises rather than a shape floating in the dark. Where tracking
 * silently gapped the line breaks instead of cutting across ground that was
 * never recorded — see routeProjection.ts.
 */

/**
 * The index range of the fastest stretch of the run — null when the run is
 * too short to make "fastest stretch" mean anything (the window scales with
 * total distance, floored at 150m so a few-second test run never highlights
 * itself end to end).
 */
function fastestStretchRange(
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[],
): FastestStretch | null {
  if (points.length < 3) return null;

  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) totalMeters += haversineMeters(points[i - 1], points[i]);
  if (totalMeters < 150) return null;

  const windowMeters = Math.min(1000, Math.max(150, totalMeters * 0.15));
  return findFastestStretch(points, windowMeters);
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeColorScheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Null on the server and during hydration, then the real scheme — the same
 * `useSyncExternalStore` shape as `usePreferences`. Null matters here beyond
 * avoiding a hydration mismatch: the basemap style is chosen per theme, so
 * booting the map before the scheme is known would download a light style and
 * flash a white square at anyone running the app dark.
 */
function useColorScheme(): ColorScheme | null {
  return useSyncExternalStore(
    subscribeColorScheme,
    () => (window.matchMedia(DARK_QUERY).matches ? "dark" : "light"),
    () => null,
  );
}

const ROUTE_SOURCE = "route";
const FASTEST_SOURCE = "route-fastest";
const FIT_OPTIONS = { padding: 24, maxZoom: 17, animate: false } as const;

/** Reproduces the old SVG glow: a wider halo in the basemap's own ground colour keeps the route legible over busy streets. */
const HALO_COLOR: Record<ColorScheme, string> = { light: "#ffffff", dark: "#0b0e11" };
/** The app's `--accent` per theme, so the trace belongs to the same palette as the rest of the screen. */
const ROUTE_COLOR: Record<ColorScheme, string> = { light: "#2f6fed", dark: "#5b8dff" };
/** Drawn on top of the route, narrower than it, so the accent still shows through the dashes on either theme. */
const FASTEST_COLOR = "#eaf1ff";

interface RouteGeometry {
  segments: [number, number][][];
  fastest: [number, number][] | null;
  bounds: [[number, number], [number, number]];
  start: [number, number];
  end: [number, number];
}

const lngLat = (p: Pick<StoredPoint, "lat" | "lon">): [number, number] => [p.lon, p.lat];

function routeGeometry(points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[]): RouteGeometry {
  const stretch = fastestStretchRange(points);
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);

  return {
    segments: routeSegments(points),
    fastest: stretch ? points.slice(stretch.startIndex, stretch.endIndex + 1).map(lngLat) : null,
    bounds: [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    start: lngLat(points[0]),
    end: lngLat(points[points.length - 1]),
  };
}

function multiLine(coordinates: [number, number][][]): GeoJSON.Feature<GeoJSON.MultiLineString> {
  return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates } };
}

function markerElement(className: string, pulsing = false): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  if (pulsing) {
    const halo = document.createElement("span");
    halo.className = "pr-halo absolute inset-0 rounded-full bg-accent";
    element.append(halo);
  }
  return element;
}

const START_MARKER = "block h-3 w-3 rounded-full border-2 border-black/50 bg-white";
const FINISH_MARKER = "block h-3 w-3 rounded-full border-2 border-accent bg-background";
const LIVE_MARKER = "relative block h-3 w-3 rounded-full bg-accent";

function RouteTiles({
  points,
  live,
  scheme,
  styleUrl,
}: {
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[];
  live: boolean;
  scheme: ColorScheme;
  styleUrl: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const startMarker = useRef<Marker | null>(null);
  const endMarker = useRef<Marker | null>(null);

  const geometry = useMemo(() => routeGeometry(points), [points]);
  // The style loads asynchronously, so the sources can only be filled in
  // once `load` fires — by then a live run may already have moved on.
  const latest = useRef(geometry);

  useEffect(() => {
    const instance = new MapLibreMap({
      container: container.current!,
      style: styleUrl,
      bounds: latest.current.bounds,
      fitBoundsOptions: FIT_OPTIONS,
      // This map sits inside a scrolling screen and replaces a still image:
      // a draggable map would swallow the scroll gesture on a phone.
      interactive: false,
      // MapTiler's terms require the attribution; placing it manually keeps
      // it clear of the "você está aqui" chip in the opposite corner.
      attributionControl: false,
    });
    instance.addControl(new AttributionControl({ compact: true }), "bottom-left");

    // `style.load`, not `load`: the latter also waits for the first full tile
    // render, so on a weak signal — the normal case right after a run — the
    // trace itself would be held back by the basemap it's drawn over.
    instance.on("style.load", () => {
      const { segments, fastest, start, end } = latest.current;

      instance.addSource(ROUTE_SOURCE, { type: "geojson", data: multiLine(segments) });
      instance.addSource(FASTEST_SOURCE, {
        type: "geojson",
        data: multiLine(fastest ? [fastest] : []),
      });

      const line = { "line-cap": "round", "line-join": "round" } as const;
      instance.addLayer({
        id: "route-halo",
        type: "line",
        source: ROUTE_SOURCE,
        layout: line,
        paint: { "line-color": HALO_COLOR[scheme], "line-width": 8, "line-opacity": 0.55 },
      });
      instance.addLayer({
        id: "route-line",
        type: "line",
        source: ROUTE_SOURCE,
        layout: line,
        paint: { "line-color": ROUTE_COLOR[scheme], "line-width": 4.5 },
      });
      instance.addLayer({
        id: "route-fastest",
        type: "line",
        source: FASTEST_SOURCE,
        layout: line,
        paint: { "line-color": FASTEST_COLOR, "line-width": 2.2, "line-dasharray": [2, 1.6] },
      });

      startMarker.current = new Marker({ element: markerElement(START_MARKER) })
        .setLngLat(start)
        .addTo(instance);
      endMarker.current = new Marker({
        element: live ? markerElement(LIVE_MARKER, true) : markerElement(FINISH_MARKER),
      })
        .setLngLat(end)
        .addTo(instance);
    });

    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      startMarker.current = null;
      endMarker.current = null;
    };
  }, [styleUrl, scheme, live]);

  useEffect(() => {
    latest.current = geometry;
    const instance = map.current;
    const source = instance?.getSource<GeoJSONSource>(ROUTE_SOURCE);
    if (!instance || !source) return; // style still loading — its handler reads `latest` itself

    source.setData(multiLine(geometry.segments));
    instance
      .getSource<GeoJSONSource>(FASTEST_SOURCE)!
      .setData(multiLine(geometry.fastest ? [geometry.fastest] : []));
    startMarker.current!.setLngLat(geometry.start);
    endMarker.current!.setLngLat(geometry.end);
    instance.fitBounds(geometry.bounds, FIT_OPTIONS);
  }, [geometry]);

  return <div ref={container} className="h-full w-full" role="img" aria-label="Trajeto percorrido" />;
}

/**
 * No basemap: either no MapTiler key is configured, or the map hasn't been
 * handed the browser's colour scheme yet (this is what the prerendered HTML
 * contains). Draws the bare trace on a fixed near-black surface — a
 * deliberately dark "map surface" rather than a themed card, so it doesn't
 * invert to a stark light square in light mode.
 */
function RouteTrace({
  points,
  live,
}: {
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[];
  live: boolean;
}) {
  const route = projectRoute(points)!;
  const stretch = fastestStretchRange(points);
  const fastestPoints =
    stretch &&
    route.projected
      .slice(stretch.startIndex, stretch.endIndex + 1)
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");

  return (
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
  );
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
  const scheme = useColorScheme();
  const styleUrl = scheme && maptilerStyleUrl(scheme);
  const hasRoute = points.length >= 2;
  const showTiles = hasRoute && scheme !== null && styleUrl !== null;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl ${showTiles && scheme === "light" ? "bg-[#eef1f3]" : "bg-[#0b0e11]"} ${square ? "aspect-square" : ""} ${className}`}
    >
      {!hasRoute ? (
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-xs text-white/40">
          {live ? "Aguardando trajeto GPS…" : "Sem trajeto GPS suficiente pra desenhar o mapa."}
        </div>
      ) : showTiles ? (
        <RouteTiles points={points} live={live} scheme={scheme} styleUrl={styleUrl} />
      ) : (
        <RouteTrace points={points} live={live} />
      )}

      {live && hasRoute && (
        <span className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white/80 backdrop-blur-sm">
          você está aqui
        </span>
      )}
    </div>
  );
}
