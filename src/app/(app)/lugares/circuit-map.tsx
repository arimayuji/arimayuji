"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  type GeoJSONSource,
  type LineLayerSpecification,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { ensurePmtilesProtocol, protomapsStyle, type ColorScheme } from "@/lib/protomaps";
import { useEffectiveColorScheme } from "@/lib/theme";
import type { RunningCircuit } from "@/lib/places";

/**
 * A place's named circuits (see `RunningCircuit` in src/lib/places.ts) drawn
 * as real lines on the same basemap route-map.tsx uses for a recorded run —
 * so "here's a suggested loop" reads on the actual street/path network, not
 * a floating shape. Deliberately a separate, much simpler component rather
 * than reusing `RouteMap`: that one carries a replay chase camera, a "fastest
 * stretch" highlight and live-run pulsing, none of which mean anything for a
 * static suggested circuit with no pace or timestamp data behind it.
 *
 * Kept flat (`pitch: 0`) instead of route-map.tsx's tilted idle camera —
 * that tilt exists there to show off 3D building extrusions during a chase
 * replay; here it would let a tall building's roof visually overlap a
 * circuit line passing in front of it. At true top-down, a fill-extrusion
 * polygon's screen footprint is identical to its flat base regardless of
 * height, so this can render circuits as plain MapLibre GL line layers
 * (real map data, not a DOM/SVG overlay) without route-map.tsx's occlusion
 * problem ever coming up.
 */

const IDLE_ZOOM_PADDING = 32;

/** Matches the app's own --accent/--warn tokens (globals.css) so a place with more circuits later doesn't need a third bespoke color — pick one of these two per theme. */
const CIRCUIT_COLORS: Record<ColorScheme, string[]> = {
  light: ["#2f6fed", "#d98e2b"],
  dark: ["#5b8dff", "#e6a13f"],
};

const HALO_COLOR: Record<ColorScheme, string> = { light: "#ffffff", dark: "#0b0e11" };

function boundsOf(circuits: RunningCircuit[]): [[number, number], [number, number]] {
  const lons = circuits.flatMap((c) => c.points.map((p) => p.lon));
  const lats = circuits.flatMap((c) => c.points.map((p) => p.lat));
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

function circuitLayers(circuits: RunningCircuit[], scheme: ColorScheme): {
  sources: Record<string, GeoJSON.Feature<GeoJSON.LineString>>;
  layers: LineLayerSpecification[];
} {
  const colors = CIRCUIT_COLORS[scheme];
  const sources: Record<string, GeoJSON.Feature<GeoJSON.LineString>> = {};
  const layers: LineLayerSpecification[] = [];

  circuits.forEach((circuit, i) => {
    const id = `circuit-${i}`;
    const color = colors[i % colors.length];
    sources[id] = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: circuit.points.map((p) => [p.lon, p.lat]) },
    };
    layers.push({
      id: `${id}-halo`,
      type: "line",
      source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": HALO_COLOR[scheme], "line-width": 7, "line-opacity": 0.55 },
    });
    layers.push({
      id,
      type: "line",
      source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": 3.5 },
    });
  });

  return { sources, layers };
}

function CircuitLegend({ circuits, scheme }: { circuits: RunningCircuit[]; scheme: ColorScheme }) {
  const colors = CIRCUIT_COLORS[scheme];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {circuits.map((circuit, i) => (
        <li key={circuit.name} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: colors[i % colors.length] }}
            aria-hidden="true"
          />
          {circuit.name} · {(circuit.distanceMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
        </li>
      ))}
    </ul>
  );
}

function CircuitTiles({ circuits, scheme, style }: { circuits: RunningCircuit[]; scheme: ColorScheme; style: StyleSpecification }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  const bounds = useMemo(() => boundsOf(circuits), [circuits]);
  const geometry = useMemo(() => circuitLayers(circuits, scheme), [circuits, scheme]);

  useEffect(() => {
    let settled = false;
    const failTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setTilesFailed(true);
      }
    }, 9000);

    ensurePmtilesProtocol();

    const instance = new MapLibreMap({
      container: container.current!,
      style,
      bounds,
      fitBoundsOptions: { padding: IDLE_ZOOM_PADDING, animate: false },
      interactive: false,
      attributionControl: false,
      pitch: 0,
    });
    instance.addControl(new AttributionControl({ compact: true }), "bottom-left");

    instance.on("style.load", () => {
      settled = true;
      clearTimeout(failTimer);
      setTilesFailed(false);
      for (const [id, feature] of Object.entries(geometry.sources)) {
        instance.addSource(id, { type: "geojson", data: feature });
      }
      for (const layer of geometry.layers) instance.addLayer(layer);
    });

    instance.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      setTilesFailed(true);
    });

    map.current = instance;
    return () => {
      clearTimeout(failTimer);
      instance.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- style/circuits identity changes intentionally rebuild the whole map, same pattern as RouteTiles in route-map.tsx.
  }, [style]);

  // Circuit lines can change (theme flip recolors them) without tearing the whole map down.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.isStyleLoaded()) return;
    for (const [id, feature] of Object.entries(geometry.sources)) {
      const source = instance.getSource(id) as GeoJSONSource | undefined;
      if (source) source.setData(feature);
    }
  }, [geometry]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={container}
        className={`h-full w-full ${
          scheme === "light"
            ? "[&_.maplibregl-canvas]:saturate-[0.35] [&_.maplibregl-canvas]:contrast-[1.12] [&_.maplibregl-canvas]:brightness-[0.92]"
            : "[&_.maplibregl-canvas]:saturate-[0.35] [&_.maplibregl-canvas]:contrast-[1.12] [&_.maplibregl-canvas]:brightness-[0.92]"
        } [&_.maplibregl-ctrl-attrib]:pointer-events-none [&_.maplibregl-ctrl-attrib-inner]:!hidden`}
        role="img"
        aria-label="Mapa com os circuitos sugeridos"
      />
      {tilesFailed && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center"
        >
          <p className="rounded-xl bg-black/55 px-3 py-2 text-xs text-white/85 backdrop-blur-sm">
            Não foi possível carregar o mapa. Confere sua conexão.
          </p>
        </div>
      )}
    </div>
  );
}

/** Nothing to draw without at least one circuit with two-plus points — the card above this decides whether to render it at all, this is just the defensive floor. */
export function CircuitMap({ circuits }: { circuits: RunningCircuit[] }) {
  const scheme = useEffectiveColorScheme();
  const style = useMemo(() => (scheme ? protomapsStyle(scheme) : null), [scheme]);
  const hasCircuits = circuits.some((c) => c.points.length >= 2);

  if (!hasCircuits) return null;

  return (
    <div>
      <div
        className={`relative aspect-square w-full overflow-hidden rounded-2xl ${
          scheme === "light" ? "bg-[#eef1f3]" : "bg-[#0b0e11]"
        }`}
      >
        {scheme && style ? (
          <CircuitTiles circuits={circuits} scheme={scheme} style={style} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
            Carregando mapa…
          </div>
        )}
      </div>
      {scheme && <CircuitLegend circuits={circuits} scheme={scheme} />}
    </div>
  );
}
