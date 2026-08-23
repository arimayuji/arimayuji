"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import {
  SHARE_CARD_DURATION_MS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  drawShareCardFrame,
  type ShareCardScene,
} from "@/lib/shareCard/renderer";

const PREVIEW_FRAME_INTERVAL_MS = 1000 / 30;

/**
 * The real card, on screen, drawn by the same routine that gets recorded — so
 * what a runner watches here is frame-for-frame what lands in the file, not a
 * separate CSS approximation of it that can drift.
 *
 * It plays once and stops rather than looping: this is a preview of an
 * artifact, not an ambient animation, and a 9:16 canvas repainting forever
 * costs battery on the phone that just finished a run.
 */
export function ShareCardPreview({
  scene,
  durationMs = SHARE_CARD_DURATION_MS,
  className = "",
}: {
  scene: ShareCardScene;
  durationMs?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    if (reducedMotion) {
      drawShareCardFrame(context, scene, durationMs, durationMs);
      return;
    }

    const startedAt = performance.now();
    let lastDrawnAt = -Infinity;
    const step = (now: number) => {
      const elapsed = Math.min(now - startedAt, durationMs);
      const done = elapsed >= durationMs;
      // The full frame — scenario art, route trace, plate facets, gradients —
      // is too much canvas work to redraw at 60fps on a real phone (the
      // route-drawing reveal visibly stutters). This is a preview, not the
      // recorded video, so capping it to ~30fps halves the cost with no
      // perceptible smoothness loss; the recording path still samples the
      // real elapsed time every rAF tick, so it isn't affected.
      if (done || now - lastDrawnAt >= PREVIEW_FRAME_INTERVAL_MS) {
        lastDrawnAt = now;
        drawShareCardFrame(context, scene, elapsed, durationMs);
      }
      if (!done) {
        setPlaying(true);
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      frameRef.current = null;
      setPlaying(false);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [reducedMotion, scene, durationMs]);

  useEffect(() => {
    play();
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [play]);

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-border ${className}`}>
      <canvas
        ref={canvasRef}
        width={SHARE_CARD_WIDTH}
        height={SHARE_CARD_HEIGHT}
        className="block h-auto w-full"
        role="img"
        aria-label={`Card da corrida de ${scene.distance} ${scene.distanceUnit} em ${scene.duration}, ritmo ${scene.pace} por ${scene.distanceUnit}`}
      />
      {!reducedMotion && (
        <button
          type="button"
          onClick={playing ? stop : play}
          className="absolute right-3 bottom-3 rounded-full bg-black/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm active:scale-95"
        >
          {playing ? "Parar" : "Rever"}
        </button>
      )}
    </div>
  );
}
