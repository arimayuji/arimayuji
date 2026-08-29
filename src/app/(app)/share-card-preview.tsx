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
  onRemove,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  anchor: { x: number; y: number };
  offset: { dx: number; dy: number };
  label: string;
  onChange: (offset: { dx: number; dy: number }) => void;
  /** Every element on the card is optional, not just draggable — this removes it from the render entirely. See the small "×" badge below, and the restore chip `ShareCardPreview` shows in its place once hidden. */
  onRemove: () => void;
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
  const leftPct = `${(x / SHARE_CARD_WIDTH) * 100}%`;
  const topPct = `${(y / SHARE_CARD_HEIGHT) * 100}%`;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // 48px hit target (was 36px) — a real thumb on a real phone kept
        // missing the smaller circle, which read as "dragging doesn't work"
        // when it was actually just missing the touch. Grows slightly on
        // grab (active:scale-110) rather than shrinking like a normal button
        // press, so picking it up reads as "you're now holding this," not
        // "you tapped a button."
        className="absolute z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white/80 bg-black/45 text-white shadow-lg backdrop-blur-sm active:scale-110"
        style={{ left: leftPct, top: topPct }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={`Remover ${label.replace(/^Arrastar /i, "").toLowerCase()}`}
        onClick={onRemove}
        // Sits at the drag handle's own anchor, nudged up-right by a fixed
        // 22px so it never overlaps the 48px drag hit-area beneath it —
        // its own separate tap target, not part of the drag gesture.
        className="absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-bad text-white shadow active:scale-90"
        style={{ left: leftPct, top: topPct, marginLeft: 22, marginTop: -22 }}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </>
  );
}

/** Stands in for a removed element (see `LayoutHandle`'s own "×" badge) — a fixed corner chip rather than something positioned at the hidden element's old spot, since that spot no longer has anything visually anchoring it once the element is gone. */
function RestoreChip({ label, className, onClick }: { label: string; className: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute z-10 rounded-full bg-black/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm active:scale-95 ${className}`}
    >
      {label}
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

  // Used to wait for the full ~15s reveal to finish before showing handles
  // (avoiding a visual disagreement between the handle and the still-animating
  // element) — in practice that made the drag feature undiscoverable, since
  // nothing on screen hints that waiting out the whole animation (or tapping
  // the easy-to-miss "Parar" button) unlocks it. Handles now show immediately;
  // the brief mismatch during the reveal is a smaller cost than a feature
  // nobody finds.
  const draggable = !!onLayoutOverridesChange;
  const anchors = defaultLayoutAnchors(scene.layout);
  const hasPlateAccessory = !!scene.record || !!scene.shoe;
  const statsHidden = !!layoutOverrides?.hidden?.stats;
  const plateHidden = !!layoutOverrides?.hidden?.plate;
  const hasOverride = !!(layoutOverrides?.stats || layoutOverrides?.plate || statsHidden || plateHidden);

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
      {draggable && !statsHidden && (
        <LayoutHandle
          canvasRef={canvasRef}
          anchor={anchors.stats}
          offset={layoutOverrides?.stats ?? { dx: 0, dy: 0 }}
          label="Arrastar estatísticas"
          onChange={(stats) => onLayoutOverridesChange({ ...layoutOverrides, stats })}
          onRemove={() => onLayoutOverridesChange({ ...layoutOverrides, hidden: { ...layoutOverrides?.hidden, stats: true } })}
        />
      )}
      {draggable && statsHidden && (
        <RestoreChip
          label="Mostrar estatísticas"
          className="top-3 left-3"
          onClick={() => onLayoutOverridesChange({ ...layoutOverrides, hidden: { ...layoutOverrides?.hidden, stats: false } })}
        />
      )}
      {draggable && hasPlateAccessory && !plateHidden && (
        <LayoutHandle
          canvasRef={canvasRef}
          anchor={anchors.plate}
          offset={layoutOverrides?.plate ?? { dx: 0, dy: 0 }}
          label={scene.record ? "Arrastar medalha" : "Arrastar tênis"}
          onChange={(plate) => onLayoutOverridesChange({ ...layoutOverrides, plate })}
          onRemove={() => onLayoutOverridesChange({ ...layoutOverrides, hidden: { ...layoutOverrides?.hidden, plate: true } })}
        />
      )}
      {draggable && hasPlateAccessory && plateHidden && (
        <RestoreChip
          label={scene.record ? "Mostrar medalha" : "Mostrar tênis"}
          className={statsHidden ? "top-11 left-3" : "top-3 left-3"}
          onClick={() => onLayoutOverridesChange({ ...layoutOverrides, hidden: { ...layoutOverrides?.hidden, plate: false } })}
        />
      )}
      {draggable && hasOverride && (
        <button
          type="button"
          onClick={() => onLayoutOverridesChange({})}
          className="absolute top-3 right-3 z-10 rounded-full bg-black/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm active:scale-95"
        >
          Repor tudo
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
