"use client";

import { useEffect, useState } from "react";
import { getGroupRun, listParticipants, type GroupRun, type GroupRunParticipantConnection } from "./groupRuns";

/**
 * Tighter than `useGroupLiveRuns`'s 8s (GROUP_POLL_MS) — a lobby is a
 * short, high-attention wait ("is everyone ready yet?"), not a background
 * live-map glance, and it's only ever open for the seconds-to-minutes a
 * pairing takes to settle, so a shorter interval is cheap.
 */
export const LOBBY_POLL_MS = 4_000;

export interface GroupRunLobbyData {
  groupRun: GroupRun | null;
  participants: GroupRunParticipantConnection[];
}

/**
 * Polls a QR-pairing session's own row + roster while the lobby is open —
 * same visibility-gated setInterval pattern as `useGroupLiveRuns`, just a
 * separate hook rather than reusing it: that one's `GroupLiveData` shape
 * (live GPS rows, staleness threshold) is specific to the live-map screen
 * and irrelevant pre-run, so a dedicated hook is more legible than
 * threading an unused field through it.
 */
export function useGroupRunLobby(sessionCode: string | null, active: boolean): GroupRunLobbyData {
  const [data, setData] = useState<GroupRunLobbyData>({ groupRun: null, participants: [] });

  useEffect(() => {
    if (!sessionCode || !active) return;
    let cancelled = false;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      Promise.all([getGroupRun(sessionCode), listParticipants(sessionCode)]).then(([groupRun, participants]) => {
        if (!cancelled) setData({ groupRun, participants });
      });
    };
    poll();
    const interval = setInterval(poll, LOBBY_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sessionCode, active]);

  return data;
}
