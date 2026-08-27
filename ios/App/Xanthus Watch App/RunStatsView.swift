import SwiftUI

/// Live stats mirrored from the phone, plus Pausar/Retomar/Finalizar —
/// each button just relays the tap back over `WCSession`; the phone's own
/// `useRunTracker.ts` (`pause()`/`resume()`/`finish()`) does the real work,
/// same as the existing Live Activity/notification action buttons already
/// do for their own platforms.
struct RunStatsView: View {
    @EnvironmentObject private var phoneConnector: PhoneConnector

    var body: some View {
        VStack(spacing: 8) {
            Text(phoneConnector.distanceLabel)
                .font(.title2)
                .fontWeight(.semibold)
            Text(phoneConnector.paceLabel)
                .font(.body)
            Text(phoneConnector.timeLabel)
                .font(.body)
                .foregroundStyle(.secondary)

            HStack {
                if phoneConnector.status == "paused" {
                    Button("Retomar") { phoneConnector.sendAction("resume") }
                } else {
                    Button("Pausar") { phoneConnector.sendAction("pause") }
                }
            }
            Button("Finalizar", role: .destructive) {
                phoneConnector.sendAction("finish")
            }
        }
        .padding(.vertical, 4)
    }
}
