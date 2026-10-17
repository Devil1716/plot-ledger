package com.devil1716.plotledger;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw behind the status / navigation bars; the web app pads itself with
        // the safe-area insets that Capacitor's SystemBars (insetsHandling: "css") provides.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
