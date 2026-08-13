"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
// Pinned to maplibre-gl 5 for the same reason route-map.tsx is — see the
// comment there about the 6.x worker breaking under a static export.
import { AttributionControl, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { maptilerStyleUrl, type ColorScheme } from "@/lib/maptiler";

/**
 * A coach's live view of one student's position — a single marker that
 * moves as new pings arrive, not the full traced route route-map.tsx draws
 * after a run. Deliberately its own small component rather than a mode of
 * route-map.tsx: that one draws a fixed, non-interactive trace over a
 * finished run's whole shape; this one is a real map the coach can pan
 * around a moving point on, closer to a delivery-tracking map than a
 * summary card.
 */

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeColorScheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useColorScheme(): ColorScheme | null {
  return useSyncExternalStore(
    subscribeColorScheme,
    () => (window.matchMedia(DARK_QUERY).matches ? "dark" : "light"),
    () => null,
  );
}

export function LiveMap({ lat, lon, className = "" }: { lat: number; lon: number; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const scheme = useColorScheme();
  const styleUrl = scheme && maptilerStyleUrl(scheme);

  // One map instance per style (i.e. per light/dark flip) — MapLibre has no
  // cheap way to swap a loaded style's tiles, and this screen doesn't need one.
  useEffect(() => {
    if (!styleUrl || !container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: styleUrl,
      center: [lon, lat],
      zoom: 15,
      attributionControl: false,
    });
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");
    markerRef.current = new Marker({ color: "#2f6fed" }).setLngLat([lon, lat]).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Deliberately only re-run on styleUrl — lat/lon updates are handled by
    // the effect below, moving the existing marker instead of rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  useEffect(() => {
    markerRef.current?.setLngLat([lon, lat]);
    mapRef.current?.panTo([lon, lat], { duration: 800 });
  }, [lat, lon]);

  if (scheme === null) {
    return <div className={`animate-pulse bg-border/40 ${className}`} aria-hidden="true" />;
  }
  // No MapTiler key configured — degrade silently, same contract maptilerStyleUrl documents.
  if (!styleUrl) return null;

  return <div ref={container} className={className} role="img" aria-label="Mapa com a posição atual" />;
}
