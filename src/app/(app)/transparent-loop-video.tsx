"use client";

import { useEffect, useRef } from "react";

/**
 * Distance (0-255 color space) below which a pixel counts as pure clip
 * background (fully transparent) and above which it counts as real
 * artwork (fully opaque) — the gap between the two is a soft ramp so
 * anti-aliased edges keep their falloff instead of getting a hard,
 * jagged cutout. Tuned against `running-loop(.dark).mp4`'s actual pixels
 * (background stays within ~2 units of its reference color across every
 * frame; the closest artwork shading sits ~90+ units away), not a
 * generic guess.
 */
const KEY_LOW = 18;
const KEY_HIGH = 55;
const KEY_RANGE = KEY_HIGH - KEY_LOW;

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Plays a looping clip that was rendered with a solid-color background —
 * H.264 (the only video codec guaranteed to decode identically in the
 * Android WebView, iOS WKWebView, and every desktop browser this app
 * targets) can't carry an alpha channel, and the alternative of shipping
 * WebM/VP9-with-alpha falls apart on iOS, where Safari-based WebViews
 * don't play WebM at all. So instead of trusting the codec, this draws
 * every decoded frame onto a canvas and keys the background out itself:
 * a real color-distance cutout, not a CSS trick — `mix-blend-mode`
 * looked right in desktop Chrome but left a visible mismatched box
 * behind the runners on a real Android build (WebViews don't reliably
 * apply blend modes to `<video>`), which is what this replaces. The
 * result is genuinely transparent regardless of what's actually behind
 * it, so the clip's baked-in background no longer has to stay in exact
 * lockstep with whatever the page's `--background` token happens to be.
 */
export function TransparentLoopVideo({
  src,
  bgColor,
  size = 360,
  className,
}: {
  src: string;
  /** [r, g, b] sampled from the clip's own baked-in background, not read from CSS. */
  bgColor: readonly [number, number, number];
  /** Native pixel resolution to key at — matches the source clip's own resolution by default, since upsampling it here wouldn't add real detail. */
  size?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current as RvfcVideo | null;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;

    const [br, bg, bb] = bgColor;
    let cancelled = false;
    let rafHandle = 0;
    let rvfcHandle = 0;

    const drawFrame = () => {
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, size, size);
        const frame = ctx.getImageData(0, 0, size, size);
        const data = frame.data;
        for (let i = 0; i < data.length; i += 4) {
          const dr = data[i] - br;
          const dg = data[i + 1] - bg;
          const db = data[i + 2] - bb;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          data[i + 3] =
            dist <= KEY_LOW ? 0 : dist >= KEY_HIGH ? 255 : Math.round((255 * (dist - KEY_LOW)) / KEY_RANGE);
        }
        ctx.putImageData(frame, 0, 0);
      }
    };

    const loop = () => {
      if (cancelled) return;
      drawFrame();
      if (video.requestVideoFrameCallback) {
        rvfcHandle = video.requestVideoFrameCallback(loop);
      } else {
        rafHandle = requestAnimationFrame(loop);
      }
    };

    void video.play().catch(() => {});
    loop();

    return () => {
      cancelled = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      if (rvfcHandle && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(rvfcHandle);
    };
  }, [src, bgColor, size]);

  return (
    <div className={`relative ${className ?? ""}`}>
      {/*
       * `opacity-0` rather than visually-hidden/1px-clipped — real layout
       * size at 0 opacity, not `display:none` or a 1px clip, is what keeps
       * mobile Safari from treating this as an offscreen video and pausing
       * its decode to save power (a real risk with the usual
       * screen-reader-only hide pattern here, since this video is never
       * meant to be seen at all, only decoded).
       */}
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full opacity-0"
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
    </div>
  );
}
