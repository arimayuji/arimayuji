import Foundation
import WatchConnectivity

/// Tethered mirror of the phone's run state, over `WCSession` — this watch
/// target has no GPS/HealthKit of its own; every number shown here comes
/// from the iPhone's `useRunTracker.ts`, relayed through the app-side
/// `CapgoCapacitorBackgroundGeolocationPlugin`'s `sendWatchUpdate`
/// (phone → watch, `updateApplicationContext`, latest-value-wins) and
/// `watchAction` (watch → phone, `sendMessage`, best-effort delivery).
///
/// `didReceiveApplicationContext` is invoked on a background queue per
/// Apple's docs, hence the `DispatchQueue.main.async` before touching
/// `@Published` properties — SwiftUI requires those on the main thread.
final class PhoneConnector: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var status: String = "idle"
    @Published private(set) var distanceLabel: String = "0,00 km"
    @Published private(set) var paceLabel: String = "--:--/km"
    @Published private(set) var timeLabel: String = "00:00"

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Best-effort — a tethered v1 run with the phone unreachable just
    /// means the button tap does nothing, same "swallow and move on"
    /// convention the phone-side plugin already uses for its own
    /// best-effort native calls (see `startLiveActivity`'s siblings).
    func sendAction(_ action: String) {
        guard WCSession.default.activationState == .activated, WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["action": action], replyHandler: nil, errorHandler: nil)
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async {
            if let status = applicationContext["status"] as? String { self.status = status }
            if let distanceLabel = applicationContext["distanceLabel"] as? String { self.distanceLabel = distanceLabel }
            if let paceLabel = applicationContext["paceLabel"] as? String { self.paceLabel = paceLabel }
            if let timeLabel = applicationContext["timeLabel"] as? String { self.timeLabel = timeLabel }
        }
    }
}
