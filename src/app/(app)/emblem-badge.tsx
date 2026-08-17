"use client";

import { useId } from "react";
import { tintedStops } from "@/lib/plateMetal";
import { RANK_METAL, type RankMetal } from "@/lib/rankMetal";
import type { EmblemCategory } from "@/lib/tracking/storage";
import { HORSE_FULL_BODY_PATHS } from "../horse-mark";

/**
 * The lifetime collectible itself. All three ladders (distância, elevação,
 * tempo) now share one material — the same faceted chrome/gem face
 * `achievement-plate.tsx` renders for a PR trophy, just painted onto a
 * circle and re-hued per rarity tier (see rankMetal.ts) instead of the PR
 * plate's own five tiers. An earlier version kept the once-commissioned
 * per-milestone photo (see emblems.ts's `emblemImageUrl`) as the coin's
 * face, first plain and later with a flat `mix-blend-mode` tint over it —
 * both read as a flat coloured circle, not a precious object, since a solid
 * tint (or a single photo) has none of the abrupt light/dark banding that
 * actually sells "polished metal" or "cut stone". Three states share this
 * one component so the collection grid and the reveal modal never risk
 * drifting apart: `locked` (not reached yet — a dim outline), `sealed`
 * (reached but not yet opened — heavily blurred and darkened, so its colour
 * mood shows through without giving away the actual design) and the fully
 * `opened` face, crisp and slowly catching the light.
 */

/** Two-pass stroke — a light copy offset under a dark one — so the horse survives both the blown-out and the ink bands of the chrome ramp underneath it. Exactly `achievement-plate.tsx`'s own `Engraved` technique, for the same reason: a flat single-colour stroke disappears the instant it crosses a band close to its own value. */
function EngravedHorse({ ink }: { ink: string }) {
  const horse = HORSE_FULL_BODY_PATHS.map((d) => <path key={d} d={d} />);
  return (
    <g
      transform="translate(39.8 30) scale(0.44)"
      fill="none"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform="translate(2.4 2.4)" stroke="#ffffff" opacity="0.55">
        {horse}
      </g>
      <g stroke={ink} opacity="0.92">
        {horse}
      </g>
    </g>
  );
}

function ElevationGlyph({ ink }: { ink: string }) {
  return (
    <g stroke={ink} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.82">
      <path d="M22 82 46 40 60 62 76 34 98 82Z" />
      <path d="M69 46 76 34 83 46" />
    </g>
  );
}

function TimeGlyph({ ink }: { ink: string }) {
  return (
    <g stroke={ink} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.82">
      <path d="M42 30h36M42 90h36" />
      <path d="M42 30c0 15 14 19 18 30-4 11-18 15-18 30M78 30c0 15-14 19-18 30 4 11 18 15 18 30" />
    </g>
  );
}

/**
 * The faceted chrome/gem face every emblem shares — the exact 19-stop
 * hard-edged ramp `achievement-plate.tsx` uses for the PR trophy (see
 * `tintedStops`/`CHROME_STOPS` in plateMetal.ts), re-hued per rank tier and
 * painted onto a circle instead of a cut polygon. Two diagonal specular
 * streaks, clipped to that same circle, are what turn "circle filled with a
 * gradient" into "something with a curved, reflective surface" — a flat
 * radial glow (the badge's previous background) never earns that read no
 * matter how nice the underlying hue is.
 */
function GemFace({ metal, uid }: { metal: RankMetal; uid: string }) {
  const stops = tintedStops(metal, 0, 1);
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-face`} x1="0" y1="4" x2="0" y2="116" gradientUnits="userSpaceOnUse">
          {stops.map(([offset, color]) => (
            <stop key={offset} offset={`${offset}%`} stopColor={color} />
          ))}
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="60" fill={`url(#${uid}-face)`} />
      <g clipPath={`url(#${uid}-clip)`}>
        <path d="M -10 30 L 130 6 L 130 22 L -10 46 Z" fill="#ffffff" opacity="0.38" />
        <path d="M -10 78 L 130 56 L 130 63 L -10 85 Z" fill="#ffffff" opacity="0.22" />
      </g>
    </>
  );
}

/**
 * A slow highlight sweeping around the opened face, like a cut stone
 * catching light as it slowly turns — the animation the flat tint had none
 * of, which is exactly what read as inert plastic rather than "a precious
 * thing you just earned". Reuses `.pr-orbit` verbatim (see globals.css and
 * emblem-reveal.tsx's own sealed-state ring): same 9s linear sweep, same
 * reduced-motion gate, so this never needs its own copy of that keyframe or
 * its own accessibility guard.
 */
function GemShimmer({ accent }: { accent: string }) {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full" aria-hidden="true">
      <span
        className="pr-orbit absolute -inset-[15%]"
        style={{
          background: `conic-gradient(from 0deg, transparent 0%, transparent 62%, ${accent}44 72%, #ffffff99 78%, ${accent}44 84%, transparent 94%, transparent 100%)`,
        }}
      />
    </span>
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
  metal = RANK_METAL[0],
  state,
  className = "block w-full",
}: {
  category?: EmblemCategory;
  /** The milestone's raw value — km for distância, metres for elevação, hours for tempo. Currently unused now that every category renders the same generated chrome face rather than a per-milestone image, kept so callers don't need a special case per category. */
  value: number;
  /** The rank-metal paint driving the chrome/gem face — see rankMetal.ts and `collectibleDisplay` in collectibles.ts. */
  metal?: RankMetal;
  state: "locked" | "sealed" | "opened";
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

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

  const sealed = state === "sealed";
  const opened = state === "opened";

  return (
    <div className={`${className} relative aspect-square overflow-hidden rounded-full`}>
      <svg
        viewBox="0 0 120 120"
        className={`absolute inset-0 h-full w-full ${sealed ? "blur-md brightness-[0.62] saturate-150" : ""}`}
        aria-hidden="true"
      >
        <GemFace metal={metal} uid={uid} />
        {category !== "distancia" && (
          <g transform="translate(57 57) scale(0.42)">
            {category === "elevacao" ? <ElevationGlyph ink={metal.ink} /> : <TimeGlyph ink={metal.ink} />}
          </g>
        )}
        {opened && <EngravedHorse ink={metal.ink} />}
      </svg>
      {sealed && <SealedSphereShading />}
      {opened && <GemShimmer accent={metal.accent} />}
    </div>
  );
}
