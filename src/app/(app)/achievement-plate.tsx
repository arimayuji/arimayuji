"use client";

import { useId } from "react";
import type { Achievement } from "@/lib/tracking/achievements";
import {
  TIER_PAINT,
  plateLabelFontSize,
  platePolygon,
  sampleRamp,
  tintedStops,
} from "@/lib/plateMetal";
import { HORSE_FULL_BODY_PATHS } from "../horse-mark";

/**
 * The item that comes out of the box: a gem-cut chrome plate, not a
 * ribbon-and-circle medal — same reason the PR card never used one (see
 * pr-badge.tsx). It carries the horse bust, the distance and a stamped serial.
 *
 * Two things make it read as metal rather than coloured plastic. The face uses
 * the shoe showcase's 19-stop hard-edged chrome ramp verbatim, only re-hued
 * (see `tintedStops`); and each facet of the cut rim is filled by *sampling*
 * that same ramp at the position its outward normal faces the light, with no
 * interpolation, so neighbouring facets jump between blown-out white and ink
 * the way real bevels do.
 */

const toPath = (points: Array<[number, number]>) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";

/** Stamped twice, light offset under dark, so the mark survives both the blown-out and the ink bands of the ramp. */
function Engraved({
  children,
  ink,
  offset = 2.4,
}: {
  children: React.ReactNode;
  ink: string;
  offset?: number;
}) {
  return (
    <>
      <g transform={`translate(${offset} ${offset})`} stroke="#ffffff" opacity="0.55">
        {children}
      </g>
      <g stroke={ink} opacity="0.92">
        {children}
      </g>
    </>
  );
}

export function AchievementPlate({
  achievement,
  label,
  compact = false,
  className = "block h-auto w-full",
}: {
  achievement: Achievement;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const paint = TIER_PAINT[achievement.tier];
  const stops = tintedStops(paint, achievement.hueShift, achievement.tintScale);

  const outer = platePolygon(achievement.facets, 56, achievement.faceSpin);
  const inner = platePolygon(achievement.facets, 41, achievement.faceSpin);

  const facets = outer.map((point, i) => {
    const next = outer[(i + 1) % outer.length];
    const midAngle = ((i + 0.5) / outer.length) * 360 + achievement.faceSpin - 90;
    const delta = ((midAngle - achievement.lightAngle + 540) % 360) - 180;
    const facing = (1 - Math.cos((delta * Math.PI) / 180)) / 2;
    return {
      d: toPath([point, next, inner[(i + 1) % inner.length], inner[i]]),
      fill: sampleRamp(stops, facing * 100),
    };
  });

  const horse = HORSE_FULL_BODY_PATHS.map((d) => <path key={d} d={d} />);

  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-face`} x1="0" y1="8" x2="0" y2="112" gradientUnits="userSpaceOnUse">
          {stops.map(([offset, color]) => (
            <stop key={offset} offset={`${offset}%`} stopColor={color} />
          ))}
        </linearGradient>
        <clipPath id={`${uid}-face-clip`}>
          <path d={toPath(inner)} />
        </clipPath>
      </defs>

      <g strokeLinecap="round" strokeLinejoin="round">
        {facets.map((facet) => (
          <path key={facet.d} d={facet.d} fill={facet.fill} stroke="#0b0f13" strokeWidth="0.7" />
        ))}
        <path d={toPath(outer)} stroke="#0b0f13" strokeWidth="2" />
        <path d={toPath(inner)} fill={`url(#${uid}-face)`} stroke="#0b0f13" strokeWidth="1.6" />

        <g clipPath={`url(#${uid}-face-clip)`}>
          <path d="M -10 30 L 130 6 L 130 22 L -10 46 Z" fill="#ffffff" opacity="0.4" />
          <path d="M -10 78 L 130 56 L 130 63 L -10 85 Z" fill="#ffffff" opacity="0.24" />
        </g>

        <g
          transform={`translate(39.8 ${compact ? 30 : 25.5}) scale(${compact ? 0.44 : 0.37})`}
          strokeWidth="5"
        >
          <Engraved ink={paint.ink}>{horse}</Engraved>
        </g>

        {!compact && (
          <g fontFamily="ui-monospace, monospace" textAnchor="middle" stroke="none">
            <text x="60.7" y="78.7" fontSize={plateLabelFontSize(label)} fontWeight="700" fill="#ffffff" opacity="0.5">
              {label}
            </text>
            <text x="60" y="78" fontSize={plateLabelFontSize(label)} fontWeight="700" fill={paint.ink} opacity="0.92">
              {label}
            </text>
            <text x="60.4" y="88.4" fontSize="5.4" letterSpacing="0.7" fill="#ffffff" opacity="0.45">
              {achievement.serial}
            </text>
            <text x="60" y="88" fontSize="5.4" letterSpacing="0.7" fill={paint.ink} opacity="0.7">
              {achievement.serial}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
