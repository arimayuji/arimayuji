"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import { registerForPushNotifications } from "@/lib/pushNotifications";

/**
 * Registers this device for push notifications the moment an account signs
 * in — milestone pushes (see src/lib/milestoneNotifications.ts) are sent by
 * user ID, so there's nothing to address until a target exists. Mounted
 * once in layout.tsx, same as `OAuthCallbackListener`; `registerForPushNotifications`
 * itself no-ops on web and guards against registering twice, so this can
 * re-render freely without re-requesting the OS permission prompt.
 */
export function PushRegistration() {
  const { status } = useAuth();

  useEffect(() => {
    if (status === "signed-in") void registerForPushNotifications();
  }, [status]);

  return null;
}
