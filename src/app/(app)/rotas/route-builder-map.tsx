"use client";

import { useEffect, useMemo, useRef } from "react";
// Pinned to maplibre-gl 5 for the same reason route-map.tsx/live-map.tsx are.
import type { GeoJSONSource } from "maplibre-gl";
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { routeKmMarkers } from "@/lib/customRoutes";
import { ensurePmtilesProtocol, protomapsStyle } from "@/lib/protomaps";
import { useEffectiveColorScheme } from "@/lib/theme";

const SOURCE_ID = "drawn-route";
const LINE_LAYER_ID = "drawn-route-line";
const POINT_LAYER_ID = "drawn-route-points";
const ROUTE_COLOR = "#2f6fed";

// Ibirapuera, São Paulo — a reasonable starting view for anyone who hasn't
// panned anywhere yet; the athlete pans/zooms to their own city before
// clicking the first point.
const DEFAULT_CENTER: [number, number] = [-46.6577, -23.5874];
const DEFAULT_ZOOM = 13;

/** A small pill DOM marker for a km checkpoint — plain HTML/CSS via maplibre's Marker rather than a canvas symbol layer, since it needs no glyph setup on the basemap style and can reuse the app's own Tailwind tokens directly. */
function createKmMarkerElement(km: number): HTMLDivElement {
  const el = document.createElement("div");
  el.className =
    "flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-accent px-1.5 text-[10px] font-bold text-accent-foreground shadow-sm";
  el.textContent = `${km}km`;
  return el;
}

function toGeoJson(points: { lat: number; lon: number }[]) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: points.map((p) => [p.lon, p.lat]) },
        properties: {},
      },
      ...points.map((p, index) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        properties: { isLast: index === points.length - 1 },
      })),
    ],
  };
}

/**
 * The interactive drawing surface for "Minha Rota" — deliberately NOT a mode
 * of `route-map.tsx`'s `RouteMap`, which is `interactive: false` by design
 * (it draws its trace as a DOM/SVG overlay to dodge GL terrain-occlusion and
 * desaturation quirks on a fixed, non-interactive summary map). This one is
 * the opposite: a real, pannable/zoomable map the athlete builds a route on,
 * using an actual GeoJSON source + line/circle layers instead.
 *
 * A pure controlled renderer + click emitter — undo/clear live as plain
 * state operations on `points` in whichever page owns this, same separation
 * `live-map.tsx`'s `LiveMap` already has from whoever owns `lat`/`lon`.
 *
 * `onAddPoint` is optional: omitting it (the detail/view screen, looking at
 * a route you didn't draw) leaves the map fully interactive — pan/zoom still
 * work, clicking just does nothing — without a second component to maintain.
 */
export function RouteBuilderMap({
  points,
  onAddPoint,
  className = "",
}: {
  points: { lat: number; lon: number }[];
  onAddPoint?: (lat: number, lon: number) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onAddPointRef = useRef(onAddPoint);
  useEffect(() => {
    onAddPointRef.current = onAddPoint;
  }, [onAddPoint]);
  const scheme = useEffectiveColorScheme();
  const style = useMemo(() => (scheme ? protomapsStyle(scheme) : null), [scheme]);

  // One map instance per style — same reasoning as LiveMap: MapLibre has no
  // cheap way to swap a loaded style's tiles, and clicks are wired once here
  // via a ref so this effect never needs to re-run when `onAddPoint` changes.
  useEffect(() => {
    if (!style || !container.current) return;
    ensurePmtilesProtocol();
    const map = new MapLibreMap({
      container: container.current,
      style,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    // Two clicks placed close together while drawing shouldn't also zoom in.
    map.doubleClickZoom.disable();
    map.on("click", (event) => onAddPointRef.current?.(event.lngLat.lat, event.lngLat.lng));
    map.on("style.load", () => {
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, { type: "geojson", data: toGeoJson([]) });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 4 },
      });
      map.addLayer({
        id: POINT_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": ["case", ["get", "isLast"], 7, 5],
          "circle-color": ROUTE_COLOR,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [style]);

  // Redraws on every point change without ever tearing the map down. Km
  // markers are plain DOM Marker instances, cheapest to just wipe and
  // recreate wholesale each time — a hand-drawn route never has enough
  // points/km for that to matter.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(toGeoJson(points));

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = routeKmMarkers(points).map(({ lat, lon, km }) =>
      new Marker({ element: createKmMarkerElement(km) }).setLngLat([lon, lat]).addTo(map),
    );
  }, [points]);

  if (scheme === null) {
    return <div className={`animate-pulse bg-border/40 ${className}`} aria-hidden="true" />;
  }

  return (
    <div
      ref={container}
      className={className}
      role="img"
      aria-label="Mapa para desenhar sua rota — toque ou clique pra adicionar pontos"
    />
  );
}
