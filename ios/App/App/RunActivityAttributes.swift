import ActivityKit
import Foundation

/// Shared between the main App target and the RunActivityWidget extension —
/// both need the exact same type to start/update an Activity (App side) and
/// render it (widget side). Compiled into both targets (see project.pbxproj's
/// PBXSourcesBuildPhase for each).
///
/// Xanthus-specific — not part of any upstream Capacitor plugin.
@available(iOS 16.1, *)
struct RunActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distanceLabel: String
        var paceLabel: String
        var timeLabel: String
        /// The run's route so far, normalized to a 0-100 square — same
        /// convention `projectRoute()` already produces on the web side
        /// (src/lib/tracking/routeProjection.ts) and the Android rich
        /// notification's RouteThumbnail bitmap already consumes. Only one
        /// flattened stretch is carried here (unlike Android's per-gap
        /// polyline array) since a Live Activity update is small and
        /// frequent — a tracking gap just means two points end up far apart
        /// in this array, which reads fine as "a straight jump" for a
        /// glanceable lock-screen widget even if it isn't literally the
        /// real path across that gap.
        var routePoints: [RoutePoint]
    }

    struct RoutePoint: Codable, Hashable {
        var x: Double
        var y: Double
    }
}
