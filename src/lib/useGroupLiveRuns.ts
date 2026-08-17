"use client";

import { useEffect, useState } from "react";
import { listSessionLiveRuns, type LiveRun } from "./liveRuns";
import { listParticipants, type GroupRunParticipantConnection } from "./groupRuns";

/** A ping older than this reads as "not really live anymore" — same threshold `/treinador/aluno` already uses for the 1:1 case. */
export const GROUP_LIVE_STALE_MS = 45_000;
const GROUP_POLL_MS = 8_000;

/** One marker `group-live-map.tsx` draws — defined here, not there, so the map component (an app-layer UI piece) depends on this data-fetching module, never the other way around. */
export interface GroupMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
  isMe: boolean;
  stale: boolean;
}

export interface GroupLiveData {
  liveRuns: LiveRun[];
  participants: GroupRunParticipantConnection[];
  now: number;
}

/**
 * Polls a "longão" session's live rows + roster every 8s — a touch more
 * relaxed than the coach's 5s, since a reader here is often also a runner
 * with their own GPS/battery draw already in progress. Paused whenever the
 * tab/screen isn't visible (a folder open behind another app, or the phone
 * locked) rather than burning requests on a screen nobody's looking at,
 * with an immediate catch-up poll the moment it becomes visible again.
 * `active` lets a caller (the /run sheet) stop polling entirely while its
 * own sheet is closed, without unmounting this hook's owner.
 */
export function useGroupLiveRuns(sessionCode: string | null, active: boolean): GroupLiveData {
  const [data, setData] = useState<GroupLiveData>({ liveRuns: [], participants: [], now: 0 });

  useEffect(() => {
    if (!sessionCode || !active) return;
    let cancelled = false;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      Promise.all([listSessionLiveRuns(sessionCode), listParticipants(sessionCode)]).then(([liveRuns, participants]) => {
        if (!cancelled) setData({ liveRuns, participants, now: Date.now() });
      });
    };
    poll();
    const interval = setInterval(poll, GROUP_POLL_MS);
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

/** First name only — the pill on the map has no room for a full display name, same reasoning `route-map.tsx`'s labels stay short. */
function firstName(displayName: string | undefined): string {
  return displayName?.trim().split(/\s+/)[0] || "Corredor(a)";
}

/** Joins the two polled lists into what `GroupLiveMap` actually draws — one marker per athlete currently visible to me (row permissions already did that filtering server-side), positioned and labeled from the roster's resolved profile. */
export function buildGroupMarkers(data: GroupLiveData, myUserId: string | null): GroupMarker[] {
  const profileByUserId = new Map(data.participants.map((p) => [p.participant.userId, p.profile]));
  return data.liveRuns.map((run) => ({
    id: run.userId,
    lat: run.lat,
    lon: run.lon,
    label: firstName(profileByUserId.get(run.userId)?.displayName),
    isMe: run.userId === myUserId,
    stale: data.now - run.updatedAtMs > GROUP_LIVE_STALE_MS,
  }));
}
