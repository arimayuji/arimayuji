"use client";

/**
 * "Sugestão de correr com amigo por perto" — a one-shot read of the same
 * `friend_presence` data /amigos already polls continuously while that tab
 * is open (see its own `NEARBY_THRESHOLD_METERS`/`PRESENCE_STALE_MS`
 * comments for why those specific numbers), but here for a screen that just
 * wants to know once on mount (namely /run's prep screen — the moment
 * "bora correr junto?" is actually actionable) rather than a live badge.
 *
 * Never a push notification and never continuous tracking — same opt-in
 * (`Profile.nearbyOptIn`, off by default) and same one-shot ping already
 * established by `friend-presence-ping.tsx`; this hook only ever reads
 * whatever the most recent ping already wrote.
 */
import { useEffect, useState } from "react";
import { getCurrentAccount } from "./auth";
import { listFriendConnections } from "./friendships";
import { listFriendsPresence } from "./friendPresence";
import { haversineMeters } from "./tracking/geoFilter";

const PRESENCE_STALE_MS = 15 * 60_000;
const NEARBY_THRESHOLD_METERS = 1000;

export interface NearbyFriend {
  otherId: string;
  displayName: string;
}

export function useNearbyFriends(): NearbyFriend[] {
  const [nearby, setNearby] = useState<NearbyFriend[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const account = await getCurrentAccount();
      if (!account) return;
      const connections = await listFriendConnections("accepted");
      if (cancelled || connections.length === 0) return;

      const rows = await listFriendsPresence([account.id, ...connections.map((c) => c.otherId)]);
      if (cancelled) return;

      const now = Date.now();
      const mine = rows.find((row) => row.$id === account.id);
      if (!mine || now - mine.updatedAtMs > PRESENCE_STALE_MS) return;

      const result: NearbyFriend[] = [];
      for (const connection of connections) {
        const row = rows.find((r) => r.$id === connection.otherId);
        if (!row || now - row.updatedAtMs > PRESENCE_STALE_MS) continue;
        if (haversineMeters(mine, row) > NEARBY_THRESHOLD_METERS) continue;
        result.push({
          otherId: connection.otherId,
          displayName: connection.profile?.displayName || connection.profile?.handle || "Um amigo",
        });
      }
      if (!cancelled) setNearby(result);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return nearby;
}
