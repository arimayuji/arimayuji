"use client";

import { emblemImageUrl } from "@/lib/tracking/emblems";
import { HORSE_FULL_BODY_PATHS } from "../horse-mark";

/**
 * The lifetime-distance collectible itself — a real, once-commissioned piece
 * of art per milestone (see emblems.ts), not generated on-device. Three
 * states share this one component so the collection grid and the reveal
 * modal never risk drifting apart: `locked` (not reached yet — a dim
 * outline, no artwork fetched at all), `sealed` (reached but not yet
 * opened — the real piece, heavily blurred and darkened, so its colour mood
 * shows through without giving away the actual design) and the fully
 * `opened` artwork, crisp.
 *
 * The brand mark on top of the opened artwork is the *real* vector logo
 * (`HORSE_FULL_BODY_PATHS`, the same path data the PR plate stamps), not
 * something described in the image-generation prompt — an image model asked
 * for "a horse logo" only ever draws *a* horse, never *this* one. Same
 * `translate(39.8 30) scale(0.44)` placement `achievement-plate.tsx` uses
 * for its own compact/circular badge slot, glowing rather than engraved
 * since it sits on a luminous route-line piece rather than the plate's own
 * lit chrome face.
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

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-1/3 w-1/3"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  );
}

export function EmblemBadge({
  km,
  state,
  className = "block w-full",
}: {
  km: number;
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
        src={emblemImageUrl(km)}
        alt=""
        className={`h-full w-full object-cover ${state === "sealed" ? "scale-[1.65] blur-md brightness-[0.45] saturate-150" : "scale-[1.4]"}`}
      />
      {state === "sealed" && (
        <span className="absolute inset-0 flex items-center justify-center text-white/85">
          <LockIcon />
        </span>
      )}
      {state === "opened" && <HorseGlowMark />}
    </div>
  );
}
