// Run after `npx cap add android`. Adds the native depth-scan screen (ARCore) to the generated Android project.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
const pkgDir = 'android/app/src/main/java/com/scad/viewer';
if (!existsSync(pkgDir)) throw new Error('android-scan: package folder not found: ' + pkgDir);
for (const f of ['ScanPlugin.java', 'ScanActivity.java']) copyFileSync('native/android/' + f, pkgDir + '/' + f);

// 1. register the plugin
writeFileSync(pkgDir + '/MainActivity.java', `package com.scad.viewer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);

// 2. manifest: camera permission, optional AR, scan activity
const mf = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(mf, 'utf8');
if (!/<application[\s>]/.test(m) || !/<\/application>/.test(m)) throw new Error('android-scan: manifest layout not recognised');
if (!m.includes('android.permission.CAMERA')) m = m.replace(/<application/, '<uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera.ar" android:required="false" />\n    <application');
m = m.replace('</application>', `    <meta-data android:name="com.google.ar.core" android:value="optional" />
        <activity android:name=".ScanActivity" android:exported="false" android:screenOrientation="portrait" android:configChanges="orientation|screenSize|keyboardHidden" android:theme="@android:style/Theme.NoTitleBar.Fullscreen" />
    </application>`);
writeFileSync(mf, m);

// 3. ARCore dependency
const gf = 'android/app/build.gradle';
let g = readFileSync(gf, 'utf8');
if (!/dependencies\s*\{/.test(g)) throw new Error('android-scan: dependencies block not found');
g = g.replace(/dependencies\s*\{/, "dependencies {\n    implementation 'com.google.ar:core:1.47.0'");
writeFileSync(gf, g);
console.log('Patched Android project with the ARCore scan screen.');
