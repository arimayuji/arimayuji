"use client";

import { emblemImageUrl } from "@/lib/tracking/emblems";
import type { EmblemCategory } from "@/lib/tracking/storage";
import { HORSE_FULL_BODY_PATHS } from "../horse-mark";

/**
 * The lifetime collectible itself. The distância ladder uses a real,
 * once-commissioned piece of art per milestone (see emblems.ts) — elevação
 * and tempo don't have commissioned art of their own yet, so they render a
 * generated chrome-and-glow badge instead (`GeneratedBadgeArt`), keeping the
 * same three-state ritual rather than looking unfinished. Three states share
 * this one component so the collection grid and the reveal modal never risk
 * drifting apart: `locked` (not reached yet — a dim outline, no artwork
 * fetched at all), `sealed` (reached but not yet opened — heavily blurred
 * and darkened, so its colour mood shows through without giving away the
 * actual design) and the fully `opened` artwork, crisp.
 *
 * The brand mark on top of the opened artwork is the *real* vector logo
 * (`HORSE_FULL_BODY_PATHS`, the same path data the PR plate stamps), not
 * something described in the image-generation prompt — an image model asked
 * for "a horse logo" only ever draws *a* horse, never *this* one. Same
 * `translate(39.8 30) scale(0.44)` placement `achievement-plate.tsx` uses
 * for its own compact/circular badge slot, glowing rather than engraved
 * since it sits on a luminous piece rather than the plate's own lit chrome
 * face — shared across all three ladders, so every collectible still reads
 * as unmistakably Xanthus regardless of which one has real commissioned art.
 */

function HorseGlowMark() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <g transform="translate(39.8 30) scale(0.44)" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <g stroke="#ffffff" opacity="0.55" style={{ filter: "blur(2.5px)" }}>
          {HORSE_FULL_BODY_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g stroke="#ffffff" opacity="0.92">
          {HORSE_FULL_BODY_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>
    </svg>
  );
}

function ElevationGlyph({ accent }: { accent: string }) {
  return (
    <g stroke={accent} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M22 82 46 40 60 62 76 34 98 82Z" />
      <path d="M69 46 76 34 83 46" opacity="0.85" />
    </g>
  );
}

function TimeGlyph({ accent }: { accent: string }) {
  return (
    <g stroke={accent} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M42 30h36M42 90h36" />
      <path d="M42 30c0 15 14 19 18 30-4 11-18 15-18 30M78 30c0 15-14 19-18 30 4 11 18 15 18 30" />
    </g>
  );
}

/**
 * The generated stand-in for elevação/tempo, which have no commissioned art
 * yet: a dark radial glow in the milestone's own accent colour, styled like
 * the app's own icon set (`STROKE` in app-shell.tsx) rather than trying to
 * imitate the distância ladder's photographic medallions. The category glyph
 * sits small in a bottom-right corner rather than centred — `HorseGlowMark`
 * (added by the caller on top of this) is centred the same way it is on the
 * distância artwork, and the two competed for the same middle of the badge
 * before this was shrunk out of the way.
 */
function GeneratedBadgeArt({
  category,
  accent,
  sealed,
}: {
  category: Exclude<EmblemCategory, "distancia">;
  accent: string;
  sealed: boolean;
}) {
  return (
    <div
      className={`absolute inset-0 ${sealed ? "blur-md brightness-[0.55] saturate-150" : ""}`}
      style={{ background: `radial-gradient(circle at 32% 28%, ${accent}4d, #10141a 72%)` }}
    >
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <filter id="collectible-badge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="60" cy="60" r="56" fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="2" />
        {/* Shrunk into the bottom-right corner, out of HorseGlowMark's centred spot — see the component comment above. */}
        <g filter="url(#collectible-badge-glow)" transform="translate(57 57) scale(0.42)">
          {category === "elevacao" ? <ElevationGlyph accent={accent} /> : <TimeGlyph accent={accent} />}
        </g>
      </svg>
    </div>
  );
}

/**
 * A sealed emblem used to show a padlock over the blurred art — read as
 * "an icon sitting on a circle" rather than an actual object. This paints
 * the sphere's own volume instead — three stacked layers, the trick that
 * actually sells "ball" over "shiny disc":
 *   1. a highlight where the light hits, offset off-centre;
 *   2. a shadow on the opposite side, for the light's direction to read;
 *   3. limb darkening — every edge of the circle going dark, not just one
 *      side — since a flat disc only darkens toward whichever edge has a
 *      shadow gradient, while an actual sphere curves away from the light
 *      all the way around its silhouette.
 * The same read `.pr-orbit`'s ring and `.pr-glint`'s facets go for in the
 * full-screen reveal, just without needing motion to sell it.
 */
function SealedSphereShading() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-full"
      style={{
        background:
          "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.22) 14%, transparent 34%), " +
          "radial-gradient(circle at 72% 78%, rgba(0,0,0,0.7) 0%, transparent 52%), " +
          "radial-gradient(circle at 50% 50%, transparent 48%, rgba(0,0,0,0.68) 100%)",
      }}
    />
  );
}

export function EmblemBadge({
  category = "distancia",
  value,
  accent = "#5b8dff",
  state,
  className = "block w-full",
}: {
  category?: EmblemCategory;
  /** The milestone's raw value — km for distância, metres for elevação, hours for tempo. */
  value: number;
  /** Colour for the generated elevação/tempo art — see `collectibleDisplay` in collectibles.ts. Unused for distância, whose colour comes from its own artwork. */
  accent?: string;
  state: "locked" | "sealed" | "opened";
  className?: string;
}) {
  if (state === "locked") {
    return (
      <svg viewBox="0 0 120 120" className={`${className} aspect-square`} fill="none" aria-hidden="true">
        <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
        <circle
          cx="60"
          cy="60"
          r="48"
          strokeDasharray="1.5 6"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted/50"
        />
        <text
          x="60"
          y="70"
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          fontSize="30"
          fontWeight="700"
          fill="currentColor"
          className="text-muted/40"
        >
          ?
        </text>
      </svg>
    );
  }

  if (category !== "distancia") {
    return (
      <div className={`${className} relative aspect-square overflow-hidden rounded-full`}>
        <GeneratedBadgeArt category={category} accent={accent} sealed={state === "sealed"} />
        {state === "sealed" && <SealedSphereShading />}
        {state === "opened" && <HorseGlowMark />}
      </div>
    );
  }

  return (
    <div className={`${className} relative aspect-square overflow-hidden rounded-full`}>
      {/*
        The commissioned art sits on its own dark backdrop inside a square
        frame — the coin itself only fills about 72-75% of that square's
        width, so a plain circular crop left a visible dark ring around the
        actual medallion (read as "an old CD" rather than a coin with no
        edge at all). scale-[1.4] zooms in past that backdrop so the coin's
        own rim reaches the container's edge; sealed stacks the blur's own
        softening on top of that same base zoom.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed R2 asset doesn't need next/image anyway. */}
      <img
        src={emblemImageUrl(value)}
        alt=""
        className={`h-full w-full object-cover ${state === "sealed" ? "scale-[1.65] blur-md brightness-[0.45] saturate-150" : "scale-[1.4]"}`}
      />
      {/*
        Retints the commissioned art toward its rank's own metal/gem tone —
        same `mix-blend-mode: color` trick shoe-showcase.tsx uses to recolour
        a photo: it keeps the backdrop's own luminance (so the coin's
        engraving and shading still read) and swaps in this layer's hue and
        saturation instead. Eleven pieces of art, one shared rarity ramp,
        without needing eleven separate re-renders from the image model.
      */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: accent, mixBlendMode: "color" }}
        aria-hidden="true"
      />
      {state === "sealed" && <SealedSphereShading />}
      {state === "opened" && <HorseGlowMark />}
    </div>
  );
}
