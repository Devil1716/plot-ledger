package com.devil1716.plotledger;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // BridgeActivity switches from the launch theme to AppTheme.NoActionBar in
        // super.onCreate. EdgeToEdge must run *after* that: touching the window
        // earlier builds the decor with the launch theme (title bar + stretched
        // splash bitmap as its background), which showed up as a glitchy header.
        super.onCreate(savedInstanceState);
        // Draw behind the status / navigation bars; the web app pads itself with
        // the safe-area insets that Capacitor's SystemBars (insetsHandling: "css") provides.
        EdgeToEdge.enable(this);
        // The full-screen WebView paints its own (ink) background, so the window
        // background under it is pure overdraw on every frame. Drop it.
        getWindow().setBackgroundDrawable(null);
    }
}
