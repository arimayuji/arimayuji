"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import {
  SHARE_CARD_DURATION_MS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  shareCardHitBoxes,
  drawShareCardFrame,
  type ShareCardHitBox,
  type ShareCardLayoutOverrides,
  type ShareCardScene,
} from "@/lib/shareCard/renderer";

const PREVIEW_FRAME_INTERVAL_MS = 1000 / 30;

/**
 * A direct drag/tap area sitting right over one element's actual footprint
 * (default box + whatever offset is already applied) — never rendered into
 * the exported card/video, and never a separate floating handle icon
 * either. An earlier version drew a small circle with a 4-arrow "move"
 * glyph next to each element; a real athlete testing it on their own phone
 * called it out as reading like a game joystick rather than part of the
 * card (2026-08-29) — touching the number/medal/route itself, with no
 * extra icon standing in for it, is the direct fix. Reports drag deltas in
 * *canvas* units (the same 720×1280 space `drawShareCardFrame` draws
 * into), converted from screen pixels via the canvas's own current
 * bounding rect — this works regardless of how big the canvas is actually
 * rendered on screen (phone vs. desktop, `w-full` scaling it either way),
 * since the rect is re-measured on every drag start rather than cached.
 */
function DragArea({
  canvasRef,
  box,
  offset,
  label,
  onChange,
  onRemove,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  box: ShareCardHitBox;
  offset: { dx: number; dy: number };
  label: string;
  onChange: (offset: { dx: number; dy: number }) => void;
  /** Every draggable element on the card can be removed now — omit this prop only for an area that genuinely has no hide affordance. */
  onRemove?: () => void;
}) {
  const dragRef = useRef<{ pointerId: number; startOffset: { dx: number; dy: number }; startX: number; startY: number; unitsPerPxX: number; unitsPerPxY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
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
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  const left = box.x + offset.dx;
  const top = box.y + offset.dy;
  const leftPct = `${(left / SHARE_CARD_WIDTH) * 100}%`;
  const topPct = `${(top / SHARE_CARD_HEIGHT) * 100}%`;
  const widthPct = `${(box.width / SHARE_CARD_WIDTH) * 100}%`;
  const heightPct = `${(box.height / SHARE_CARD_HEIGHT) * 100}%`;

  return (
    <>
      <button
        type="button"
        aria-label={`Arrastar ${label.toLowerCase()}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // A faint dashed outline at rest — enough to hint "this has a
        // boundary" without reading as a control widget sitting on top of
        // the card; brightens while actually held so a drag in progress is
        // still obvious feedback.
        className={`absolute touch-none rounded-2xl border transition-colors ${
          dragging ? "border-white/70 bg-white/10" : "border-dashed border-white/20"
        }`}
        style={{ left: leftPct, top: topPct, width: widthPct, height: heightPct }}
      />
      {onRemove && (
        <button
          type="button"
          aria-label={`Remover ${label.toLowerCase()}`}
          onClick={onRemove}
          // Sits at the drag area's own top-right corner rather than a
          // fixed offset from a point — its own separate tap target, drawn
          // after (so it stacks above) the drag area beneath it.
          className="absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-bad text-white shadow active:scale-90"
          style={{ left: `${((left + box.width) / SHARE_CARD_WIDTH) * 100}%`, top: topPct }}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </>
  );
}

/** Stands in for a removed element (see `DragArea`'s own "×" badge) — a fixed corner chip rather than something positioned at the hidden element's old spot, since that spot no longer has anything visually anchoring it once the element is gone. */
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
   * Passing both of these turns on the drag areas below — omit them (as
   * every caller besides the main `/compartilhar` preview does, e.g. the
   * swipeable template thumbnails) and the preview behaves exactly as
   * before, no drag areas, no pointer listeners.
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

  // Used to wait for the full ~15s reveal to finish before showing drag
  // areas (avoiding a visual disagreement between the outline and the
  // still-animating element) — in practice that made the drag feature
  // undiscoverable, since nothing on screen hints that waiting out the
  // whole animation (or tapping the easy-to-miss "Parar" button) unlocks
  // it. Drag areas now show immediately; the brief mismatch during the
  // reveal is a smaller cost than a feature nobody finds.
  const draggable = !!onLayoutOverridesChange;
  const boxes = shareCardHitBoxes(scene);
  const hasPlateAccessory = !!scene.record || !!scene.shoe;
  const statsHidden = !!layoutOverrides?.hidden?.stats;
  const plateHidden = !!layoutOverrides?.hidden?.plate;
  const routeHidden = !!layoutOverrides?.hidden?.route;
  const hasOverride = !!(
    layoutOverrides?.stats ||
    layoutOverrides?.plate ||
    layoutOverrides?.route ||
    statsHidden ||
    plateHidden ||
    routeHidden
  );

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
      {draggable && boxes.route && !routeHidden && (
        <DragArea
          canvasRef={canvasRef}
          box={boxes.route}
          offset={layoutOverrides?.route ?? { dx: 0, dy: 0 }}
          label="rota"
          onChange={(route) => onLayoutOverridesChange({ ...layoutOverrides, route })}
          onRemove={() => onLayoutOverridesChange({ ...layoutOverrides, hidden: { ...layoutOverrides?.hidden, route: true } })}
        />
      )}
      {draggable && boxes.route && routeHidden && (
        <RestoreChip
          label="Mostrar rota"
          className={
            // Stacks below whichever of stats/plate restore chips (each
            // its own 32px-tall slot) are already showing, same left
            // column — never overlapping an already-visible chip.
            (statsHidden ? 1 : 0) + (hasPlateAccessory && plateHidden ? 1 : 0) === 2
              ? "top-19 left-3"
              : (statsHidden ? 1 : 0) + (hasPlateAccessory && plateHidden ? 1 : 0) === 1
                ? "top-11 left-3"
                : "top-3 left-3"
          }
          onClick={() => onLayoutOverridesChange({ ...layoutOverrides, hidden: { ...layoutOverrides?.hidden, route: false } })}
        />
      )}
      {draggable && !statsHidden && (
        <DragArea
          canvasRef={canvasRef}
          box={boxes.stats}
          offset={layoutOverrides?.stats ?? { dx: 0, dy: 0 }}
          label="estatísticas"
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
        <DragArea
          canvasRef={canvasRef}
          box={boxes.plate}
          offset={layoutOverrides?.plate ?? { dx: 0, dy: 0 }}
          label={scene.record ? "medalha" : "tênis"}
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
