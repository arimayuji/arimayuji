/**
 * Registers this device for native push notifications and hands the token
 * to Appwrite, so the `client-actions` Function can later address "this
 * account" without knowing which device(s) it's on — Appwrite resolves a
 * `users: [userId]` push send to every registered target itself.
 *
 * Requires real console setup this file can't do on its own: an FCM
 * provider (Firebase project + service account) and an APNs provider (the
 * .p8 Auth Key, Team ID, Key ID) configured in Appwrite Console → Messaging
 * → Providers, using the exact IDs in `PROVIDER_ID` below — plus, on iOS,
 * the "Push Notifications" capability enabled on the App ID in
 * developer.apple.com (same place HealthKit's capability was enabled) and
 * present in App.entitlements. Until that's done, `requestPermissions()`
 * still works but `createPushTarget` will fail — caught below like every
 * other best-effort call in this file, so the app runs the same either way.
 */
import { ExecutionMethod, ID } from "appwrite";
import { PushNotifications } from "@capacitor/push-notifications";
import { CLIENT_ACTIONS_FUNCTION_ID, getAppwrite } from "./appwrite";
import { isAndroidPlatform, isIOSPlatform, isNativePlatform } from "./platform";

/** Must match the provider IDs created in Appwrite Console → Messaging → Providers — see this file's own comment. */
const PROVIDER_ID = { android: "fcm", ios: "apns" } as const;

let registered = false;

/**
 * Requests permission and registers this device's push token with
 * Appwrite, tied to the signed-in account. A no-op on web, already
 * registered this session, or if the athlete denies the OS permission
 * prompt — none of those are errors, just states where push isn't
 * available right now. Safe to call every time an account signs in; the
 * `registered` guard just avoids piling up duplicate targets from a
 * component re-rendering.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!isNativePlatform() || registered) return;
  const appwrite = getAppwrite();
  if (!appwrite) return;

  try {
    const permission = await PushNotifications.checkPermissions();
    const granted =
      permission.receive === "granted" ||
      (permission.receive === "prompt" && (await PushNotifications.requestPermissions()).receive === "granted");
    if (!granted) return;

    registered = true; // set before the async register() call, not after — a second sign-in racing this one shouldn't also register.

    const platform = isAndroidPlatform() ? "android" : isIOSPlatform() ? "ios" : null;
    const providerId = platform ? PROVIDER_ID[platform] : null;
    if (!providerId || !platform) return;

    const tokenPromise = new Promise<string>((resolve, reject) => {
      PushNotifications.addListener("registration", (token) => resolve(token.value));
      PushNotifications.addListener("registrationError", (error) =>
        reject(new Error(error.error || "push registration failed")),
      );
    });
    await PushNotifications.register();
    const token = await tokenPromise;

    const targetId = ID.unique();
    await appwrite.account.createPushTarget({ targetId, identifier: token, providerId });

    // Best-effort on top of a best-effort call: subscribes this same target
    // to the "nova versão" broadcast for its platform (see client-actions'
    // subscribeUpdateTopic) — a failure here still leaves the push target
    // itself registered, so milestone notifications keep working either way.
    appwrite.functions
      .createExecution({
        functionId: CLIENT_ACTIONS_FUNCTION_ID,
        method: ExecutionMethod.POST,
        body: JSON.stringify({ action: "subscribe-update-topic", targetId, platform }),
      })
      .catch(() => {});
  } catch {
    // Best-effort, same as every other native-capability call in this app
    // (geolocation, health data, live activities) — a missing provider, a
    // denied permission, or no network shouldn't be treated as a crash.
  }
}

/**
 * Routes a tap on a received push notification somewhere useful, instead
 * of just opening the app to wherever it happened to launch — e.g. the
 * "nova versão" push (android-build.yml's own push step) carries
 * `data: { route: "/download" }`, so tapping it lands the athlete straight
 * on the step-by-step update instructions instead of leaving them to
 * notice the bell icon and find /notificacoes on their own. A no-op on web
 * and for any push with no `route` in its data (friend request/milestone
 * pushes today carry none, and just open the app like before).
 *
 * Mounted once for the app's whole lifetime (see push-registration.tsx),
 * same reasoning as `OAuthCallbackListener`'s long-lived `appUrlOpen`
 * listener — a push can arrive and be tapped at any point, not just while
 * some particular screen happens to be mounted.
 */
export function listenForPushNotificationTaps(): void {
  if (!isNativePlatform()) return;
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const route: unknown = action.notification.data?.route;
    // Full navigation, not router.push() — this fires from outside React's
    // render tree (a tap on a system notification, possibly a cold app
    // launch), same reasoning every other native-event listener here
    // already documents for window.location.assign.
    if (typeof route === "string") window.location.assign(route);
  });
}
