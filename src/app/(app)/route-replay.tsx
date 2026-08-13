"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";

import { formatElapsed } from "@/lib/tracking/geoFilter";
import { buildReplayTimeline, replayCursorAt, type ReplayCursor } from "@/lib/tracking/replay";
import type { StoredPoint } from "@/lib/tracking/storage";
import type { DistanceUnit } from "@/lib/preferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { RouteMap } from "./route-map";

/**
 * The finished route, plus a button that plays it back over the real trace.
 *
 * Everything on screen while it runs is measured, not staged: the head moves
 * on the run's own clock (see replay.ts), and the readout above it is the
 * distance, elapsed time and rolling pace at exactly that point of the run —
 * so watching the numbers change is watching what actually happened, not a
 * count-up animation dressed as one.
 */

/**
 * How long the playback takes on the wall clock. Tuned for the chase camera,
 * not the old top-down view: watching a line trace itself out reads fine at
 * a few seconds flat, but *riding along* a whole run in under 5 seconds — the
 * previous 4500–9000ms range, which a 15-minute run hit the floor of just as
 * hard as a 5-minute one — plays like the camera teleporting, not running.
 * Scaling by real time instead keeps the sense of pace: a slow kilometre
 * still takes longer to ride than a fast one, same principle `replay.ts`
 * already applies to the head's position.
 */
function playbackMillis(totalSeconds: number): number {
  return Math.min(26000, Math.max(10000, totalSeconds * 12));
}

/** The finished trace comes back this long after the head lands, so the last frame is readable before the map returns to normal. */
const HOLD_MILLIS = 1400;

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function Readout({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] uppercase tracking-[0.12em] text-white/55">{label}</span>
      <p className="font-mono text-base leading-tight tabular-nums text-white">
        {value}
        {unit && <span className="ml-1 text-[10px] text-white/60">{unit}</span>}
      </p>
    </div>
  );
}

export function RouteReplay({
  points,
  unit,
  className = "",
}: {
  points: StoredPoint[];
  unit: DistanceUnit;
  className?: string;
}) {
  const timeline = useMemo(() => buildReplayTimeline(points), [points]);
  const reducedMotion = usePrefersReducedMotion();
  const [cursor, setCursor] = useState<ReplayCursor | null>(null);
  const animation = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    animation.current = null;
    holdTimer.current = null;
    setCursor(null);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(() => {
    if (!timeline) return;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;

    if (reducedMotion) {
      setCursor(replayCursorAt(timeline, 1));
      return;
    }

    const duration = playbackMillis(timeline.totalSeconds);
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setCursor(replayCursorAt(timeline, progress));
      if (progress < 1) {
        animation.current = requestAnimationFrame(step);
        return;
      }
      animation.current = null;
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        setCursor(null);
      }, HOLD_MILLIS);
    };

    animation.current = requestAnimationFrame(step);
  }, [reducedMotion, timeline]);

  const frame = cursor?.head ?? null;
  const playing = cursor !== null;
  const progress = frame && timeline ? frame.seconds / timeline.totalSeconds : 0;

  return (
    <RouteMap points={points} replay={cursor} className={className}>
      {frame && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-4 bg-gradient-to-b from-black/75 via-black/45 to-transparent px-4 pt-3 pb-8">
          <Readout label="Distância" value={formatDistance(frame.meters, unit)} unit={unitLabel(unit)} />
          <Readout label="Tempo" value={formatElapsed(Math.round(frame.seconds))} />
          {/* "agora", not the run's average: this is the rolling pace at the head, which is what makes a surge visible as it happens. */}
          <Readout
            label="Ritmo agora"
            value={formatAveragePace(frame.windowMeters, frame.windowSeconds, unit)}
            unit={paceLabel(unit)}
          />
        </div>
      )}

      {timeline && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
            <div
              className="h-full bg-accent"
              style={{ width: `${progress * 100}%`, opacity: playing ? 1 : 0 }}
            />
          </div>

          <button
            type="button"
            onClick={playing ? stop : play}
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm active:scale-95"
          >
            {playing ? <StopIcon /> : <PlayIcon />}
            {playing ? "Parar" : "Replay"}
          </button>
        </>
      )}
    </RouteMap>
  );
}
