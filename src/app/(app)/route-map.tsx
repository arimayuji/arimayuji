"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SVGProps,
} from "react";
// Pinned to maplibre-gl 5: 6.x splits its web worker into sibling ES modules
// that import each other by relative path, and Turbopack content-hashes those
// filenames when it emits them, so the worker 404s on its own import and the
// map renders an empty background — no tiles, no line. 5.x inlines the worker
// in the bundle, which is what a static export needs.
import { AttributionControl, Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { maptilerStyleUrl, type ColorScheme } from "@/lib/maptiler";
import { bearingDegrees, haversineMeters } from "@/lib/tracking/geoFilter";
import { replayHead, replayStretches, type ReplayCursor } from "@/lib/tracking/replay";
import {
  findFastestStretch,
  projectRoute,
  routeSegments,
  stretchStarts,
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
const HALO_LAYER = "route-halo";
const LINE_LAYER = "route-line";
const FASTEST_LAYER = "route-fastest";
/** Everything the replay overlay redraws for itself, hidden on the canvas while it plays. */
const BASE_LAYERS = [HALO_LAYER, LINE_LAYER, FASTEST_LAYER];
const FIT_OPTIONS = { padding: 24, maxZoom: 17, animate: false } as const;

/**
 * Replay's camera: tilted and zoomed to street level, following the head
 * from behind instead of the fixed top-down view a finished trace gets —
 * "riding along" reads the run the way running it felt, not the way it
 * looks flattened onto a map.
 */
const CHASE_PITCH = 65;
const CHASE_ZOOM = 17.6;
/** Below this the two points behind a bearing calculation are close enough that GPS noise, not real heading, would decide which way the camera faces. */
const CHASE_BEARING_MIN_METERS = 3;
/** How long the camera takes to swoop from the overview into the chase position, and back out again when playback ends. */
const CHASE_TRANSITION_MS = 700;

/** How far the finished trace fades back while the replay head draws over it — still visible as the shape being filled in, never competing with it. */
const GHOSTED_ROUTE_OPACITY = 0.22;

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
const REPLAY_MARKER =
  "relative block h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_14px_2px_rgba(234,241,255,0.85)]";

const lerpLngLat = (a: [number, number], b: [number, number], f: number): [number, number] => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
];

interface Pixel {
  x: number;
  y: number;
}

const lerpXY = (a: Pixel, b: Pixel, f: number): Pixel => ({
  x: a.x + (b.x - a.x) * f,
  y: a.y + (b.y - a.y) * f,
});

const svgPoints = (points: Pixel[]) =>
  points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

/** The same per-stretch split `routeSegments` does, in whatever space `values` is in. */
function stretchesOf<T>(points: Pick<StoredPoint, "timestamp">[], values: T[]): T[][] {
  const starts = stretchStarts(points);
  return starts
    .map((from, i) => values.slice(from, starts[i + 1] ?? values.length))
    .filter((stretch) => stretch.length >= 2);
}

const REPLAY_BLOOM = "route-replay-bloom";
const REPLAY_GLOW = "route-replay-glow";

function Stretches({
  stretches,
  ...stroke
}: { stretches: Pixel[][] } & SVGProps<SVGPolylineElement>) {
  return stretches.map((points, i) => (
    <polyline
      key={i}
      points={svgPoints(points)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...stroke}
    />
  ));
}

/**
 * The replay drawn as SVG on top of the basemap rather than as GL layers
 * inside it. The canvas desaturation below is a CSS filter on the whole
 * `<canvas>`, and a GL layer cannot opt out of it — it washed the accent out
 * to a pale lavender. Out here the line keeps its own colour, and the
 * technique is the one the keyless fallback already uses (see `RouteTrace`).
 *
 * `projected` is every point run through `map.project`, recomputed on every
 * camera move — including the chase camera's own moves during playback, so
 * this overlay stays pinned to the basemap under it whether the camera is
 * sitting still on its one `fitBounds` or riding along behind the replay
 * head. See the `interactive: false` note in RouteTiles for why *user*
 * panning is still off regardless.
 */
function ReplayOverlay({
  points,
  projected,
  replay,
  scheme,
}: {
  points: Pick<StoredPoint, "timestamp">[];
  projected: Pixel[];
  replay: ReplayCursor;
  scheme: ColorScheme;
}) {
  const ghost = stretchesOf(points, projected);
  const drawn = replayStretches(points, projected, lerpXY, replay.head);
  const tail = replayStretches(points, projected, lerpXY, replay.head, replay.tail);

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <filter id={REPLAY_BLOOM} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={REPLAY_GLOW} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <Stretches stretches={ghost} stroke={HALO_COLOR[scheme]} strokeWidth="8" strokeOpacity="0.55" />
      <Stretches
        stretches={ghost}
        stroke={ROUTE_COLOR[scheme]}
        strokeWidth="4.5"
        strokeOpacity={GHOSTED_ROUTE_OPACITY}
      />

      <Stretches
        stretches={drawn}
        stroke={ROUTE_COLOR[scheme]}
        strokeWidth="10"
        strokeOpacity="0.6"
        filter={`url(#${REPLAY_BLOOM})`}
      />
      <Stretches
        stretches={drawn}
        stroke={ROUTE_COLOR[scheme]}
        strokeWidth="4.5"
        filter={`url(#${REPLAY_GLOW})`}
      />
      <Stretches
        stretches={tail}
        stroke={FASTEST_COLOR}
        strokeWidth="11"
        strokeOpacity="0.5"
        filter={`url(#${REPLAY_BLOOM})`}
      />
      <Stretches
        stretches={tail}
        stroke={FASTEST_COLOR}
        strokeWidth="4.5"
        filter={`url(#${REPLAY_GLOW})`}
      />
    </svg>
  );
}

function RouteTiles({
  points,
  live,
  scheme,
  styleUrl,
  replay,
}: {
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[];
  live: boolean;
  scheme: ColorScheme;
  styleUrl: string;
  replay: ReplayCursor | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const startMarker = useRef<Marker | null>(null);
  const endMarker = useRef<Marker | null>(null);
  const headMarker = useRef<Marker | null>(null);
  const replaying = useRef(replay !== null);
  const chasing = useRef(false);
  const chaseBearing = useRef(0);
  const [toPixels, setToPixels] = useState<((c: [number, number]) => Pixel) | null>(null);

  const geometry = useMemo(() => routeGeometry(points), [points]);
  // The style loads asynchronously, so the sources can only be filled in
  // once `load` fires — by then a live run may already have moved on.
  const latest = useRef(geometry);

  const active = replay !== null;
  const coordinates = useMemo(() => points.map(lngLat), [points]);
  const projected = useMemo(
    () => (toPixels && active ? coordinates.map(toPixels) : null),
    [coordinates, toPixels, active],
  );

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
      // Above the default 60°: the replay's chase camera (CHASE_PITCH) wants
      // a steeper look-ahead than the default max allows.
      maxPitch: 75,
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

      const line = {
        "line-cap": "round",
        "line-join": "round",
        visibility: replaying.current ? "none" : "visible",
      } as const;
      instance.addLayer({
        id: HALO_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: line,
        paint: { "line-color": HALO_COLOR[scheme], "line-width": 8, "line-opacity": 0.55 },
      });
      instance.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: line,
        paint: { "line-color": ROUTE_COLOR[scheme], "line-width": 4.5 },
      });
      instance.addLayer({
        id: FASTEST_LAYER,
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

    // Republished as a new function identity so the overlay reprojects: the
    // camera settles once here, but a live run refits its bounds as it grows.
    const publishProjection = () =>
      setToPixels(() => (coordinate: [number, number]) => {
        const { x, y } = instance.project(coordinate);
        return { x, y };
      });
    instance.on("move", publishProjection);
    instance.on("resize", publishProjection);
    publishProjection();

    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      startMarker.current = null;
      endMarker.current = null;
      headMarker.current = null;
      setToPixels(null);
    };
  }, [styleUrl, scheme, live]);

  useEffect(() => {
    replaying.current = replay !== null;
    const instance = map.current;
    if (!instance?.getLayer(LINE_LAYER)) return; // style still loading — the next frame lands after it

    // The whole trace is redrawn by the overlay while playback runs, so the
    // canvas gives up its copy rather than showing a filtered one underneath.
    for (const layer of BASE_LAYERS) {
      instance.setLayoutProperty(layer, "visibility", replay ? "none" : "visible");
    }
    if (endMarker.current) endMarker.current.getElement().style.opacity = replay ? "0" : "1";

    if (!replay) {
      headMarker.current?.remove();
      headMarker.current = null;
      if (chasing.current) {
        chasing.current = false;
        instance.fitBounds(latest.current.bounds, {
          ...FIT_OPTIONS,
          animate: true,
          duration: CHASE_TRANSITION_MS,
          pitch: 0,
          bearing: 0,
        });
      }
      return;
    }

    const head = replayHead(coordinates, replay.head, lerpLngLat);
    if (headMarker.current) headMarker.current.setLngLat(head);
    else {
      headMarker.current = new Marker({ element: markerElement(REPLAY_MARKER, true) })
        .setLngLat(head)
        .addTo(instance);
    }

    // Heading of the segment the head is currently on — too short a segment
    // (GPS jitter, or the very last point) leaves the previous heading alone
    // rather than snapping the camera toward a direction that isn't real.
    const from = coordinates[replay.head.index];
    const to = coordinates[Math.min(replay.head.index + 1, coordinates.length - 1)];
    if (from && to) {
      const segmentMeters = haversineMeters({ lat: from[1], lon: from[0] }, { lat: to[1], lon: to[0] });
      if (segmentMeters >= CHASE_BEARING_MIN_METERS) {
        chaseBearing.current = bearingDegrees({ lat: from[1], lon: from[0] }, { lat: to[1], lon: to[0] });
      }
    }

    if (!chasing.current) {
      chasing.current = true;
      instance.easeTo({
        center: head,
        bearing: chaseBearing.current,
        pitch: CHASE_PITCH,
        zoom: CHASE_ZOOM,
        duration: CHASE_TRANSITION_MS,
      });
    } else {
      // Instant, not eased: the head's own position already animates smoothly
      // on the run's clock (see replayFrameAt), so an eased camera here would
      // just lag a beat behind a dot that's already moving — the two need to
      // move in lockstep, not race each other.
      instance.jumpTo({ center: head, bearing: chaseBearing.current, pitch: CHASE_PITCH, zoom: CHASE_ZOOM });
    }
  }, [replay, coordinates]);

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

  return (
    <div className="relative h-full w-full">
      <div
        ref={container}
        // MapTiler's dark style leans blue; this desaturates it toward the
        // app's own steel/chrome palette (see the brand mark's gradient in
        // src/app/icon.svg) instead of reading as a generic map-provider blue.
        className="h-full w-full [&_.maplibregl-canvas]:saturate-[0.35] [&_.maplibregl-canvas]:contrast-[1.12] [&_.maplibregl-canvas]:brightness-[0.92]"
        role="img"
        aria-label="Trajeto percorrido"
      />
      {replay && projected && (
        <ReplayOverlay points={points} projected={projected} replay={replay} scheme={scheme} />
      )}
    </div>
  );
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
  replay,
}: {
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[];
  live: boolean;
  replay: ReplayCursor | null;
}) {
  const route = projectRoute(points)!;
  const stretch = fastestStretchRange(points);
  const fastestPoints =
    stretch &&
    svgPoints(route.projected.slice(stretch.startIndex, stretch.endIndex + 1));
  const drawn = replay && replayStretches(points, route.projected, lerpXY, replay.head);
  const tail = replay && replayStretches(points, route.projected, lerpXY, replay.head, replay.tail);
  const head = replay && replayHead(route.projected, replay.head, lerpXY);

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
          opacity={replay ? GHOSTED_ROUTE_OPACITY : 1}
          filter="url(#route-map-glow)"
        />
      ))}

      {drawn?.map((stretchPoints, i) => (
        <polyline
          key={`replay-${i}`}
          points={svgPoints(stretchPoints)}
          fill="none"
          stroke="#5b8dff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#route-map-glow-strong)"
        />
      ))}

      {tail?.map((stretchPoints, i) => (
        <polyline
          key={`replay-tail-${i}`}
          points={svgPoints(stretchPoints)}
          fill="none"
          stroke="#eaf1ff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#route-map-glow-strong)"
        />
      ))}

      {head && (
        <>
          <circle cx={head.x} cy={head.y} r="3.4" fill="#5b8dff" className="pr-halo" />
          <circle cx={head.x} cy={head.y} r="1.7" fill="#ffffff" />
        </>
      )}

      {!replay && fastestPoints && (
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

      {replay ? null : live ? (
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
  rounded = true,
  replay = null,
  children,
}: {
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[];
  className?: string;
  /** Pulses the end marker and labels it "here" instead of "finish" — for the in-progress run. */
  live?: boolean;
  /** False lets `className` set an explicit height instead — used for the compact live map, where a full-width square would push the pace readout and controls off-screen. */
  square?: boolean;
  /** False for the full-bleed live background — a rounded corner clipped against the viewport edge just looks like a bug. */
  rounded?: boolean;
  /** Current position of a playback of this run (see src/lib/tracking/replay.ts); null draws the finished trace. */
  replay?: ReplayCursor | null;
  /** Overlays positioned against the map itself — the replay controls and readout. */
  children?: ReactNode;
}) {
  const scheme = useColorScheme();
  const styleUrl = scheme && maptilerStyleUrl(scheme);
  const hasRoute = points.length >= 2;
  const showTiles = hasRoute && scheme !== null && styleUrl !== null;

  return (
    <div
      className={`relative w-full overflow-hidden ${rounded ? "rounded-2xl" : ""} ${showTiles && scheme === "light" ? "bg-[#eef1f3]" : "bg-[#0b0e11]"} ${square ? "aspect-square" : ""} ${className}`}
    >
      {!hasRoute ? (
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-xs text-white/40">
          {live ? "Aguardando trajeto GPS…" : "Sem trajeto GPS suficiente pra desenhar o mapa."}
        </div>
      ) : showTiles ? (
        <RouteTiles points={points} live={live} scheme={scheme} styleUrl={styleUrl} replay={replay} />
      ) : (
        <RouteTrace points={points} live={live} replay={replay} />
      )}

      {live && hasRoute && !replay && (
        <span className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white/80 backdrop-blur-sm">
          você está aqui
        </span>
      )}

      {children}
    </div>
  );
}
