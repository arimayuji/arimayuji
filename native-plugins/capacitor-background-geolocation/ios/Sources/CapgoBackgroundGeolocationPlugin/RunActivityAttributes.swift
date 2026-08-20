import ActivityKit
import Foundation

/// Duplicated verbatim from `ios/App/App/RunActivityAttributes.swift` (and
/// `RunActivityWidget/`'s own copy) — Swift modules can't see each other's
/// internal types, and this plugin's Swift Package (compiled as its own
/// module, `CapgoBackgroundGeolocationPlugin`) has no dependency edge back
/// to the App target that could otherwise export it. This third copy is
/// exactly the same pattern already used to share the type between the App
/// and RunActivityWidget targets: ActivityKit doesn't require literal
/// same-module type identity to match an Activity across the app and its
/// widget extension (it's a Codable-serialized exchange keyed by structural
/// shape + App Group, not by in-process type metadata), and this plugin
/// runs in-process inside the App binary anyway — so three structurally
/// identical copies behave as one shared type at runtime, same as the
/// existing two-target duplication already does.
///
/// Keep all three copies in sync by hand if this ever changes.
@available(iOS 16.1, *)
struct RunActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distanceLabel: String
        var paceLabel: String
        var timeLabel: String
        var routePoints: [RoutePoint]
    }

    struct RoutePoint: Codable, Hashable {
        var x: Double
        var y: Double
    }
}
