"use client";

/**
 * The registered shoe as a floating loot item.
 *
 * A real illustrated racing shoe (generated externally, hand-picked for the
 * app's collectible aesthetic — see /public/shoe) tumbling slowly in front of
 * a rarity glow tinted to the colour the athlete picked for that shoe.
 *
 * The shoe art itself is fixed chrome rather than the athlete's colour: this
 * is the showcase piece, not a photo of the real pair, so it keeps one
 * material across every shoe in the locker and lets `color` speak through the
 * glow and the floor contact pool instead of a per-pixel tint a raster image
 * can't cleanly take.
 */

const FALLBACK_RGB: [number, number, number] = [47, 111, 237];

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return FALLBACK_RGB;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

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
            {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
            <img src="/shoe/shoe-side.png" alt="" className="block h-auto w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
