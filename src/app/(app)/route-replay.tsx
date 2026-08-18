"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";

import { formatElapsed } from "@/lib/tracking/geoFilter";
import { buildReplayTimeline, replayCursorAt, type ReplayCursor } from "@/lib/tracking/replay";
import type { StoredPoint } from "@/lib/tracking/storage";
import type { DistanceUnit } from "@/lib/preferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { RouteMap } from "./route-map";

/**
 * The finished route, plus a scrubbable player that rides back over the real
 * trace — play/pause and drag the bar, the same controls a video would have,
 * because that's the mental model this now actually matches.
 *
 * Everything on screen while it plays is measured, not staged: the head sits
 * at whatever point of the run `progress` says, and the readout above it is
 * the distance, elapsed time and rolling pace at exactly that point — so
 * scrubbing is scrubbing through what actually happened, not a canned
 * animation with a seek bar bolted on.
 */

/**
 * How long a full, uninterrupted play-through takes on the wall clock.
 * Scaled by the run's own duration rather than fixed, so a slow kilometre
 * still takes longer to ride than a fast one — same principle `replay.ts`
 * already applies to the head's position.
 */
function playbackMillis(totalSeconds: number): number {
  return Math.min(26000, Math.max(10000, totalSeconds * 12));
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="currentColor">
      <rect x="5.5" y="4.5" width="4.2" height="15" rx="1" />
      <rect x="14.3" y="4.5" width="4.2" height="15" rx="1" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
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
  rounded = true,
}: {
  points: StoredPoint[];
  unit: DistanceUnit;
  className?: string;
  /** False for an edge-to-edge map — RouteMap's own rounded prop already treats this as a deliberate look, not a bug, for the full-bleed live map; same reasoning applies here. */
  rounded?: boolean;
}) {
  const timeline = useMemo(() => buildReplayTimeline(points), [points]);
  const reducedMotion = usePrefersReducedMotion();

  /** 0–1 through the run's own elapsed time — the single source of truth the play loop, the drag handle and the map all read from. */
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** True once the player has ever been touched — keeps the map on the plain top-down finished trace until then, same as before scrubbing existed. */
  const [started, setStarted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /**
   * False until the basemap's own first load attempt has settled (see
   * `onTilesSettled` on `RouteMap`). The chase camera and the finished-trace
   * overview share the exact same map instance, so tiles are already
   * loading well before anyone taps play — but nothing used to stop that tap
   * from landing mid-load (or after a failed load) and starting the replay
   * animation over a blank grey canvas with no explanation. Doesn't block
   * forever: once the basemap gives up retrying, this still flips true, so a
   * genuinely offline map doesn't leave the button stuck.
   */
  const [mapReady, setMapReady] = useState(false);
  const handleTilesSettled = useCallback(() => setMapReady(true), []);

  const animation = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  /** Where playback resumed from, so pressing play again continues from the scrubbed spot instead of restarting at zero. */
  const resumeFrom = useRef({ progress: 0, at: 0 });

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);

  useEffect(() => stopAnimation, [stopAnimation]);

  const seek = useCallback((value: number) => {
    setStarted(true);
    setPlaying(false);
    stopAnimation();
    setProgress(Math.min(1, Math.max(0, value)));
  }, [stopAnimation]);

  const play = useCallback(() => {
    if (!timeline || !mapReady) return;
    setStarted(true);

    if (reducedMotion) {
      setProgress(1);
      return;
    }

    stopAnimation();
    const duration = playbackMillis(timeline.totalSeconds);
    resumeFrom.current = { progress, at: performance.now() };
    setPlaying(true);

    const step = (now: number) => {
      const elapsedFraction = (now - resumeFrom.current.at) / duration;
      const next = Math.min(1, resumeFrom.current.progress + elapsedFraction);
      setProgress(next);
      if (next < 1) {
        animation.current = requestAnimationFrame(step);
      } else {
        animation.current = null;
        setPlaying(false);
      }
    };
    animation.current = requestAnimationFrame(step);
  }, [progress, reducedMotion, stopAnimation, timeline, mapReady]);

  const pause = useCallback(() => {
    stopAnimation();
    setPlaying(false);
  }, [stopAnimation]);

  const progressFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return null;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const handleTrackPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const value = progressFromPointer(event.clientX);
      if (value === null) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      seek(value);
    },
    [progressFromPointer, seek],
  );

  const handleTrackPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      event.stopPropagation();
      const value = progressFromPointer(event.clientX);
      if (value === null) return;
      setProgress(value);
    },
    [progressFromPointer],
  );

  const cursor: ReplayCursor | null = started && timeline ? replayCursorAt(timeline, progress) : null;
  const frame = cursor?.head ?? null;

  const mapContent = (
    <RouteMap
      points={points}
      replay={cursor}
      onTilesSettled={handleTilesSettled}
      className={fullscreen ? "h-full w-full !rounded-none" : className}
      rounded={fullscreen ? false : rounded}
      square={!fullscreen}
    >
      {frame && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-4 bg-gradient-to-b from-black/75 via-black/45 to-transparent pl-14 pr-4 pb-8"
            style={{ paddingTop: fullscreen ? "calc(0.75rem + env(safe-area-inset-top))" : "0.75rem" }}
          >
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

        {/*
          `top`/`bottom` set via style, not Tailwind's `top-3`/`bottom-3`:
          only in `fullscreen` (portalled `fixed inset-0`, real screen edges)
          does this need to clear the OS status/gesture bars — the embedded
          card view sits mid-page, where `env(safe-area-inset-*)` would still
          report the same device-wide inset and wrongly pad it too.
        */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setFullscreen((value) => !value);
          }}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          className="absolute left-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:scale-95"
          style={{ top: fullscreen ? "calc(0.75rem + env(safe-area-inset-top))" : "0.75rem" }}
        >
          {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
        </button>

        {timeline && (
          <>
            <button
              type="button"
              disabled={!mapReady}
              onClick={(event) => {
                event.stopPropagation();
                if (playing) pause();
                else play();
              }}
              className="absolute right-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm active:scale-95 disabled:opacity-60"
              style={{ top: fullscreen ? "calc(0.75rem + env(safe-area-inset-top))" : "0.75rem" }}
            >
              {mapReady ? (playing ? <PauseIcon /> : <PlayIcon />) : null}
              {!mapReady ? "Carregando mapa…" : playing ? "Pausar" : started ? "Continuar" : "Replay"}
            </button>

            {/*
              Generous vertical hit target around a thin visual track — a
              video scrubber sized for a thumb, not a mouse pointer. Left
              edge stops short of the full width: MapTiler's own attribution
              control lives bottom-left (their ToS requires it stay visible),
              and a full-bleed bar would sit right on top of it, both
              visually and for touches.
            */}
            <div
              ref={trackRef}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={handleTrackPointerDown}
              onPointerMove={handleTrackPointerMove}
              className="absolute right-3 left-16 flex h-8 cursor-pointer touch-none items-center"
              style={{ bottom: fullscreen ? "calc(0.75rem + env(safe-area-inset-bottom))" : "0.75rem" }}
            >
              <div className="relative h-1 w-full rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${progress * 100}%` }}
                />
                <div
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(0,0,0,0.35)]"
                  style={{ left: `${progress * 100}%` }}
                />
              </div>
            </div>
          </>
        )}
    </RouteMap>
  );

  if (fullscreen) {
    // Portalled straight onto <body>, not just given `position: fixed` in
    // place: an animated ancestor up the tree (`.pr-enter`, used all over
    // this screen) keeps a CSS transform attached even after the animation
    // finishes, which makes *it* the containing block instead of the
    // viewport — `inset-0` then resolves against that ancestor's own box
    // rather than the screen, and the whole thing collapses to zero height.
    // A portal renders into `document.body`, outside that ancestor
    // entirely, so `fixed inset-0` means what it says.
    return createPortal(
      <div className="fixed inset-0 z-50 bg-background" onClick={() => setFullscreen(false)}>
        {mapContent}
      </div>,
      document.body,
    );
  }

  return (
    <div className="relative" onClick={() => setFullscreen(true)}>
      {mapContent}
    </div>
  );
}
