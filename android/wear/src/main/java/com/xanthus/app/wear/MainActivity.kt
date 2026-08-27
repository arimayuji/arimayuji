package com.xanthus.app.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

class MainActivity : ComponentActivity() {
    private lateinit var phoneConnector: PhoneConnector

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        phoneConnector = PhoneConnector(applicationContext)
        setContent { WearApp(phoneConnector) }
    }

    override fun onStart() {
        super.onStart()
        phoneConnector.start()
    }

    override fun onStop() {
        phoneConnector.stop()
        super.onStop()
    }
}
