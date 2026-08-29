"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import { listenForPushNotificationTaps, registerForPushNotifications } from "@/lib/pushNotifications";

/**
 * Registers this device for push notifications the moment an account signs
 * in — milestone pushes (see src/lib/milestoneNotifications.ts) are sent by
 * user ID, so there's nothing to address until a target exists. Mounted
 * once in layout.tsx, same as `OAuthCallbackListener`; `registerForPushNotifications`
 * itself no-ops on web and guards against registering twice, so this can
 * re-render freely without re-requesting the OS permission prompt.
 *
 * Also arms `listenForPushNotificationTaps` — unlike registration, this
 * doesn't need a signed-in account (a push can be tapped any time this
 * process is alive), so it's a separate, unconditional effect.
 */
export function PushRegistration() {
  const { status } = useAuth();

  useEffect(() => {
    listenForPushNotificationTaps();
  }, []);

  useEffect(() => {
    if (status === "signed-in") void registerForPushNotifications();
  }, [status]);

  return null;
}
