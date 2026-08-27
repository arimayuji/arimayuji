package com.xanthus.app.wear

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.nio.charset.StandardCharsets

/**
 * Tethered mirror of the phone's run state, over the Google Play
 * Services Wearable Data Layer API — this watch module has no GPS of its
 * own; every number shown here comes from the iPhone-equivalent iPhone's
 * `useRunTracker.ts`, relayed through the phone-side
 * `BackgroundGeolocation` plugin's `sendWatchUpdate` (phone -> watch,
 * `DataClient.putDataItem` at [PATH_WATCH_UPDATE], latest-value-wins) and
 * `watchAction` event (watch -> phone, `MessageClient.sendMessage` at
 * [PATH_WATCH_ACTION]). These two path strings must stay identical to the
 * ones in BackgroundGeolocation.java — no shared-constants mechanism
 * exists across the two Gradle modules, same duplication-by-convention
 * already accepted for the JS<->native dictionary keys on the iOS side.
 */
data class WatchUiState(
    val status: String = "idle",
    val distanceLabel: String = "0,00 km",
    val paceLabel: String = "--:--/km",
    val timeLabel: String = "00:00",
)

private const val PATH_WATCH_UPDATE = "/watch_update"
private const val PATH_WATCH_ACTION = "/watch_action"
private const val TAG = "XanthusWear"

class PhoneConnector(private val context: Context) :
    DataClient.OnDataChangedListener {

    private val _uiState = MutableStateFlow(WatchUiState())
    val uiState: StateFlow<WatchUiState> = _uiState.asStateFlow()

    private val dataClient by lazy { Wearable.getDataClient(context) }
    private val messageClient by lazy { Wearable.getMessageClient(context) }
    private val nodeClient by lazy { Wearable.getNodeClient(context) }

    fun start() {
        dataClient.addListener(this)
        // DataClient.OnDataChangedListener only fires on FUTURE changes —
        // unlike iOS's WCSession, whatever the phone last set before this
        // screen opened is not replayed automatically. Fetch it once here
        // so a watch app opened mid-run shows real numbers immediately
        // instead of stale "idle" defaults until the phone's next
        // throttled update.
        dataClient.dataItems
            .addOnSuccessListener { items ->
                for (i in 0 until items.count) {
                    applyDataItem(items[i].uri.path, DataMapItem.fromDataItem(items[i]).dataMap)
                }
                items.release()
            }
            .addOnFailureListener { e -> Log.w(TAG, "getDataItems failed", e) }
    }

    fun stop() {
        dataClient.removeListener(this)
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        for (event in dataEvents) {
            if (event.type == DataEvent.TYPE_CHANGED) {
                applyDataItem(event.dataItem.uri.path, DataMapItem.fromDataItem(event.dataItem).dataMap)
            }
        }
    }

    private fun applyDataItem(path: String?, dataMap: com.google.android.gms.wearable.DataMap) {
        if (path != PATH_WATCH_UPDATE) return
        _uiState.value = WatchUiState(
            status = dataMap.getString("status", "idle"),
            distanceLabel = dataMap.getString("distanceLabel", "0,00 km"),
            paceLabel = dataMap.getString("paceLabel", "--:--/km"),
            timeLabel = dataMap.getString("timeLabel", "00:00"),
        )
    }

    /**
     * Best-effort — same "phone unreachable, button tap silently does
     * nothing" contract the iOS sibling's `sendAction` documents for its
     * own `isReachable` guard. `MessageClient.sendMessage` is directed
     * (unlike `DataClient`, which isn't), so the connected phone node has
     * to be resolved first.
     */
    fun sendAction(action: String) {
        nodeClient.connectedNodes
            .addOnSuccessListener { nodes ->
                for (node in nodes) {
                    messageClient.sendMessage(node.id, PATH_WATCH_ACTION, action.toByteArray(StandardCharsets.UTF_8))
                        .addOnFailureListener { e -> Log.w(TAG, "sendMessage failed", e) }
                }
            }
            .addOnFailureListener { e -> Log.w(TAG, "connectedNodes failed", e) }
    }
}
