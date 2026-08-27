import SwiftUI

/// Root view — swaps between "nothing running yet" and the live-stats
/// screen based on `PhoneConnector.status`, mirroring the phone's own
/// `RunTrackerState.status` values (`idle`/`warming`/`tracking`/`paused`).
/// "finished" also routes back to the idle screen: the run is over on the
/// phone, there is nothing left for the watch to show.
struct ContentView: View {
    @EnvironmentObject private var phoneConnector: PhoneConnector

    var body: some View {
        Group {
            if phoneConnector.status == "tracking" || phoneConnector.status == "paused" {
                RunStatsView()
            } else {
                IdleView()
            }
        }
    }
}

/// Known v1 limitation (see plan doc): tapping "Iniciar" here only does
/// something once the phone already has the run screen open and ready —
/// there's no way yet for the watch to make the phone navigate there.
private struct IdleView: View {
    @EnvironmentObject private var phoneConnector: PhoneConnector

    var body: some View {
        VStack(spacing: 12) {
            Text("Xanthus")
                .font(.headline)
            Button("Iniciar") {
                phoneConnector.sendAction("start")
            }
        }
    }
}
