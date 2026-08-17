"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// Pinned to maplibre-gl 5 for the same reason route-map.tsx is — see the
// comment there about the 6.x worker breaking under a static export.
import { AttributionControl, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { ensurePmtilesProtocol, protomapsStyle } from "@/lib/protomaps";
import { useEffectiveColorScheme } from "@/lib/theme";
import type { GroupMarker } from "@/lib/useGroupLiveRuns";

/**
 * A "longão"'s live view — several moving markers on one map instead of
 * `live-map.tsx`'s single dot. Kept as its own component rather than a mode
 * of that one: N markers need diffing by identity (create/move/remove) and
 * a fit-to-everyone camera instead of a `panTo` on one point, different
 * enough machinery that bolting it onto the 1-marker case would just be two
 * components pretending to be one.
 */

/** Fixed palette, not the CSS accent — several markers need to read apart from each other at a glance, which one shared accent colour can't do. */
const PALETTE = ["#eb4d4d", "#f5a623", "#1fb6a4", "#9b59b6", "#2ecc71", "#e67e22", "#16a5d6", "#e84393"];
const ME_COLOR = "#2f6fed";

/** Same id → same colour every session, and every device — a name hash, not a random assignment that would disagree between two phones looking at the same group. */
function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function buildMarkerElement(marker: GroupMarker): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col items-center gap-1";

  const dot = document.createElement("span");
  dot.className = "gm-dot relative block h-3.5 w-3.5 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]";
  dot.style.backgroundColor = marker.isMe ? ME_COLOR : colorForId(marker.id);
  dot.style.opacity = marker.stale ? "0.4" : "1";
  if (marker.isMe) {
    const halo = document.createElement("span");
    halo.className = "pr-halo absolute inset-0 rounded-full";
    halo.style.backgroundColor = ME_COLOR;
    dot.append(halo);
  }

  const pill = document.createElement("span");
  pill.className = "gm-label rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white";
  pill.textContent = marker.label;

  wrap.append(dot, pill);
  return wrap;
}

/** Applies a changed lat/lon/stale/label to an already-mounted marker in place, instead of tearing it down — a marker recreated every poll would flicker and lose MapLibre's own position-transition smoothing. */
function updateMarkerElement(element: HTMLElement, marker: GroupMarker): void {
  const dot = element.querySelector<HTMLElement>(".gm-dot");
  if (dot) dot.style.opacity = marker.stale ? "0.4" : "1";
  const label = element.querySelector<HTMLElement>(".gm-label");
  if (label && label.textContent !== marker.label) label.textContent = marker.label;
}

export function GroupLiveMap({ markers, className = "" }: { markers: GroupMarker[]; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const [following, setFollowing] = useState(true);
  const scheme = useEffectiveColorScheme();
  // Memoized on `scheme` alone — see live-map.tsx's own comment on why a
  // fresh style object every render would retrigger map creation.
  const style = useMemo(() => (scheme ? protomapsStyle(scheme) : null), [scheme]);

  // One map instance per style (light/dark flip) — markers are diffed onto
  // it by the effect below, never rebuilt here.
  useEffect(() => {
    if (!style || !container.current) return;
    ensurePmtilesProtocol();
    const map = new MapLibreMap({
      container: container.current,
      style,
      center: [0, 0],
      zoom: 14,
      attributionControl: false,
    });
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");
    // A drag is the athlete taking the camera back — stop auto-fitting
    // until they explicitly ask for it again via "Recentralizar" below.
    map.on("dragstart", () => setFollowing(false));
    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, [style]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.id);
      const existing = markersRef.current.get(marker.id);
      if (existing) {
        existing.setLngLat([marker.lon, marker.lat]);
        updateMarkerElement(existing.getElement(), marker);
      } else {
        const created = new Marker({ element: buildMarkerElement(marker) })
          .setLngLat([marker.lon, marker.lat])
          .addTo(map);
        markersRef.current.set(marker.id, created);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (!following || markers.length === 0) return;
    if (markers.length === 1) {
      map.easeTo({ center: [markers[0].lon, markers[0].lat], duration: 500 });
      return;
    }
    const lons = markers.map((m) => m.lon);
    const lats = markers.map((m) => m.lat);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 60, duration: 500, maxZoom: 16 },
    );
  }, [markers, following]);

  if (scheme === null) {
    return <div className={`animate-pulse bg-border/40 ${className}`} aria-hidden="true" />;
  }

  return (
    <div className="relative">
      <div ref={container} className={className} role="img" aria-label="Mapa do grupo" />
      {!following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/92 px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-md backdrop-blur-md"
        >
          Recentralizar
        </button>
      )}
    </div>
  );
}
