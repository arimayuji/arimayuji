import { HORSE_BUST_PATHS } from "../horse-mark";

/**
 * The registered shoe as a floating loot item.
 *
 * A side-profile running shoe drawn in the app's own line register — no
 * photography, no 3D library — tumbling slowly in front of a rarity glow tinted
 * to the colour the athlete picked for that shoe. Where a real shoe carries the
 * maker's logo on the side panel, this one carries the Xanthus horse bust.
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
                 * tongue, the ankle notch, the heel collar's wing flourish
                 * (curling up and back toward the toe, off the reference art),
                 * then down into the counter.
                 */}
                <path
                  d="M 179 91 C 178 80, 168 70, 152 65
                     C 145 62.5, 137 60, 130 57
                     C 116 49, 97 41, 84 36.5
                     C 80 41, 75.5 45.5, 70 47.5
                     C 63 45, 56 42.5, 50 41
                     C 46 39, 40 35, 36 30
                     C 34 27, 37 24, 42 25
                     C 45 25.5, 46 28, 44 31
                     C 41 34, 36 36, 31 39
                     C 25 44, 19 55, 17 68
                     C 16.3 74, 16.2 80, 16.5 86
                     C 30 92, 60 95, 100 96.2
                     C 133 96.8, 161 94.3, 179 91 Z"
                  fill="url(#shoe-upper)"
                  stroke={INK}
                  strokeWidth="2.2"
                />

                {/*
                 * Accent panel: a fixed-dark overlay (not colour-mixed off the
                 * shoe's own hue) sweeping from the heel down across the vamp
                 * toward the sole — same idea as the reference art's diagonal
                 * colour-block, and a steadier badge background than the bare
                 * gradient upper, since it doesn't shift toward unreadable on
                 * whatever colour the athlete picked.
                 */}
                <path
                  d="M 95 62 C 112 66, 135 75, 155 86
                     C 162 90, 167 93, 172 95
                     L 164 98
                     C 156 93, 146 87, 133 79
                     C 116 69, 100 63, 86 61 Z"
                  fill={INK}
                />

                <g stroke={detail} strokeWidth="1.8" opacity="0.85">
                  <path d="M 130 57 C 127 68, 125.5 79, 125 91" />
                  <path d="M 99 64 C 95.5 74, 93.5 85, 93 96" />
                  <path d="M 21 82 C 24 68, 27 50, 30 34" />
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

                {/*
                 * Where a Nike swoosh or a set of Adidas stripes would sit —
                 * on the accent panel now, not directly on the gradient
                 * upper, so a fixed light stroke against the panel's fixed
                 * dark fill stays legible on every colour a shoe can be.
                 */}
                <g
                  transform="translate(117 65) scale(0.22)"
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
