/**
 * The basemap behind the GPS route (see src/app/(app)/route-map.tsx and
 * live-map.tsx) — a self-hosted Protomaps vector tileset served from our own
 * Cloudflare R2 bucket, not a third-party tile provider. This replaced an
 * earlier MapTiler-backed version after repeated, never-fully-explained
 * "the map won't load" reports: MapTiler's own servers being unreachable
 * (network blocking, an outage, rate limiting) was a single point of failure
 * outside this app's control. R2 sits behind the same Cloudflare edge this
 * app is already deployed on, so there's no separate third-party domain for
 * a network to single out.
 *
 * The tileset itself is a regional extract (all of Brazil, z0–15) of the
 * public Protomaps daily basemap build — pulled once via `pmtiles extract`
 * against the remote planet file and uploaded here, not regenerated per
 * request. Re-extracting to refresh it or widen the bbox is a one-off `pmtiles
 * extract` + upload, not something this app's runtime ever needs to do.
 */
import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";
import { addProtocol } from "maplibre-gl";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";

export type ColorScheme = "light" | "dark";

const TILES_BASE_URL =
  process.env.NEXT_PUBLIC_TILES_BASE_URL ?? "https://pub-72a6391a200c440a9466c2e0d774e84f.r2.dev";

const SOURCE_ID = "protomaps";

let protocolRegistered = false;

/** Registers the `pmtiles://` URL scheme with MapLibre. Idempotent — safe to call from every map-mounting effect, since it only needs to happen once per page no matter how many maps are on it. */
export function ensurePmtilesProtocol(): void {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

/**
 * `layers()` only gives buildings a flat fill — this swaps in a `fill-extrusion`
 * pass in the same slot so the 3D-tilted chase/idle camera (route-map.tsx's
 * CHASE_PITCH/IDLE_PITCH) has something to actually look 3D. `height`/
 * `min_height` are already resolved to meters by the basemap build; most
 * residential buildings simply have no OSM height tag at all, hence the flat
 * fallback rather than leaving them at 0 (invisible).
 */
function buildingExtrusion(scheme: ColorScheme, flavor: Flavor): LayerSpecification {
  return {
    id: "buildings",
    type: "fill-extrusion",
    source: SOURCE_ID,
    "source-layer": "buildings",
    filter: ["in", "kind", "building", "building_part"],
    minzoom: 14,
    paint: {
      "fill-extrusion-color": flavor.buildings,
      "fill-extrusion-height": ["coalesce", ["get", "height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-opacity": scheme === "dark" ? 0.75 : 0.6,
    },
  };
}

/** A complete MapLibre style object (not a URL to fetch) — sidesteps the whole "style.json fetch silently never resolves" failure mode the old MapTiler integration had to work around with a timeout. Tile data, glyphs and the sprite are still real network fetches, just all against our own R2 bucket. */
export function protomapsStyle(scheme: ColorScheme): StyleSpecification {
  const flavor = namedFlavor(scheme);
  const baseLayers = layers(SOURCE_ID, flavor, { lang: "pt" });
  const withExtrudedBuildings = baseLayers.map((layer) =>
    layer.id === "buildings" ? buildingExtrusion(scheme, flavor) : layer,
  );

  return {
    version: 8,
    glyphs: `${TILES_BASE_URL}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${TILES_BASE_URL}/sprites/v4/${scheme}`,
    sources: {
      [SOURCE_ID]: {
        type: "vector",
        url: `pmtiles://${TILES_BASE_URL}/brazil.pmtiles`,
        attribution:
          '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: withExtrudedBuildings,
  };
}
