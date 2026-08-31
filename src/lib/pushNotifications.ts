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
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { CLIENT_ACTIONS_FUNCTION_ID, getAppwrite } from "./appwrite";
import { isAndroidPlatform, isIOSPlatform, isNativePlatform } from "./platform";

/** Must match the provider IDs created in Appwrite Console → Messaging → Providers — see this file's own comment. */
const PROVIDER_ID = { android: "fcm", ios: "apns" } as const;

/**
 * Persisted (not just in-memory) so re-registering after a cold start
 * updates the *same* Appwrite push target instead of minting a new one
 * with a fresh `ID.unique()` every time — FCM tokens rotate periodically,
 * so without this, every device accumulates one stale/expired target per
 * rotation, none of which Appwrite ever removes on its own. A push aimed
 * at `users: [userId]` tries every target on file, so a single expired one
 * sitting alongside the current, valid one is enough to flip the whole
 * message's status to "failed" in the Console even when the live device
 * actually received it — this is real production behavior found by
 * inspecting Appwrite's own message/target history (2026-08-31), not a
 * guess: one account had 2-3 different fcm targets over 5 days, and every
 * push sent to it after the first rotation reported "failed" alongside a
 * `deliveredTotal` that proved at least one target *did* get it.
 */
const TARGET_ID_STORAGE_KEY = "xanthus:push-target-id";

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
    if (!granted) {
      console.warn("[push] permission not granted:", permission.receive);
      return;
    }

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

    // Reuse the target from a previous registration on this device instead
    // of always minting a new one (see TARGET_ID_STORAGE_KEY's comment) —
    // falls back to creating fresh if there's no stored id yet, or if the
    // stored one was deleted server-side (account switch, admin cleanup,
    // Appwrite itself pruning a long-expired target).
    const storedTargetId = localStorage.getItem(TARGET_ID_STORAGE_KEY);
    let targetId = storedTargetId;
    if (storedTargetId) {
      try {
        await appwrite.account.updatePushTarget({ targetId: storedTargetId, identifier: token });
      } catch {
        targetId = null;
      }
    }
    if (!targetId) {
      targetId = ID.unique();
      await appwrite.account.createPushTarget({ targetId, identifier: token, providerId });
      localStorage.setItem(TARGET_ID_STORAGE_KEY, targetId);
    }

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
      .catch((error) => console.error("[push] subscribe-update-topic failed:", error));
  } catch (error) {
    // Best-effort, same as every other native-capability call in this app
    // (geolocation, health data, live activities) — a missing provider, a
    // denied permission, or no network shouldn't be treated as a crash. But
    // silent here is exactly what hid the friendships/coach_relationships
    // and live_runs permission bugs for weeks — log it so a real device's
    // `adb logcat`/Console.app can actually say which step failed
    // (registrationError from the OS, or createPushTarget rejecting).
    registered = false; // let a later sign-in retry instead of getting stuck on a failed attempt forever.
    console.error("[push] registerForPushNotifications failed:", error);
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
function navigateToRoute(data: Record<string, unknown> | undefined): void {
  const route = data?.route;
  // Full navigation, not router.push() — this fires from outside React's
  // render tree (a tap on a system notification, possibly a cold app
  // launch), same reasoning every other native-event listener here
  // already documents for window.location.assign.
  if (typeof route === "string") window.location.assign(route);
}

export function listenForPushNotificationTaps(): void {
  if (!isNativePlatform()) return;
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    navigateToRoute(action.notification.data);
  });
}

/**
 * Surfaces a push as a visible system notification while the app is open —
 * without this, a push that arrives with the app in the foreground is
 * silently dropped. `pushNotificationReceived` is the well-documented FCM/
 * APNs foreground gap: the OS shows the banner itself automatically when
 * the app is backgrounded or closed, but hands the message to the app's own
 * JS instead when it's already on screen, on the assumption the app will
 * decide what to do with it. This is exactly what happened chasing the
 * "friend request never showed up as a notification" report (2026-08-31):
 * Appwrite/FCM reported clean delivery (`status: sent`, no errors) for that
 * exact push, but nothing displayed it, because nothing here ever did.
 *
 * `pushNotificationReceived` itself only fires in that foreground case (the
 * backgrounded path never reaches the app's JS at all until the user taps
 * it, which is `pushNotificationActionPerformed` above) — so there's no
 * risk of this duplicating the OS's own banner.
 */
export function listenForForegroundPushNotifications(): void {
  if (!isNativePlatform()) return;
  // Best-effort, same as every other native-permission request in this
  // file — a denial just means this specific fallback doesn't fire; the
  // push itself, and the backgrounded-delivery case, are unaffected.
  void LocalNotifications.requestPermissions().catch(() => {});

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    const { title, body, data } = notification;
    if (!title && !body) return;
    void LocalNotifications.schedule({
      notifications: [
        {
          // Local notification IDs are a 32-bit int, unlike Appwrite's
          // string message IDs — truncate rather than reuse one.
          id: Date.now() % 2147483647,
          title: title ?? "Xanthus",
          body: body ?? "",
          extra: data,
        },
      ],
    }).catch(() => {});
  });

  LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
    navigateToRoute(action.notification.extra as Record<string, unknown> | undefined);
  });
}
