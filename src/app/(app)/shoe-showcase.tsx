import { HORSE_BUST_PATHS } from "../horse-mark";

/**
 * The registered shoe as a floating loot item.
 *
 * A side-profile running shoe drawn in the app's own line register — no
 * photography, no 3D library — tumbling slowly in front of a rarity glow tinted
 * to the colour the athlete picked for that shoe. Where a real shoe carries the
 * maker's logo on the side panel, this one carries the Xanthus horse bust.
 */

/**
 * Short reflection ramp for the logo patch. The landing page's full 22-stop
 * ramp is tuned for a mark hundreds of pixels tall; at the ~26px the badge
 * occupies, that many bands collapse into mud, so this keeps only one
 * specular/shadow pass per half.
 */
const BADGE_CHROME: ReadonlyArray<readonly [number, string]> = [
  [0, "#e6efff"],
  [0.18, "#ffffff"],
  [0.34, "#7ea6ff"],
  [0.42, "#2d59bd"],
  [0.5, "#5b8dff"],
  [0.7, "#f4f8ff"],
  [0.86, "#8fb3ff"],
  [1, "#3f74e6"],
];

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

/** Rec. 709 luma, 0–1 — decides whether detail lines go darker or lighter than the upper. */
function luma([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const INK = "#11151a";
const MIDSOLE = "#e7ecf1";
const OUTSOLE = "#9aa4ae";

/** Lace rungs climbing from the eyestay (first pair, where the eyelet goes) onto the tongue. */
const LACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [126, 64.8, 127.5, 56],
  [120, 62.5, 121.5, 53.5],
  [110, 58, 111.5, 49],
  [100, 53.6, 101.5, 44.5],
  [90, 49.2, 91.5, 40.5],
];

/** `className` has to keep the root positioned — the glow and the floor pool hang off it. */
export function ShoeShowcase({
  color,
  className = "relative",
}: {
  color: string;
  className?: string;
}) {
  const rgb = parseHex(color);
  const channels = `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
  const upperTop = mix(rgb, 255, 0.22);
  const upperBottom = mix(rgb, 0, 0.34);
  const detail = luma(rgb) > 0.5 ? mix(rgb, 0, 0.55) : mix(rgb, 255, 0.55);

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
            <svg viewBox="10 28 184 84" className="block h-auto w-full" fill="none">
              <defs>
                <linearGradient id="shoe-upper" x1="0" y1="24" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor={upperTop} />
                  <stop offset="55%" stopColor={color} />
                  <stop offset="100%" stopColor={upperBottom} />
                </linearGradient>
                {/*
                 * User space, and deliberately running well past the badge: the
                 * mark is three separate sub-paths, so an object-bounding-box
                 * ramp would give the ear and the shoulder line each its own
                 * private rainbow instead of one light source crossing all of
                 * them, and a box cropped tight to the badge would land the
                 * ramp's dark tail on the foreleg as a blot.
                 */}
                <linearGradient
                  id="shoe-chrome-badge"
                  x1="52"
                  y1="60"
                  x2="92"
                  y2="100"
                  gradientUnits="userSpaceOnUse"
                >
                  {BADGE_CHROME.map(([offset, stopColor]) => (
                    <stop key={offset} offset={offset} stopColor={stopColor} />
                  ))}
                </linearGradient>
              </defs>

              <g strokeLinecap="round" strokeLinejoin="round">
                {/* Midsole wedge: thick under the heel, thin under the forefoot,
                    running past the toe of the upper as a bumper. */}
                <path
                  d="M 16 86 C 12.5 93, 13 101, 19 104.5 L 170 104.5
                     C 181 104.5, 189 100, 191 93.5 C 191 90, 187.5 88.8, 184 90
                     C 166 95, 135 97.5, 116 97 C 90 96.5, 48 95, 16 86 Z"
                  fill={MIDSOLE}
                  stroke={INK}
                  strokeWidth="2.2"
                />
                <path
                  d="M 14 90 C 13 98.5, 17.5 106.5, 25 106.5 L 168 106.5
                     C 179.5 106.5, 188.5 101.5, 191.5 94"
                  stroke={OUTSOLE}
                  strokeWidth="6"
                />
                <g stroke={INK} strokeWidth="1.4" opacity="0.35">
                  <path d="M 46 101.5 L 46 108.5" />
                  <path d="M 72 102.5 L 72 109" />
                  <path d="M 98 103 L 98 109" />
                  <path d="M 124 103 L 124 109" />
                  <path d="M 150 102.5 L 150 108.5" />
                </g>

                {/*
                 * Upper, front to back: toe box, vamp, the long diagonal of the
                 * tongue, the ankle notch, then the heel collar and counter.
                 */}
                <path
                  d="M 179 91 C 178 80, 168 70, 152 65
                     C 145 62.5, 137 60, 130 57
                     C 116 49, 97 41, 84 36.5
                     C 80 41, 75.5 45.5, 70 47.5
                     C 63 45, 56 42.5, 50 41
                     C 44 40, 36 40, 30 46
                     C 23 53, 18.5 68, 16.5 86
                     C 30 92, 60 95, 100 96.2
                     C 133 96.8, 161 94.3, 179 91 Z"
                  fill="url(#shoe-upper)"
                  stroke={INK}
                  strokeWidth="2.2"
                />

                <g stroke={detail} strokeWidth="1.8" opacity="0.85">
                  <path d="M 152 66 C 148 75, 146 85, 146 94" />
                  <path d="M 130 57 C 127 68, 125.5 79, 125 91" />
                  <path d="M 99 64 C 95.5 74, 93.5 85, 93 96" />
                  <path d="M 21 82 C 24 68, 30 56, 40 48" />
                  {/* Far rim of the ankle opening, so the notch reads as a hole. */}
                  <path d="M 82 39 C 76 47, 68 53, 60 51.5 C 55 50.5, 51.5 48, 49 45" />
                  {/* Eyestay: the eyelet row the laces climb. */}
                  <path d="M 128 66 C 114 60, 98 53, 85 47" />
                </g>

                <g stroke={detail} strokeWidth="2.6">
                  {LACES.map(([x1, y1, x2, y2]) => (
                    <path key={x1} d={`M ${x1} ${y1} L ${x2} ${y2}`} />
                  ))}
                </g>
                <g fill={MIDSOLE} stroke={INK} strokeWidth="0.6" opacity="0.92">
                  {LACES.map(([x, y]) => (
                    <circle key={x} cx={x} cy={y} r="1.8" />
                  ))}
                </g>

                <path
                  d="M 152 68 C 163 71.5, 172 78, 178 86"
                  stroke="#ffffff"
                  strokeWidth="2.6"
                  opacity="0.28"
                />

                {/* Where a Nike swoosh or a set of Adidas stripes would sit. */}
                <g
                  transform="translate(53 63) scale(0.25)"
                  stroke="url(#shoe-chrome-badge)"
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
