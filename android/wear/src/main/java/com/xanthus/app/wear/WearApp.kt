package com.xanthus.app.wear

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.wear.compose.material.MaterialTheme

@Composable
fun WearApp(phoneConnector: PhoneConnector) {
    val uiState by phoneConnector.uiState.collectAsState()

    MaterialTheme {
        if (uiState.status == "idle" || uiState.status == "finished") {
            IdleScreen(onStart = { phoneConnector.sendAction("start") })
        } else {
            RunStatsScreen(
                uiState = uiState,
                onPauseResume = {
                    phoneConnector.sendAction(if (uiState.status == "paused") "resume" else "pause")
                },
                onFinish = { phoneConnector.sendAction("finish") },
            )
        }
    }
}
