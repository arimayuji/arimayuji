"use client";

import { useCallback, useRef } from "react";

/**
 * Pill-track slider with a wide rounded-rectangle thumb and tick dots along
 * the trail — built from plain pointer/keyboard events, not a styled native
 * `<input type="range">` (that approach's thumb is a fixed-shape pseudo
 * element; there's no way to make it a sliding pill without fighting the
 * browser) and not a component-library import (no new dependency for one
 * control). `role="slider"` plus arrow/home/end keys keep it keyboard- and
 * screen-reader-operable without the native element's behavior for free.
 *
 * Its own file, not folded into ui.tsx: this needs "use client" for the
 * pointer handlers, and ui.tsx is imported by /estudos, which is
 * deliberately a server component with zero client JS — marking ui.tsx
 * client-only would have dragged that page's JS budget along with it.
 */
export function PillSlider({
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
  tickCount = 6,
  className = "",
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  /** Purely decorative reference marks along the trail — not tied to `step`, which would be too dense to read as dots. */
  tickCount?: number;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const THUMB_WIDTH_PERCENT = 24;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      const snapped = Math.round(raw / step) * step;
      onChange(Math.min(max, Math.max(min, snapped)));
    },
    [min, max, step, onChange],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    setFromClientX(e.clientX);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const bigStep = step * 4;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(max, value + step));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(min, value - step));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      onChange(Math.min(max, value + bigStep));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      onChange(Math.max(min, value - bigStep));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(max);
    }
  };

  const ratio = (value - min) / (max - min);
  const thumbLeftPercent = ratio * (100 - THUMB_WIDTH_PERCENT);
  const ticks = Array.from({ length: tickCount }, (_, i) => (i / (tickCount - 1)) * 100);

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={formatValue(value)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
      className={`relative h-11 w-full cursor-pointer touch-none rounded-full bg-border/70 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
        {ticks.map((t) => (
          <span key={t} className="h-1 w-1 shrink-0 rounded-full bg-foreground/20" />
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-y-1 flex w-[24%] items-center justify-center rounded-full bg-background font-mono text-xs font-semibold shadow-md transition-[left] duration-100 ease-out"
        style={{ left: `${thumbLeftPercent}%` }}
      >
        {formatValue(value)}
      </div>
    </div>
  );
}
