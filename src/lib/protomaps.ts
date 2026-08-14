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
import type { FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";

export type ColorScheme = "light" | "dark";

const TILES_BASE_URL =
  process.env.NEXT_PUBLIC_TILES_BASE_URL ?? "https://pub-72a6391a200c440a9466c2e0d774e84f.r2.dev";

const SOURCE_ID = "protomaps";
const TERRAIN_SOURCE_ID = "terrain";
const OVERTURE_SOURCE_ID = "overture-buildings";
/**
 * OSM's building coverage is uneven — dense in some neighborhoods, entirely
 * untraced in others (see the "why does my street look flat" investigation).
 * Overture Maps' buildings theme fuses OSM with Microsoft/Google
 * satellite-derived footprints, giving far more complete coverage; the
 * tradeoff is it's a much bigger dataset with no ready-made regional
 * extract; this one was built by hand — DuckDB querying Overture's public
 * S3 parquet release filtered to a Greater São Paulo bbox, tippecanoe to a
 * vector tileset, converted to pmtiles — rather than pulled pre-packaged
 * like the basemap and terrain. Scoped to where this app's runs actually
 * are, not all of Brazil: the same pipeline re-run with a wider bbox is how
 * that would grow later.
 */
const OVERTURE_BOUNDS: [number, number, number, number] = [-47.5, -24.3, -45.5, -22.7];
/**
 * A real 3D terrain mesh is the one thing that reads as "hilly" even where
 * OSM has no building footprints traced at all — unlike the buildings
 * extrusion above, ground elevation exists everywhere, so this is what
 * actually fixes a residential street looking flat just because nobody's
 * mapped its buildings. Self-hosted the same way as the basemap: a regional
 * pmtiles extract (Mapterhorn's public Terrarium-encoded DEM, z0–10 — plenty
 * of resolution for hills at street scale, since fine city-block bumps are
 * past what's meaningful to show anyway) uploaded to the same R2 bucket.
 */
const TERRAIN_EXAGGERATION = 1.2;

let protocolRegistered = false;

/** Registers the `pmtiles://` URL scheme with MapLibre. Idempotent — safe to call from every map-mounting effect, since it only needs to happen once per page no matter how many maps are on it. */
export function ensurePmtilesProtocol(): void {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

const OVERTURE_BOUNDS_POLYGON = {
  type: "Polygon" as const,
  coordinates: [
    [
      [OVERTURE_BOUNDS[0], OVERTURE_BOUNDS[1]],
      [OVERTURE_BOUNDS[2], OVERTURE_BOUNDS[1]],
      [OVERTURE_BOUNDS[2], OVERTURE_BOUNDS[3]],
      [OVERTURE_BOUNDS[0], OVERTURE_BOUNDS[3]],
      [OVERTURE_BOUNDS[0], OVERTURE_BOUNDS[1]],
    ],
  ],
};

/**
 * `layers()` only gives buildings a flat fill — this swaps in a `fill-extrusion`
 * pass in the same slot so the 3D-tilted chase/idle camera (route-map.tsx's
 * CHASE_PITCH/IDLE_PITCH) has something to actually look 3D. `height`/
 * `min_height` are already resolved to meters by the basemap build; most
 * residential buildings simply have no OSM height tag at all, hence the flat
 * fallback rather than leaving them at 0 (invisible).
 *
 * Excluded inside `OVERTURE_BOUNDS`: the much denser Overture layer below
 * covers that area, and OSM's sparser footprints there would just double up
 * with it — slightly offset outlines stacked on the same block. Everywhere
 * else in Brazil, this OSM layer is still the only building data there is.
 */
function buildingExtrusion(scheme: ColorScheme, flavor: Flavor): LayerSpecification {
  return {
    id: "buildings",
    type: "fill-extrusion",
    source: SOURCE_ID,
    "source-layer": "buildings",
    filter: [
      "all",
      ["in", ["get", "kind"], ["literal", ["building", "building_part"]]],
      ["!", ["within", OVERTURE_BOUNDS_POLYGON]],
    ] satisfies FilterSpecification,
    minzoom: 14,
    paint: {
      "fill-extrusion-color": flavor.buildings,
      "fill-extrusion-height": ["coalesce", ["get", "height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-opacity": scheme === "dark" ? 0.75 : 0.6,
    },
  };
}

/** The denser Overture-derived buildings for Greater São Paulo — same paint recipe as the OSM layer above, different source and no `kind` filter needed since this tileset only ever contains buildings. */
function overtureBuildingExtrusion(scheme: ColorScheme, flavor: Flavor): LayerSpecification {
  return {
    id: "overture-buildings",
    type: "fill-extrusion",
    source: OVERTURE_SOURCE_ID,
    "source-layer": "buildings",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": flavor.buildings,
      "fill-extrusion-height": ["coalesce", ["get", "height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-opacity": scheme === "dark" ? 0.75 : 0.6,
    },
  };
}

/** Shaded relief from the same DEM that drives the 3D terrain mesh — visible even at a flat pitch, where the mesh displacement itself isn't. Sits right after the earth fill so water/landuse/roads/labels above it stay fully legible. */
function hillshade(scheme: ColorScheme): LayerSpecification {
  return {
    id: "hillshade",
    type: "hillshade",
    source: TERRAIN_SOURCE_ID,
    paint: {
      "hillshade-exaggeration": 0.5,
      "hillshade-shadow-color": scheme === "dark" ? "#000000" : "#5c5c5c",
      "hillshade-highlight-color": scheme === "dark" ? "#3a3a3a" : "#ffffff",
      "hillshade-accent-color": scheme === "dark" ? "#000000" : "#8f8f8f",
    },
  };
}

/** A complete MapLibre style object (not a URL to fetch) — sidesteps the whole "style.json fetch silently never resolves" failure mode the old MapTiler integration had to work around with a timeout. Tile data, glyphs and the sprite are still real network fetches, just all against our own R2 bucket. */
export function protomapsStyle(scheme: ColorScheme): StyleSpecification {
  const flavor = namedFlavor(scheme);
  const baseLayers = layers(SOURCE_ID, flavor, { lang: "pt" });
  const withExtrudedBuildings = baseLayers.flatMap((layer) =>
    layer.id === "buildings"
      ? [buildingExtrusion(scheme, flavor), overtureBuildingExtrusion(scheme, flavor)]
      : [layer],
  );
  // Right after "earth", ahead of landcover/water/roads/buildings — shaded
  // relief reads as ground texture, not a layer painted over the map.
  const earthIndex = withExtrudedBuildings.findIndex((layer) => layer.id === "earth");
  const withHillshade = [
    ...withExtrudedBuildings.slice(0, earthIndex + 1),
    hillshade(scheme),
    ...withExtrudedBuildings.slice(earthIndex + 1),
  ];

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
      [TERRAIN_SOURCE_ID]: {
        type: "raster-dem",
        url: `pmtiles://${TILES_BASE_URL}/brazil-terrain.pmtiles`,
        encoding: "terrarium",
        tileSize: 512,
        attribution: 'Relevo © <a href="https://mapterhorn.com">Mapterhorn</a>',
      },
      [OVERTURE_SOURCE_ID]: {
        type: "vector",
        url: `pmtiles://${TILES_BASE_URL}/overture-sp-buildings.pmtiles`,
        bounds: OVERTURE_BOUNDS,
        attribution: 'Prédios © <a href="https://overturemaps.org">Overture Maps Foundation</a>',
      },
    },
    terrain: { source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION },
    layers: withHillshade,
  };
}
