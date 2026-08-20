import ActivityKit
import SwiftUI
import WidgetKit

/// Draws `context.state.routePoints` (normalized to a 0-100 square, same
/// convention as the web's RouteStrip/projectRoute and the Android rich
/// notification's RouteThumbnail) as a real vector path, scaled to whatever
/// size SwiftUI gives it — unlike Android's notification, a widget extension
/// can draw live vector geometry directly, no bitmap rasterization needed.
private struct RouteShape: Shape {
    var points: [RunActivityAttributes.RoutePoint]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard points.count >= 2 else { return path }
        let scaleX = rect.width / 100
        let scaleY = rect.height / 100
        let first = points[0]
        path.move(to: CGPoint(x: first.x * scaleX, y: first.y * scaleY))
        for point in points.dropFirst() {
            path.addLine(to: CGPoint(x: point.x * scaleX, y: point.y * scaleY))
        }
        return path
    }
}

@available(iOS 16.1, *)
private struct StatColumn: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
                .fontWeight(.bold)
                .monospacedDigit()
        }
    }
}

/// Shared by both the lock-screen banner and the Dynamic Island's expanded
/// region — same 3-column layout the Android rich notification uses
/// (notification_run.xml), so the two platforms read as the same feature
/// even though they're built with entirely different native mechanisms.
@available(iOS 16.1, *)
private struct RunActivityContentView: View {
    let state: RunActivityAttributes.ContentState
    /// Interactive buttons only exist on iOS 17+ (`LiveActivityIntent`
    /// requires it) — omitted entirely below that floor rather than shown
    /// disabled, since a button that can never respond is worse than no
    /// button. Stats and route still render fine back to iOS 16.1.
    var showsActions: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                StatColumn(label: "DISTÂNCIA", value: state.distanceLabel)
                Spacer()
                StatColumn(label: "RITMO", value: state.paceLabel)
                if !state.routePoints.isEmpty {
                    Spacer()
                    RouteShape(points: state.routePoints)
                        .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                        .frame(width: 40, height: 40)
                }
                Spacer()
                StatColumn(label: "TEMPO", value: state.timeLabel)
            }

            if showsActions, #available(iOS 17.0, *) {
                HStack(spacing: 8) {
                    Button(intent: PauseRunIntent()) {
                        Label("Pausar", systemImage: "pause.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)

                    Button(intent: FinishRunIntent()) {
                        Label("Finalizar", systemImage: "stop.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                }
            }
        }
        .padding()
    }
}

@available(iOS 16.1, *)
struct RunActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            RunActivityContentView(state: context.state, showsActions: true)
                .activityBackgroundTint(Color.black.opacity(0.8))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    StatColumn(label: "DISTÂNCIA", value: context.state.distanceLabel)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    StatColumn(label: "RITMO", value: context.state.paceLabel)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    RunActivityContentView(state: context.state, showsActions: true)
                }
            } compactLeading: {
                Text(context.state.distanceLabel)
                    .font(.caption2)
                    .monospacedDigit()
            } compactTrailing: {
                Text(context.state.timeLabel)
                    .font(.caption2)
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "figure.run")
            }
        }
    }
}
