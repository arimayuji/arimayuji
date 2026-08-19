"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { checkForUpdate, type UpdateInfo } from "./updateCheck";
import { listFriendConnections, type FriendConnection } from "./friendships";
import { listCoachConnections, type CoachConnection } from "./coachRelationships";

export interface NotificationSummary {
  update: UpdateInfo | null;
  pendingFriendRequests: number;
  pendingCoachInvites: number;
  /** The incoming friend requests themselves — `/notificacoes` needs the real rows (who, when), not just a count. */
  friendRequests: FriendConnection[];
  /** The incoming coach/student invites themselves — same reason as `friendRequests`. */
  coachInvites: CoachConnection[];
}

/**
 * Everything worth surfacing under the bell icon, in one place: a newer
 * build, plus incoming friend/coach requests. Both `listFriendConnections`
 * and `listCoachConnections` already degrade to `[]` with no Appwrite
 * config or no signed-in account (see their own modules), so this needs no
 * auth check of its own — signed-out just means zero of everything.
 *
 * Re-checks on every route change rather than once per app open: accepting
 * a request on /amigos, or a build finishing its rollout while the app sits
 * open, should clear/update the bell without needing a full reload. The
 * three checks are cheap (one fetch, two small Appwrite queries) — worth
 * paying on navigation for a badge that's otherwise easy to forget exists.
 */
export function useNotificationSummary(): NotificationSummary {
  const pathname = usePathname();
  const [summary, setSummary] = useState<NotificationSummary>({
    update: null,
    pendingFriendRequests: 0,
    pendingCoachInvites: 0,
    friendRequests: [],
    coachInvites: [],
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      checkForUpdate(),
      listFriendConnections("pending"),
      listCoachConnections("pending"),
    ]).then(([update, friends, coaches]) => {
      if (cancelled) return;
      const friendRequests = friends.filter((c) => c.direction === "incoming");
      const coachInvites = coaches.filter((c) => c.direction === "incoming");
      setSummary({
        update,
        pendingFriendRequests: friendRequests.length,
        pendingCoachInvites: coachInvites.length,
        friendRequests,
        coachInvites,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return summary;
}
