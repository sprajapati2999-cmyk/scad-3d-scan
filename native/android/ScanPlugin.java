package com.scad.viewer;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens the native depth-scan screen and returns the saved PLY file name (in the cache folder). */
@CapacitorPlugin(name = "Scan")
public class ScanPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        Intent i = new Intent(getContext(), ScanActivity.class);
        startActivityForResult(call, i, "scanDone");
    }

    @ActivityCallback
    private void scanDone(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent d = result.getData();
        JSObject o = new JSObject();
        if (result.getResultCode() == Activity.RESULT_OK && d != null && d.getStringExtra("file") != null) {
            o.put("file", d.getStringExtra("file"));
            o.put("count", d.getIntExtra("count", 0));
        } else {
            o.put("cancelled", true);
            if (d != null && d.getStringExtra("error") != null) o.put("error", d.getStringExtra("error"));
        }
        call.resolve(o);
    }
}
