"use client";

/**
 * The registered shoe as a floating loot item.
 *
 * A real photographed racing shoe (see /public/shoe) tumbling slowly in
 * front of a rarity glow, both tinted to the colour the athlete picked for
 * that shoe.
 *
 * The shoe body itself takes the tint too, not just the glow behind it: the
 * photo is desaturated with a CSS filter, then a second layer holding the
 * flat athlete colour is clipped to the same photo's alpha channel
 * (`mask-image`) and laid over it with `mix-blend-mode: color`. That blend
 * mode keeps the backdrop's luminance (every fold, seam and highlight the
 * photo already has) and only swaps in the overlay's hue and saturation —
 * a duotone, not a flat silhouette — which a plain CSS tint/recolour filter
 * can't produce on a raster photo.
 */

const FALLBACK_RGB: [number, number, number] = [47, 111, 237];

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return FALLBACK_RGB;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const SHOE_IMAGE_SRC = "/shoe/shoe-side.png";

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
            className="pr-tumble-x relative isolate"
            style={{ transformStyle: "preserve-3d", transform: "rotateX(9deg) rotateZ(-3deg)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
            <img
              src={SHOE_IMAGE_SRC}
              alt=""
              className="block h-auto w-full"
              style={{ filter: "grayscale(1) brightness(1.08) contrast(1.05)" }}
            />
            <div
              className="absolute inset-0 mix-blend-color"
              style={{
                backgroundColor: color,
                WebkitMaskImage: `url(${SHOE_IMAGE_SRC})`,
                maskImage: `url(${SHOE_IMAGE_SRC})`,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
