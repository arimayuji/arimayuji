"use client";

import { useId } from "react";
import { HORSE_BUST_PATHS } from "../horse-mark";

/**
 * The registered shoe as a floating loot item.
 *
 * A side-profile carbon-plate racer drawn in the app's own line register — no
 * photography, no 3D library — tumbling slowly in front of a rarity glow tinted
 * to the colour the athlete picked for that shoe. Where a real shoe carries the
 * maker's logo on the side panel, this one carries the Xanthus horse bust.
 *
 * The shoe body is polished chrome rather than the athlete's colour: this is
 * the showcase piece, not a swatch of the real pair, so it keeps one material
 * across every shoe in the locker and lets `color` speak through the glow, a
 * faint tint and the plate line instead.
 */

const FALLBACK_RGB: [number, number, number] = [47, 111, 237];

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return FALLBACK_RGB;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix([r, g, b]: [number, number, number], target: number, amount: number): string {
  const blend = (channel: number) => Math.round(channel + (target - channel) * amount);
  return `rgb(${blend(r)} ${blend(g)} ${blend(b)})`;
}

const INK = "#11151a";
const DETAIL = "#c9d4df";
const LACE = "#e6edf4";

/**
 * Stacked foam wedge: ~30 units under the heel against ~18 under the forefoot,
 * bevelled up at the back and swept hard up past the toe. The exaggerated
 * stack and that toe spring are what separate a racer from a trainer at a
 * glance — the shoe looks mid-stride while standing still.
 */
const MIDSOLE_PATH = `M 17 56
  C 9 61, 5.5 70, 9.5 78
  C 13 84.4, 22 86.8, 32 86.8
  L 120 86.8
  C 145 86.8, 166 79.5, 179 68
  C 183.5 64, 185.5 60.6, 183.5 58.8
  C 181.5 57.2, 178 58.8, 174.5 61.4
  C 165 66.4, 153 68.6, 137 69.8
  C 110 71.6, 76 71.4, 51 67.6
  C 34.5 65, 23.5 60.6, 17 56 Z`;

const OUTSOLE_PATH = `M 8 73 C 9 81.4, 20 85.1, 30 85.1 L 120 85.1
  C 144 85.1, 165 78, 178 66.4 L 185 59`;

/** The plate, riding the bottom third of the foam and spooning up into the toe. */
const PLATE_PATH = `M 12 67 C 15.5 75, 31 79, 56 80.4
  C 92 82.2, 124 80.6, 146 75.4 C 165 70.8, 177.5 62.2, 187 51.2`;

const PLATE_SHEEN_PATH = `M 12 64.4 C 15.5 72.4, 31 76.4, 56 77.8
  C 92 79.6, 124 78, 146 72.8 C 165 68.2, 177.5 59.6, 187 48.6`;

/**
 * Upper, front to back: blunt toe box, the long instep the laces climb, the
 * tongue rolling over into the ankle notch, the collar, then the heel counter
 * curving down to meet the foam.
 */
const UPPER_PATH = `M 171 62.8
  C 173.5 56, 168 50, 158 48.5
  C 144 46, 128 40, 112 32.6
  C 100 27.2, 90 22.6, 80 19.6
  C 72 17.4, 67 19.4, 66 23.4
  C 65 27, 63.5 29.4, 59.5 30.6
  C 52 32.8, 45 28.4, 39 21.4
  C 34.5 16, 30.5 11.6, 26 11.4
  C 19.5 11.2, 14 16.4, 11.5 25.4
  C 9.6 33, 10.4 45, 17 56
  C 23.5 60.6, 34.5 65, 51 67.6
  C 76 71.4, 110 71.6, 137 69.8
  C 151 68.8, 163 66.6, 171 62.8 Z`;

/**
 * Side overlay: a fixed-dark blade (not colour-mixed off the shoe's own hue)
 * sweeping from the midfoot down to the sole, carrying the badge. It stays a
 * steadier backing than the bare chrome, which runs to near-white in places a
 * light logo stroke would vanish into.
 */
const OVERLAY_PATH = `M 84 30
  C 87 45, 96 58, 110 66
  C 120 71, 132 73.4, 146 71.6
  C 134 66, 122 58.4, 111 49
  C 100 39.4, 89 30.6, 84 30 Z`;

/**
 * Polished metal, top to bottom: sky, a narrow blown-out specular streak, a
 * hard drop into an ink trough, then the bounce back off the white foam. The
 * abrupt stops matter more than the colours — blend them smoothly and the same
 * greys read as satin fabric instead of chrome.
 */
const CHROME_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, "#ffffff"],
  [4, "#d3dee7"],
  [12, "#8d9cab"],
  [20, "#63707e"],
  [26, "#aab8c5"],
  [28, "#ffffff"],
  [32, "#ffffff"],
  [34, "#9fadbb"],
  [39, "#39434e"],
  [41, "#101519"],
  [48, "#0e1317"],
  [52, "#48535e"],
  [58, "#8d9baa"],
  [66, "#c3cfda"],
  [72, "#eef4f9"],
  [76, "#ffffff"],
  [82, "#cfdae3"],
  [92, "#93a1af"],
  [100, "#b9c5d1"],
];

/** Lace rungs crossing the instep, each anchored on the eyestay below it. */
const LACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [131, 45.5, 133, 40.5],
  [118, 39.5, 120, 34.5],
  [105, 33.5, 107, 28.5],
  [93, 28, 95, 23],
];

/** `className` has to keep the root positioned — the glow and the floor pool hang off it. */
export function ShoeShowcase({
  color,
  className = "relative",
}: {
  color: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rgb = parseHex(color);
  const channels = `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
  const plate = mix(rgb, 0, 0.72);

  return (
    <div className={className} style={{ perspective: "900px" }} aria-hidden="true">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[190%] w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl"
        style={{
          background: `radial-gradient(closest-side, rgb(${channels} / 0.85), rgb(${channels} / 0.34) 52%, rgb(${channels} / 0) 78%)`,
        }}
      />

      {/* Contact pool: the item has no gravity, the floor under it still does. */}
      <div
        className="pointer-events-none absolute bottom-[-14%] left-1/2 h-[18%] w-[72%] -translate-x-1/2 rounded-[50%] blur-[7px]"
        style={{
          background: `radial-gradient(closest-side, rgb(${channels} / 0.9), rgb(${channels} / 0.3) 55%, rgb(${channels} / 0) 100%)`,
        }}
      />

      <div className="pr-drift">
        <div
          className="pr-tumble-y"
          style={{ transformStyle: "preserve-3d", transform: "rotateY(-26deg)" }}
        >
          <div
            className="pr-tumble-x"
            style={{ transformStyle: "preserve-3d", transform: "rotateX(9deg) rotateZ(-3deg)" }}
          >
            <svg viewBox="4 8 184 82" className="block h-auto w-full" fill="none">
              <defs>
                <linearGradient
                  id={`${uid}-chrome`}
                  x1="0"
                  y1="10"
                  x2="0"
                  y2="72"
                  gradientUnits="userSpaceOnUse"
                >
                  {CHROME_STOPS.map(([offset, stopColor]) => (
                    <stop key={offset} offset={`${offset}%`} stopColor={stopColor} />
                  ))}
                </linearGradient>
                <linearGradient
                  id={`${uid}-foam`}
                  x1="0"
                  y1="55"
                  x2="0"
                  y2="88"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="20%" stopColor="#edf2f7" />
                  <stop offset="48%" stopColor="#c6d0da" />
                  <stop offset="76%" stopColor="#9aa6b2" />
                  <stop offset="100%" stopColor="#79848f" />
                </linearGradient>
                <clipPath id={`${uid}-foam-clip`}>
                  <path d={MIDSOLE_PATH} />
                </clipPath>
                <clipPath id={`${uid}-upper-clip`}>
                  <path d={UPPER_PATH} />
                </clipPath>
              </defs>

              <g strokeLinecap="round" strokeLinejoin="round">
                <g clipPath={`url(#${uid}-foam-clip)`}>
                  <rect x="0" y="0" width="200" height="96" fill={`url(#${uid}-foam)`} />
                  <rect
                    x="0"
                    y="0"
                    width="200"
                    height="96"
                    fill={`rgb(${channels})`}
                    opacity="0.09"
                  />
                  <path d={OUTSOLE_PATH} stroke="#7b8793" strokeWidth="6" />
                  <path d={PLATE_PATH} stroke={plate} strokeWidth="2.6" />
                  <path d={PLATE_SHEEN_PATH} stroke="#ffffff" strokeWidth="1.1" opacity="0.65" />
                </g>
                <path d={MIDSOLE_PATH} stroke={INK} strokeWidth="2.2" />

                <path
                  d={UPPER_PATH}
                  fill={`url(#${uid}-chrome)`}
                  stroke={INK}
                  strokeWidth="2.2"
                />
                <g clipPath={`url(#${uid}-upper-clip)`}>
                  <rect
                    x="0"
                    y="0"
                    width="200"
                    height="96"
                    fill={`rgb(${channels})`}
                    opacity="0.1"
                  />
                  {/* Reflection streaks: raked across the form, not along it, so the
                      surface reads as curved metal catching a light bar. */}
                  <path
                    d="M 14 20 C 38 22, 68 30, 94 40"
                    stroke="#ffffff"
                    strokeWidth="1.6"
                    opacity="0.85"
                  />
                  <path
                    d="M 122 46 C 142 52, 158 56, 172 58"
                    stroke="#ffffff"
                    strokeWidth="1.4"
                    opacity="0.7"
                  />
                  <path d={OVERLAY_PATH} fill={INK} />
                </g>

                <g stroke={DETAIL} strokeWidth="1.5" opacity="0.7">
                  <path d="M 18 26 C 15.5 36, 15.5 47, 18 56" />
                  {/* Far rim of the ankle opening, so the notch reads as a hole. */}
                  <path d="M 76 22 C 70 27, 62 31, 55 30" />
                  {/* Eyestay: the eyelet row the laces climb. */}
                  <path d="M 133 42 C 118 35.5, 104 29.5, 92 25" />
                </g>

                <g stroke={LACE} strokeWidth="2.4">
                  {LACES.map(([x1, y1, x2, y2]) => (
                    <path key={x1} d={`M ${x1} ${y1} L ${x2} ${y2}`} />
                  ))}
                </g>
                <g fill="#eef2f7" stroke={INK} strokeWidth="0.6">
                  {LACES.map(([x, y]) => (
                    <circle key={x} cx={x} cy={y} r="1.7" />
                  ))}
                </g>

                {/*
                 * Where a Nike swoosh or a set of Adidas stripes would sit —
                 * on the overlay blade, not directly on the chrome, so a fixed
                 * light stroke stays legible instead of dissolving into the
                 * near-white specular bands.
                 */}
                <g
                  transform="translate(92 38) scale(0.24)"
                  stroke="#f4f6fb"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {HORSE_BUST_PATHS.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </g>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
