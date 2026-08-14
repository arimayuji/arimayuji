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
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { ensurePmtilesProtocol, protomapsStyle, type ColorScheme } from "@/lib/protomaps";
import { bearingDegrees, haversineMeters } from "@/lib/tracking/geoFilter";
import { replayHead, replayStretches, type ReplayCursor, type ReplayFrame } from "@/lib/tracking/replay";
import {
  findFastestStretch,
  projectRoute,
  routeSegments,
  type FastestStretch,
} from "@/lib/tracking/routeProjection";
import type { StoredPoint } from "@/lib/tracking/storage";

/**
 * The GPS trace on a real basemap (see src/lib/protomaps.ts), so the run
 * reads as streets the user recognises rather than a shape floating in the
 * dark. Where tracking
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
/**
 * Tilted rather than flat top-down even for the plain overview — a finished
 * trace or a live run in progress — so the same real building-extrusion
 * data the chase camera rides through (our own `buildings` fill-extrusion
 * layer, see src/lib/protomaps.ts, present from zoom 14) actually reads as
 * buildings instead of flat roof shapes. Safe to go steeper than the chase camera's
 * own pitch: the artifact that forced that one down (an ordinary street's
 * casing and fill layers visibly separating) only showed up zoomed in
 * close on individual streets, and this view stays zoomed out to the whole
 * route's bounds.
 */
const IDLE_PITCH = 50;
const FIT_OPTIONS = { padding: 24, maxZoom: 17, animate: false, pitch: IDLE_PITCH } as const;
/**
 * `animate: false` above is a real MapLibre option, not a no-op — it makes
 * `fitBounds` snap instantly rather than ease. That's the right call for a
 * finished run's one-time initial fit, but a live run re-fits on every GPS
 * point, and firing that same instant snap several times a minute reads as
 * the camera teleporting rather than following the run — which is what
 * "não é fluido" turned out to mean here. `duration` short enough that a
 * normal fix cadence lets one transition finish before the next starts, but
 * long enough to actually look like continuous camera motion rather than a
 * flicker.
 */
const LIVE_FIT_DURATION_MS = 700;

/** How long to wait for the basemap's tile data before treating it as failed rather than still loading — generous for a slow connection, not so long the screen just looks stuck. */
const TILE_LOAD_TIMEOUT_MS = 9000;

/**
 * A flaky connection (cell handoff, Wi-Fi reassociating, a DNS blip) often
 * clears itself within a few seconds — silently retrying a couple of times
 * before ever showing the user a failure message turns "the map's broken"
 * into "the map took a beat," which is what actually happened most of the
 * time this was reported. Only after these are exhausted does the retry
 * button in the UI take over as the (unlimited) manual fallback.
 */
const MAX_AUTO_RETRIES = 2;
const AUTO_RETRY_DELAY_MS = 2000;

/**
 * Replay's camera: tilted and zoomed to street level, following the head
 * from behind instead of the fixed top-down view a finished trace gets —
 * "riding along" reads the run the way running it felt, not the way it
 * looks flattened onto a map.
 */
/**
 * Steeper pitches (tried 65°, then 52°) kept producing a visible gap between
 * an ordinary street's casing and fill line — two MapLibre layers that are
 * meant to sit exactly on top of each other, styled to look like one road
 * with a border. At a shallow viewing angle they do; steeply pitched and
 * zoomed in close, the vector-tile precision behind them isn't enough to
 * keep the two aligned, and they visibly split into what reads as a second,
 * parallel route line. 34° is shallow enough that this stays imperceptible
 * while the view still reads as tilted and riding-along rather than flat.
 */
const CHASE_PITCH = 34;
const CHASE_ZOOM = 17.2;
/** Below this the two points behind a bearing calculation are close enough that GPS noise, not real heading, would decide which way the camera faces. */
const CHASE_BEARING_MIN_METERS = 3;
/** How long the camera takes to swoop from the overview into the chase position, and back out again when playback ends. */
const CHASE_TRANSITION_MS = 700;

/**
 * The chase camera tilts further down on a descent and pulls back up on a
 * climb — the same "leaning into the hill" the ground-level GPS trace can't
 * show on its own. Slope comes from `queryTerrainElevation`, reading the
 * terrain mesh (src/lib/protomaps.ts) already loaded for the 3D view, not a
 * separate lookup — this is why that terrain data was worth adding on its
 * own first.
 */
const CHASE_PITCH_MIN = 22;
const CHASE_PITCH_MAX = 48;
/** Degrees of pitch shift per 1% grade. */
const CHASE_PITCH_PER_GRADE_PERCENT = 1.6;
/**
 * Slope is measured over a stretch this long ahead of the current segment,
 * not point-to-point — consecutive GPS fixes can be a few meters apart,
 * close enough that terrain-tile resolution and ordinary GPS noise would
 * turn into a pitch that twitches on every frame instead of leaning
 * smoothly into an actual hill.
 */
const CHASE_SLOPE_LOOKAHEAD_METERS = 50;

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
 *
 * Only the trailing window behind the head is drawn — not the whole route
 * the way the old top-down replay showed a fading "ghost" of what's still
 * to come. Two reasons: it doesn't make sense to see the rest of the run's
 * shape from inside a first-person camera, and `map.project` gives garbage
 * screen coordinates for points far outside the current view once the
 * camera is pitched this steeply (they can land anywhere, including well
 * behind the camera), which read as a stray straight line slashing across
 * the map when connected into a polyline.
 *
 * That window is a fixed real-world *distance* (`CHASE_TRAIL_METERS`), not
 * `replay.tail` (9% of the run's total time) and not a fixed duration
 * either. Time doesn't work: at an easy walking pace the trail behind a
 * fixed number of seconds is barely anything, and early in a long run's
 * playback, 9% of total time is still almost all of the elapsed-so-far
 * time, so `replay.tail` collapses toward the run's actual start — right
 * back into the same far-away, wrong-side-of-the-camera points the window
 * exists to keep out. Bounding by ground actually covered keeps the trail a
 * comet-tail length that reads the same at any pace, and stays inside the
 * "safe" radius around the camera regardless of how long that stretch took
 * to run.
 */
const CHASE_TRAIL_METERS = 400;

/** Furthest-back point whose distance-so-far from the head is still under `CHASE_TRAIL_METERS`, walking backward and summing real ground covered rather than a share of the whole run. */
function chaseTrailFrame(
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[],
  headIndex: number,
): ReplayFrame {
  let index = headIndex;
  let covered = 0;
  while (index > 0 && covered < CHASE_TRAIL_METERS) {
    covered += haversineMeters(points[index - 1], points[index]);
    index--;
  }
  return { index, fraction: 0, meters: 0, seconds: 0, windowMeters: 0, windowSeconds: 0 };
}

/** Index of the point at least `meters` ahead of `fromIndex`, walking forward and summing real ground covered — same "distance, not point count" reasoning as `chaseTrailFrame`, facing the other way. */
function coordinateAheadIndex(
  coordinates: [number, number][],
  fromIndex: number,
  meters: number,
): number {
  let index = fromIndex;
  let covered = 0;
  while (index < coordinates.length - 1 && covered < meters) {
    covered += haversineMeters(
      { lat: coordinates[index][1], lon: coordinates[index][0] },
      { lat: coordinates[index + 1][1], lon: coordinates[index + 1][0] },
    );
    index++;
  }
  return index;
}

/**
 * Chase camera pitch for the segment starting at `fromIndex` — steeper
 * downhill tilts further down, steeper uphill pulls the camera back up,
 * both clamped to `CHASE_PITCH_MIN`/`MAX` so an unusually steep stretch
 * still looks like a plausible camera angle rather than a flip. Falls back
 * to the flat base pitch when the terrain tile at this spot hasn't loaded
 * yet — a guessed slope would be worse than none.
 */
function chaseSlopePitch(
  instance: MapLibreMap,
  coordinates: [number, number][],
  fromIndex: number,
): number {
  const aheadIndex = coordinateAheadIndex(coordinates, fromIndex, CHASE_SLOPE_LOOKAHEAD_METERS);
  if (aheadIndex === fromIndex) return CHASE_PITCH;

  const from = coordinates[fromIndex];
  const ahead = coordinates[aheadIndex];
  const elevFrom = instance.queryTerrainElevation(from);
  const elevAhead = instance.queryTerrainElevation(ahead);
  if (elevFrom === null || elevAhead === null) return CHASE_PITCH;

  const groundMeters = haversineMeters(
    { lat: from[1], lon: from[0] },
    { lat: ahead[1], lon: ahead[0] },
  );
  if (groundMeters < 1) return CHASE_PITCH;

  const gradePercent = ((elevAhead - elevFrom) / groundMeters) * 100;
  const pitch = CHASE_PITCH - gradePercent * CHASE_PITCH_PER_GRADE_PERCENT;
  return Math.min(CHASE_PITCH_MAX, Math.max(CHASE_PITCH_MIN, pitch));
}

function ReplayOverlay({
  points,
  projected,
  replay,
  scheme,
}: {
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[];
  projected: Pixel[];
  replay: ReplayCursor;
  scheme: ColorScheme;
}) {
  const trailStart = chaseTrailFrame(points, replay.head.index);
  const trail = replayStretches(points, projected, lerpXY, replay.head, trailStart);

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

      <Stretches
        stretches={trail}
        stroke={ROUTE_COLOR[scheme]}
        strokeWidth="10"
        strokeOpacity="0.6"
        filter={`url(#${REPLAY_BLOOM})`}
      />
      <Stretches
        stretches={trail}
        stroke={ROUTE_COLOR[scheme]}
        strokeWidth="4.5"
        filter={`url(#${REPLAY_GLOW})`}
      />
      <Stretches
        stretches={trail}
        stroke={FASTEST_COLOR}
        strokeWidth="11"
        strokeOpacity="0.5"
        filter={`url(#${REPLAY_BLOOM})`}
      />
      <Stretches
        stretches={trail}
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
  style,
  replay,
}: {
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[];
  live: boolean;
  scheme: ColorScheme;
  style: StyleSpecification;
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
  const chasePitch = useRef(CHASE_PITCH);
  const [toPixels, setToPixels] = useState<((c: [number, number]) => Pixel) | null>(null);
  /**
   * A blank canvas with no explanation reads as broken, not "still loading" —
   * this turns "the map never showed up" into a message and a retry instead
   * of a silent black square. `retryAttempt` is only ever bumped by the
   * button below; it exists purely so re-clicking it re-triggers the map
   * creation effect, since `styleUrl`/`scheme`/`live` alone wouldn't change
   * between one failed attempt and the next.
   */
  const [tilesFailed, setTilesFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  // Persists across the map-creation effect's own re-runs (including the
  // silent auto-retries it triggers itself) so the budget below is spent
  // once per mounted map, not reset every time the effect re-fires.
  const autoRetriesRef = useRef(0);

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
    // A dead connection (or a genuinely down R2 bucket) doesn't always
    // surface as an error event before `style.load` — it can just never
    // fire, leaving the map on a blank canvas forever with nothing telling
    // anyone why. `loaded` plus the timeout below is the fallback signal
    // for that case; the `error` listener further down catches the faster
    // case where the browser does report the failed fetch, so a real
    // network error doesn't have to sit out the full timeout before
    // anything happens.
    let loaded = false;
    let settled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const handleFailure = () => {
      if (settled) return;
      settled = true;
      if (autoRetriesRef.current < MAX_AUTO_RETRIES) {
        autoRetriesRef.current += 1;
        retryTimer = setTimeout(() => setRetryAttempt((n) => n + 1), AUTO_RETRY_DELAY_MS);
      } else {
        setTilesFailed(true);
      }
    };
    const failTimer = setTimeout(handleFailure, TILE_LOAD_TIMEOUT_MS);

    ensurePmtilesProtocol();

    const instance = new MapLibreMap({
      container: container.current!,
      style,
      bounds: latest.current.bounds,
      fitBoundsOptions: FIT_OPTIONS,
      // This map sits inside a scrolling screen and replaces a still image:
      // a draggable map would swallow the scroll gesture on a phone.
      interactive: false,
      // Protomaps/OSM attribution is required; placing it manually keeps
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
      loaded = true;
      settled = true;
      autoRetriesRef.current = 0;
      clearTimeout(failTimer);
      setTilesFailed(false);
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

    // Fires for a failed style/sprite/glyph fetch — a real network error,
    // as opposed to the timeout above, which also covers a request that
    // never resolves at all. Only counts before the style has loaded: once
    // markers and layers are up, a later `error` is something harmless like
    // a single missing tile, not a reason to blank the whole map out.
    instance.on("error", () => {
      if (loaded) return;
      clearTimeout(failTimer);
      handleFailure();
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
      clearTimeout(failTimer);
      clearTimeout(retryTimer);
      instance.remove();
      map.current = null;
      startMarker.current = null;
      endMarker.current = null;
      headMarker.current = null;
      setToPixels(null);
    };
  }, [style, scheme, live, retryAttempt]);

  useEffect(() => {
    replaying.current = replay !== null;
    const instance = map.current;
    if (!instance) return;

    // The whole trace is redrawn by the overlay while playback runs, so the
    // canvas gives up its copy rather than showing a filtered one underneath.
    // Guarded on the layer existing rather than gating this whole effect on
    // it (the old shape): the style — and these layers — only exist once
    // `style.load` fires, but the chase camera below doesn't need any of
    // that to move, and shouldn't sit frozen top-down just because a slow
    // or failed tile load hasn't reached that point yet.
    if (instance.getLayer(LINE_LAYER)) {
      for (const layer of BASE_LAYERS) {
        instance.setLayoutProperty(layer, "visibility", replay ? "none" : "visible");
      }
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
      chasePitch.current = chaseSlopePitch(instance, coordinates, replay.head.index);
    }

    if (!chasing.current) {
      chasing.current = true;
      instance.easeTo({
        center: head,
        bearing: chaseBearing.current,
        pitch: chasePitch.current,
        zoom: CHASE_ZOOM,
        duration: CHASE_TRANSITION_MS,
      });
    } else {
      // Instant, not eased: the head's own position already animates smoothly
      // on the run's clock (see replayFrameAt), so an eased camera here would
      // just lag a beat behind a dot that's already moving — the two need to
      // move in lockstep, not race each other.
      instance.jumpTo({ center: head, bearing: chaseBearing.current, pitch: chasePitch.current, zoom: CHASE_ZOOM });
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
    instance.fitBounds(
      geometry.bounds,
      live ? { ...FIT_OPTIONS, animate: true, duration: LIVE_FIT_DURATION_MS } : FIT_OPTIONS,
    );
  }, [geometry, live]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={container}
        // The dark flavor's water leans blue; this desaturates it toward the
        // app's own steel/chrome palette (see the brand mark's gradient in
        // src/app/icon.svg) instead of reading as a generic map-provider blue.
        // The chase camera gets a gentler version of the same filter: at
        // street level and this pitch, a motorway's already-thick line width
        // fills a lot more of the screen, and the standard desaturate+contrast
        // combo pushes its muted blue hard enough toward grey/white that it
        // reads as a stray line rather than a real road. Less aggressive here
        // keeps it recognisably a blue road, with our own accent-coloured
        // trail still the most saturated thing on screen either way.
        className={
          replay
            ? "h-full w-full [&_.maplibregl-canvas]:saturate-[0.55] [&_.maplibregl-canvas]:brightness-[0.9]"
            : "h-full w-full [&_.maplibregl-canvas]:saturate-[0.35] [&_.maplibregl-canvas]:contrast-[1.12] [&_.maplibregl-canvas]:brightness-[0.92]"
        }
        role="img"
        aria-label="Trajeto percorrido"
      />
      {replay && projected && (
        <ReplayOverlay points={points} projected={projected} replay={replay} scheme={scheme} />
      )}
      {tilesFailed && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
        >
          <p className="rounded-xl bg-black/55 px-3 py-2 text-xs text-white/85 backdrop-blur-sm">
            Não foi possível carregar o mapa. Confere sua conexão.
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              autoRetriesRef.current = 0;
              setTilesFailed(false);
              setRetryAttempt((n) => n + 1);
            }}
            className="pointer-events-auto rounded-full bg-black/55 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm active:scale-95"
          >
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * No basemap: the map hasn't been handed the browser's colour scheme yet
 * (this is what the prerendered HTML contains). Draws the bare trace on a
 * fixed near-black surface — a
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
  // Memoized on `scheme` alone: protomapsStyle() builds a fresh object every
  // call, and a new reference here would otherwise retrigger the map-creation
  // effect (and reload the whole map) on every unrelated re-render of this
  // component.
  const style = useMemo(() => (scheme ? protomapsStyle(scheme) : null), [scheme]);
  const hasRoute = points.length >= 2;
  const showTiles = hasRoute && scheme !== null && style !== null;

  return (
    <div
      className={`relative w-full overflow-hidden ${rounded ? "rounded-2xl" : ""} ${showTiles && scheme === "light" ? "bg-[#eef1f3]" : "bg-[#0b0e11]"} ${square ? "aspect-square" : ""} ${className}`}
    >
      {!hasRoute ? (
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-xs text-white/40">
          {live ? "Aguardando trajeto GPS…" : "Sem trajeto GPS suficiente pra desenhar o mapa."}
        </div>
      ) : showTiles ? (
        <RouteTiles points={points} live={live} scheme={scheme} style={style} replay={replay} />
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
