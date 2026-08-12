"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isConnected } from "./auth";
import { getCurrentlyPlaying } from "./api";
import type { RunTrack } from "../tracking/storage";

const POLL_INTERVAL_MS = 20_000;

/**
 * Collects the distinct tracks that played while `active` is true (the run is
 * being recorded). Entirely optional: if Spotify was never connected, this
 * polls nothing and returns an empty list — the run works exactly the same
 * either way.
 *
 * The caller is responsible for calling `reset()` when a *new* run starts
 * (right where it calls `start()`) — that's a plain event handler, not an
 * effect, which is what keeps a pause/resume cycle (active flips false→true
 * without a new run) from wiping tracks already collected.
 */
export function useNowPlayingDuringRun(active: boolean) {
  const [tracks, setTracks] = useState<RunTrack[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  const tracksRef = useRef<RunTrack[]>([]);

  useEffect(() => {
    if (!active || !isConnected()) return;

    let cancelled = false;

    const poll = async () => {
      const playing = await getCurrentlyPlaying();
      if (cancelled || !playing || !playing.isPlaying) return;

      const key = `${playing.name}::${playing.artist}`;
      if (key === lastKeyRef.current) return; // still the same track, nothing to add
      lastKeyRef.current = key;

      const next = [...tracksRef.current, { name: playing.name, artist: playing.artist, playedAt: Date.now() }];
      tracksRef.current = next;
      setTracks(next);
    };

    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active]);

  const reset = useCallback(() => {
    tracksRef.current = [];
    lastKeyRef.current = null;
    setTracks([]);
  }, []);

  return { tracks, reset };
}
