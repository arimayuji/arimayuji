"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import {
  SHARE_CARD_DURATION_MS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  defaultLayoutAnchors,
  drawShareCardFrame,
  type ShareCardLayoutOverrides,
  type ShareCardScene,
} from "@/lib/shareCard/renderer";

const PREVIEW_FRAME_INTERVAL_MS = 1000 / 30;

/**
 * One draggable handle over the live preview — a plain circle sitting at
 * the element's current position (default anchor + whatever offset is
 * already applied), never rendered into the actual card/video. Reports
 * drag deltas in *canvas* units (the same 720×1280 space `drawShareCardFrame`
 * draws into), converted from screen pixels via the canvas's own current
 * bounding rect — this works regardless of how big the canvas is actually
 * rendered on screen (phone vs. desktop, `w-full` scaling it either way),
 * since the rect is re-measured on every drag start rather than cached.
 */
function LayoutHandle({
  canvasRef,
  anchor,
  offset,
  label,
  onChange,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  anchor: { x: number; y: number };
  offset: { dx: number; dy: number };
  label: string;
  onChange: (offset: { dx: number; dy: number }) => void;
}) {
  const dragRef = useRef<{ pointerId: number; startOffset: { dx: number; dy: number }; startX: number; startY: number; unitsPerPxX: number; unitsPerPxY: number } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startOffset: offset,
      startX: event.clientX,
      startY: event.clientY,
      unitsPerPxX: SHARE_CARD_WIDTH / rect.width,
      unitsPerPxY: SHARE_CARD_HEIGHT / rect.height,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onChange({
      dx: drag.startOffset.dx + (event.clientX - drag.startX) * drag.unitsPerPxX,
      dy: drag.startOffset.dy + (event.clientY - drag.startY) * drag.unitsPerPxY,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const x = anchor.x + offset.dx;
  const y = anchor.y + offset.dy;

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white/80 bg-black/45 text-white shadow-lg backdrop-blur-sm active:scale-95"
      style={{ left: `${(x / SHARE_CARD_WIDTH) * 100}%`, top: `${(y / SHARE_CARD_HEIGHT) * 100}%` }}
    >
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
      </svg>
    </button>
  );
}

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
  layoutOverrides,
  onLayoutOverridesChange,
}: {
  scene: ShareCardScene;
  durationMs?: number;
  className?: string;
  /**
   * Passing both of these turns on the drag handles below — omit them (as
   * every caller besides the main `/compartilhar` preview does, e.g. the
   * swipeable template thumbnails) and the preview behaves exactly as
   * before, no handles, no pointer listeners.
   */
  layoutOverrides?: ShareCardLayoutOverrides;
  onLayoutOverridesChange?: (next: ShareCardLayoutOverrides) => void;
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

  // Dragging mid-animation would fight the pop-in motion (the handle and
  // the element it's attached to would visibly disagree about where "here"
  // is until the animation settles) — handles only show once the preview
  // has actually finished playing.
  const draggable = !!onLayoutOverridesChange && !playing;
  const anchors = defaultLayoutAnchors(scene.layout);
  const hasPlateAccessory = !!scene.record || !!scene.shoe;
  const hasOverride = !!(layoutOverrides?.stats || layoutOverrides?.plate);

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
      {draggable && (
        <LayoutHandle
          canvasRef={canvasRef}
          anchor={anchors.stats}
          offset={layoutOverrides?.stats ?? { dx: 0, dy: 0 }}
          label="Arrastar estatísticas"
          onChange={(stats) => onLayoutOverridesChange({ ...layoutOverrides, stats })}
        />
      )}
      {draggable && hasPlateAccessory && (
        <LayoutHandle
          canvasRef={canvasRef}
          anchor={anchors.plate}
          offset={layoutOverrides?.plate ?? { dx: 0, dy: 0 }}
          label={scene.record ? "Arrastar medalha" : "Arrastar tênis"}
          onChange={(plate) => onLayoutOverridesChange({ ...layoutOverrides, plate })}
        />
      )}
      {draggable && hasOverride && (
        <button
          type="button"
          onClick={() => onLayoutOverridesChange({})}
          className="absolute top-3 right-3 z-10 rounded-full bg-black/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm active:scale-95"
        >
          Repor posição
        </button>
      )}
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
