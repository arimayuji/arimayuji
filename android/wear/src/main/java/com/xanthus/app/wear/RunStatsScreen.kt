package com.xanthus.app.wear

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

@Composable
fun RunStatsScreen(
    uiState: WatchUiState,
    onPauseResume: () -> Unit,
    onFinish: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = uiState.distanceLabel, style = MaterialTheme.typography.title1)
        Text(text = uiState.paceLabel, style = MaterialTheme.typography.body1)
        Text(text = uiState.timeLabel, style = MaterialTheme.typography.body1)

        Button(onClick = onPauseResume, modifier = Modifier.padding(top = 12.dp)) {
            Text(text = if (uiState.status == "paused") "Retomar" else "Pausar")
        }
        Button(onClick = onFinish, modifier = Modifier.padding(top = 8.dp)) {
            Text(text = "Finalizar")
        }
    }
}
