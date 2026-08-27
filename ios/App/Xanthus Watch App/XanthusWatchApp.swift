import SwiftUI

/// Entry point for the tethered watchOS companion app — the watch has no
/// GPS/HealthKit code of its own in this pass, it only mirrors whatever
/// the phone's `useRunTracker.ts` is already tracking and relays button
/// taps back to it. See `PhoneConnector` for the `WCSession` plumbing.
@main
struct XanthusWatchApp: App {
    @StateObject private var phoneConnector = PhoneConnector()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(phoneConnector)
        }
    }
}
