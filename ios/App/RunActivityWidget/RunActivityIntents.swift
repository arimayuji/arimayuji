import AppIntents
import Foundation

/// Xanthus App Group — shared with the main App target (see App.entitlements
/// and this target's own RunActivityWidget.entitlements). This is the only
/// channel these two run in separate processes: an intent tapped here runs
/// inside the widget extension's process, never inside the main app's, so it
/// cannot touch the WebView/JS state directly. Instead it writes the
/// requested action to this shared UserDefaults suite and posts a Darwin
/// notification — the main app (CapgoCapacitorBackgroundGeolocationPlugin's
/// `load()`) listens for that notification and forwards the action to JS as
/// a "notificationAction" event, exactly like the Android fork's own
/// notification-button relay (NotificationActionReceiver ->
/// BackgroundGeolocation -> notifyListeners). Reusing the same JS event name
/// on both platforms means useRunTracker.ts/run.page.tsx's single listener
/// already covers both.
///
/// Darwin notifications only reach a process that's still alive — this is
/// expected to work while a run is actively tracking, since the app declares
/// `UIBackgroundModes: [location]` and stays alive in the background for
/// exactly that reason. If the app process was fully terminated by the
/// system, this signal is simply missed; there's no stronger delivery
/// guarantee available here, matching the inherent limits of iOS's
/// extension/app process model this was scoped against from the start.
///
/// Xanthus-specific — not part of any upstream Capacitor plugin.
enum RunActivityActionRelay {
    static let appGroupId = "group.com.xanthus.app"
    static let pendingActionKey = "pendingNotificationAction"
    static let darwinNotificationName = "app.xanthus.notificationAction" as CFString

    static func signal(_ action: String) {
        UserDefaults(suiteName: appGroupId)?.set(action, forKey: pendingActionKey)
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(darwinNotificationName),
            nil,
            nil,
            true
        )
    }
}

@available(iOS 17.0, *)
struct PauseRunIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pausar corrida"

    func perform() async throws -> some IntentResult {
        RunActivityActionRelay.signal("pause")
        return .result()
    }
}

@available(iOS 17.0, *)
struct FinishRunIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Finalizar corrida"

    func perform() async throws -> some IntentResult {
        RunActivityActionRelay.signal("finish")
        return .result()
    }
}
