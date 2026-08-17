"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";

/**
 * The registered shoe as a floating loot item.
 *
 * Two renderers share this component, picked automatically:
 *
 * - `ShoeTurntable`: a generated turntable clip (see its own comment for
 *   the generation spec — a hand-drawn/illustrated loop, not a photoreal
 *   one, per the project's Recraft art direction), chroma-keyed and
 *   retinted live on a canvas.
 * - The photo + CSS 3D fallback below: the original technique, still the
 *   base case whenever the clip isn't there yet (this repo doesn't ship the
 *   video asset — see `SHOE_VIDEO_SRC`), reduced motion is on, or the clip
 *   fails to load for any reason. A real photographed racing shoe (see
 *   /public/shoe) tumbling slowly in front of a rarity glow, tinted to the
 *   colour the athlete picked for that shoe: the photo is desaturated with a
 *   CSS filter, then a second layer holding the flat athlete colour is
 *   clipped to the same photo's alpha channel (`mask-image`) and laid over
 *   it with `mix-blend-mode: color`. Kept as a photo rather than redrawn to
 *   match, since it only ever shows when the illustrated clip isn't
 *   available — the two are not meant to be seen side by side.
 *
 * Both paths take the exact same `color` prop and produce the exact same
 * result at rest — swapping one for the other is purely a fidelity upgrade,
 * never a behaviour change a caller needs to know about.
 */

const FALLBACK_RGB: [number, number, number] = [47, 111, 237];

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return FALLBACK_RGB;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const SHOE_IMAGE_SRC = "/shoe/shoe-side.png";

/**
 * Not shipped in this repo yet — generated separately (Recraft Studio) and
 * dropped in at this path once it exists. Until then `ShoeTurntable` below
 * fails to load it (a plain 404) and every caller silently keeps getting
 * the photo + CSS-tumble version, so adding this file later is the entire
 * "upgrade" — no code change required.
 *
 * Art direction: hand-drawn/animated, bold clean outlines, cel-shaded —
 * not photoreal. A photorealistic clip generated from a photo starting
 * frame reads as "almost right" in a way flat, illustrated motion doesn't;
 * the project's brand mark and emblem art are already all illustration,
 * not photography, and this should read as the same family.
 *
 * Generation spec, so a regenerated clip keeps working with the chroma key
 * below without touching code (these two constraints are about what the
 * *pipeline* needs, independent of art style):
 * - Pure black (#000000) background, evenly lit, no shadow/vignette
 *   gradient — anything short of solid black survives the chroma key as a
 *   grey halo around the shoe.
 * - Grey/neutral shading on the shoe itself, no colour of its own — this
 *   feeds the "colour" blend below as the luminance layer, so a saturated
 *   source clip would fight the tint instead of carrying it.
 *
 * Plus, for the framing itself:
 * - Same side-on silhouette/crop as `shoe-side.png`, one slow 360° rotation
 *   (or a there-and-back turntable), looping cleanly.
 *
 * Suggested prompt: "A hand-drawn animated illustration of a running shoe
 * in profile, bold clean outlines, cel-shaded, rotating slowly 360 degrees
 * on a turntable, pure solid black background (#000000), neutral grey
 * shading with no color, smooth seamless loop, no shadow gradient on the
 * background."
 */
const SHOE_VIDEO_SRC = "/shoe/shoe-turntable.mp4";

/** Below this on every channel, a pixel counts as the clip's background rather than the shoe — see the generation spec above for why the source needs to be genuinely black, not just dark, for this to hold a clean edge. */
const CHROMA_KEY_THRESHOLD = 32;
const TURNTABLE_FRAME_INTERVAL_MS = 1000 / 30;

/**
 * Live chroma-key + retint of `SHOE_VIDEO_SRC`, played at the athlete's
 * chosen colour. Canvas 2D's own `globalCompositeOperation = "color"`
 * already implements the same W3C blend used by the CSS fallback's
 * `mix-blend-mode: color` — the one part that has no native operation is
 * removing the clip's black backdrop, which is why this still needs one
 * manual pixel pass per frame (`chromaKey`) rather than being pure
 * composite-mode plumbing:
 *
 * 1. Draw the video frame onto an offscreen canvas, then zero the alpha of
 *    every near-black pixel — what's left is the shoe's real silhouette
 *    for *this* frame, background truly transparent.
 * 2. Draw that onto the visible canvas, blend-fill it with the athlete's
 *    colour ("color" mode) — this is correct wherever the offscreen layer
 *    already has coverage, but a flat blend-mode fill still paints solid
 *    colour into the *transparent* area too (per spec, blending only
 *    applies where backdrop alpha is non-zero; zero-alpha backdrop just
 *    passes the source through untouched).
 * 3. `destination-in` the offscreen layer back on top: keeps only the
 *    pixels that overlap its silhouette, discarding the colour that leaked
 *    outside it in step 2.
 *
 * Always renders its canvas — visibility (and swapping the CSS fallback
 * out) is the parent's call (`ShoeShowcase`, via `onReady`/`onFailed`), so
 * this component only has to report what happened, never decide what's on
 * screen because of it.
 */
function ShoeTurntable({
  color,
  onReady,
  onFailed,
}: {
  color: string;
  onReady: () => void;
  onFailed: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let raf: number | null = null;
    let lastDrawnAt = 0;

    const video = document.createElement("video");
    video.src = SHOE_VIDEO_SRC;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";

    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      onFailed();
    };

    video.addEventListener("loadedmetadata", () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas || !video.videoWidth || !video.videoHeight) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const mask = document.createElement("canvas");
      mask.width = video.videoWidth;
      mask.height = video.videoHeight;
      maskCanvasRef.current = mask;
    });

    video.addEventListener("loadeddata", () => {
      if (cancelled) return;
      video.play().catch(fail);
    });

    video.addEventListener("playing", () => {
      if (cancelled) return;
      onReady();
    });

    video.addEventListener("error", fail);

    const step = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(step);
      if (now - lastDrawnAt < TURNTABLE_FRAME_INTERVAL_MS) return;
      lastDrawnAt = now;

      const canvas = canvasRef.current;
      const mask = maskCanvasRef.current;
      const maskCtx = mask?.getContext("2d", { willReadFrequently: true });
      const ctx = canvas?.getContext("2d");
      if (!canvas || !mask || !maskCtx || !ctx || video.readyState < 2) return;

      // Step 1: this frame's shoe silhouette, background truly transparent.
      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.clearRect(0, 0, mask.width, mask.height);
      maskCtx.drawImage(video, 0, 0, mask.width, mask.height);
      const frame = maskCtx.getImageData(0, 0, mask.width, mask.height);
      const data = frame.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < CHROMA_KEY_THRESHOLD && data[i + 1] < CHROMA_KEY_THRESHOLD && data[i + 2] < CHROMA_KEY_THRESHOLD) {
          data[i + 3] = 0;
        }
      }
      maskCtx.putImageData(frame, 0, 0);

      // Steps 2-3: tint, then re-clip to the silhouette to drop the leak.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    // `onReady`/`onFailed` are stable setters from the parent (see
    // ShoeShowcase) — not a real dependency of "which clip is playing".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  return <canvas ref={canvasRef} className="block h-auto w-full" aria-hidden="true" />;
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
  const reducedMotion = usePrefersReducedMotion();
  const [turntableReady, setTurntableReady] = useState(false);
  const [turntableFailed, setTurntableFailed] = useState(false);
  const attemptTurntable = !reducedMotion && !turntableFailed;
  const showTurntable = attemptTurntable && turntableReady;

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

      {/* Mounted (and left decoding/playing in the background) the moment
          reduced motion allows it, well before it's known to actually work
          — waiting for a "ready" signal to even try would mean the first
          frame is never on screen the instant it's available. It only
          becomes visible once `turntableReady` flips, which is also
          exactly when the photo fallback below unmounts, so there's never
          a frame with both showing or neither showing. */}
      {attemptTurntable && (
        <div className="pr-drift" style={{ display: showTurntable ? undefined : "none" }}>
          <ShoeTurntable
            color={color}
            onReady={() => setTurntableReady(true)}
            onFailed={() => setTurntableFailed(true)}
          />
        </div>
      )}

      {!showTurntable && (
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
      )}
    </div>
  );
}
