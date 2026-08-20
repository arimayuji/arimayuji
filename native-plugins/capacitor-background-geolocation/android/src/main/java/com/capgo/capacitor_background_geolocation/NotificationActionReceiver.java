package com.capgo.capacitor_background_geolocation;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

/**
 * Handles taps on the rich tracking notification's Pausar/Finalizar buttons
 * (see BackgroundGeolocationService#createRichBackgroundNotification).
 *
 * This receiver does NOT pause or finish the run itself — all of that state
 * (distance accumulated, GPS points, IndexedDB persistence) lives entirely
 * in useRunTracker.ts on the JS side, and duplicating it natively here would
 * be a second, easy-to-desync copy of the same logic. Instead this is a
 * thin relay: the system delivers the button tap to this real,
 * manifest-declared BroadcastReceiver (required so it still works if the
 * app process was killed while tracking continued in the foreground
 * service), which re-broadcasts locally via LocalBroadcastManager so
 * BackgroundGeolocation's plugin instance — if the WebView is alive — can
 * forward it to JS as a "notificationAction" event. If the WebView isn't
 * alive to receive that event, the button tap is a no-op beyond that: there
 * is nothing else it needs to do, since the notification itself keeps
 * showing the last stats it had until the app comes back to the foreground.
 * Same relay shape as GeofenceBroadcastReceiver -> GeofenceStore already
 * uses for geofence transitions.
 *
 * Xanthus fork — not part of the upstream plugin.
 */
public class NotificationActionReceiver extends BroadcastReceiver {

    static final String ACTION_NOTIFICATION_ACTION = "com.capgo.capacitor_background_geolocation.NOTIFICATION_ACTION";
    static final String EXTRA_ACTION = "action";

    static final String ACTION_PAUSE = "pause";
    static final String ACTION_FINISH = "finish";

    private static final int PAUSE_PENDING_INTENT_REQUEST_CODE = 83621;
    private static final int FINISH_PENDING_INTENT_REQUEST_CODE = 83622;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null || action.isEmpty()) {
            return;
        }
        Intent localIntent = new Intent(ACTION_NOTIFICATION_ACTION);
        localIntent.putExtra(EXTRA_ACTION, action);
        LocalBroadcastManager.getInstance(context).sendBroadcast(localIntent);
    }

    static PendingIntent createPendingIntent(Context context, String action) {
        Intent intent = new Intent(context, NotificationActionReceiver.class);
        intent.setPackage(context.getPackageName());
        intent.putExtra(EXTRA_ACTION, action);

        int requestCode = ACTION_PAUSE.equals(action) ? PAUSE_PENDING_INTENT_REQUEST_CODE : FINISH_PENDING_INTENT_REQUEST_CODE;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }
}
