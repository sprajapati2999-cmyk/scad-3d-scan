package com.scad.viewer;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.Image;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.opengl.Matrix;
import android.os.Bundle;
import android.view.Gravity;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.CameraIntrinsics;
import com.google.ar.core.Config;
import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Frame;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.charset.StandardCharsets;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * Depth scan screen. Uses ARCore depth (works on phones without a LiDAR/ToF sensor, such as the Galaxy S25)
 * and collects 3D points while the user walks around. Points are thinned on a 2 cm grid and saved as a binary PLY.
 */
public class ScanActivity extends Activity implements GLSurfaceView.Renderer {
    private static final int MAX_POINTS = 2000000;
    private static final float VOXEL = 0.01f;

    private Session session;
    private GLSurfaceView glView;
    private TextView status;
    private Button recBtn;
    private boolean installRequested = false;
    private volatile boolean recording = false;
    private volatile boolean finishing = false;
    private int frameNo = 0;
    private long lastUi = 0;
    private String hint = "Point the phone at a surface and move slowly. Tap Start.";

    // GL
    private int camTex, bgProg, ptProg, vbo;
    private int bgPos, bgUv, bgTex, ptPos, ptMvp, ptSize;
    private FloatBuffer quad, quadUv;
    private final float[] proj = new float[16], view = new float[16], mvp = new float[16];
    private int vw = 1, vh = 1;
    private boolean geomDirty = true;

    // points
    private final float[] pts = new float[MAX_POINTS * 3];
    private final byte[] cols = new byte[MAX_POINTS * 3];
    private volatile int count = 0;
    private int uploaded = 0;
    private final long[] table = new long[1 << 22];
    private final boolean[] used = new boolean[1 << 22];

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        FrameLayout root = new FrameLayout(this);
        glView = new GLSurfaceView(this);
        glView.setPreserveEGLContextOnPause(true);
        glView.setEGLContextClientVersion(2);
        glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
        glView.setRenderer(this);
        glView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
        root.addView(glView, new FrameLayout.LayoutParams(-1, -1));

        status = new TextView(this);
        status.setTextColor(Color.WHITE);
        status.setBackgroundColor(0x99000000);
        status.setTextSize(14);
        status.setPadding(dp(12), dp(10), dp(12), dp(10));
        status.setText(hint);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, -2);
        sp.gravity = Gravity.TOP;
        status.setPadding(dp(12), dp(44), dp(12), dp(10));
        root.addView(status, sp);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER);
        bar.setBackgroundColor(0x99000000);
        bar.setPadding(dp(8), dp(10), dp(8), dp(24));
        Button cancel = new Button(this);
        cancel.setText("Cancel");
        recBtn = new Button(this);
        recBtn.setText("Start");
        Button done = new Button(this);
        done.setText("Finish");
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bp.setMargins(dp(6), 0, dp(6), 0);
        bar.addView(cancel, bp);
        bar.addView(recBtn, bp);
        bar.addView(done, bp);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, -2);
        lp.gravity = Gravity.BOTTOM;
        root.addView(bar, lp);
        setContentView(root);

        cancel.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { endWith(null, "cancel"); } });
        recBtn.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                recording = !recording;
                recBtn.setText(recording ? "Pause" : "Resume");
                hint = recording ? "Scanning. Walk slowly and sweep over walls, floor and objects." : "Paused.";
            }
        });
        done.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { finishScan(); } });
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }

    @Override
    protected void onResume() {
        super.onResume();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 7);
            return;
        }
        startSession();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) startSession();
        else endWith("Camera permission is needed to scan.", null);
    }

    private void startSession() {
        try {
            if (session == null) {
                ArCoreApk.InstallStatus st = ArCoreApk.getInstance().requestInstall(this, !installRequested);
                if (st == ArCoreApk.InstallStatus.INSTALL_REQUESTED) { installRequested = true; return; }
                session = new Session(this);
                Config cfg = new Config(session);
                if (!session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                    endWith("This phone does not support ARCore depth.", null);
                    return;
                }
                cfg.setDepthMode(Config.DepthMode.AUTOMATIC);
                cfg.setFocusMode(Config.FocusMode.AUTO);
                cfg.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
                session.configure(cfg);
            }
            session.resume();
            glView.onResume();
            geomDirty = true;
        } catch (Exception e) {
            endWith("Could not start scanning: " + e.getClass().getSimpleName() + (e.getMessage() != null ? " " + e.getMessage() : ""), null);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (session != null) { glView.onPause(); session.pause(); }
    }

    @Override
    protected void onDestroy() {
        if (session != null) { session.close(); session = null; }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() { endWith(null, "cancel"); }

    private void endWith(String error, String cancel) {
        if (finishing) return;
        finishing = true;
        Intent i = new Intent();
        if (error != null) i.putExtra("error", error);
        setResult(RESULT_CANCELED, i);
        finish();
    }

    private void finishScan() {
        if (finishing) return;
        recording = false;
        final int n = count;
        if (n < 100) { hint = "Not enough points yet. Tap Start and sweep over some surfaces first."; return; }
        finishing = true;
        status.setText("Saving " + n + " points…");
        new Thread(new Runnable() {
            public void run() {
                try {
                    File f = new File(getCacheDir(), "scan.ply");
                    BufferedOutputStream o = new BufferedOutputStream(new FileOutputStream(f), 1 << 16);
                    String h = "ply\nformat binary_little_endian 1.0\ncomment S-CAD depth scan, metres, Z up\nelement vertex " + n
                            + "\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n";
                    o.write(h.getBytes(StandardCharsets.US_ASCII));
                    ByteBuffer bb = ByteBuffer.allocate(15 * 4096).order(ByteOrder.LITTLE_ENDIAN);
                    for (int i = 0; i < n; i += 4096) {
                        int m = Math.min(4096, n - i);
                        bb.clear();
                        for (int k = 0; k < m; k++) {
                            int p = (i + k) * 3;
                            bb.putFloat(pts[p]);        // x
                            bb.putFloat(-pts[p + 2]);   // y  (ARCore -Z)
                            bb.putFloat(pts[p + 1]);    // z  (ARCore up)
                            bb.put(cols[p]); bb.put(cols[p + 1]); bb.put(cols[p + 2]);
                        }
                        o.write(bb.array(), 0, m * 15);
                    }
                    o.close();
                    Intent r = new Intent();
                    r.putExtra("file", "scan.ply");
                    r.putExtra("count", n);
                    setResult(RESULT_OK, r);
                } catch (Exception e) {
                    Intent r = new Intent();
                    r.putExtra("error", "Could not save the scan: " + e.getMessage());
                    setResult(RESULT_CANCELED, r);
                }
                finish();
            }
        }).start();
    }

    // ---------- GL ----------
    private static int shader(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        return s;
    }

    private static int program(String vs, String fs) {
        int p = GLES20.glCreateProgram();
        GLES20.glAttachShader(p, shader(GLES20.GL_VERTEX_SHADER, vs));
        GLES20.glAttachShader(p, shader(GLES20.GL_FRAGMENT_SHADER, fs));
        GLES20.glLinkProgram(p);
        return p;
    }

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig c) {
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        int[] t = new int[1];
        GLES20.glGenTextures(1, t, 0);
        camTex = t[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, camTex);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);

        bgProg = program(
                "attribute vec4 aPos; attribute vec2 aUv; varying vec2 vUv; void main(){ gl_Position = aPos; vUv = aUv; }",
                "#extension GL_OES_EGL_image_external : require\nprecision mediump float; varying vec2 vUv; uniform samplerExternalOES sTex; void main(){ gl_FragColor = texture2D(sTex, vUv); }");
        bgPos = GLES20.glGetAttribLocation(bgProg, "aPos");
        bgUv = GLES20.glGetAttribLocation(bgProg, "aUv");
        bgTex = GLES20.glGetUniformLocation(bgProg, "sTex");
        ptProg = program(
                "attribute vec3 aPos; uniform mat4 uMvp; uniform float uSize; varying float vH; void main(){ gl_Position = uMvp * vec4(aPos, 1.0); gl_PointSize = uSize; vH = aPos.y; }",
                "precision mediump float; varying float vH; void main(){ float t = clamp(fract(vH * 0.5), 0.0, 1.0); gl_FragColor = vec4(0.1 + 0.9 * t, 1.0 - 0.3 * t, 0.7 - 0.5 * t, 1.0); }");
        ptPos = GLES20.glGetAttribLocation(ptProg, "aPos");
        ptMvp = GLES20.glGetUniformLocation(ptProg, "uMvp");
        ptSize = GLES20.glGetUniformLocation(ptProg, "uSize");

        float[] q = {-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f};
        quad = ByteBuffer.allocateDirect(q.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        quad.put(q).position(0);
        quadUv = ByteBuffer.allocateDirect(q.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();

        int[] bufs = new int[1];
        GLES20.glGenBuffers(1, bufs, 0);
        vbo = bufs[0];
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, vbo);
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, MAX_POINTS * 12, null, GLES20.GL_DYNAMIC_DRAW);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
        uploaded = 0;
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int w, int h) {
        GLES20.glViewport(0, 0, w, h);
        vw = w; vh = h;
        geomDirty = true;
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (session == null || finishing) return;
        try {
            if (geomDirty) {
                int rot = getWindowManager().getDefaultDisplay().getRotation();
                session.setDisplayGeometry(rot, vw, vh);
                geomDirty = false;
            }
            session.setCameraTextureName(camTex);
            Frame frame = session.update();
            if (frame.hasDisplayGeometryChanged()) {
                frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, quad, Coordinates2d.TEXTURE_NORMALIZED, quadUv);
            }
            // camera image
            GLES20.glDisable(GLES20.GL_DEPTH_TEST);
            GLES20.glUseProgram(bgProg);
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, camTex);
            GLES20.glUniform1i(bgTex, 0);
            quad.position(0); quadUv.position(0);
            GLES20.glVertexAttribPointer(bgPos, 2, GLES20.GL_FLOAT, false, 0, quad);
            GLES20.glVertexAttribPointer(bgUv, 2, GLES20.GL_FLOAT, false, 0, quadUv);
            GLES20.glEnableVertexAttribArray(bgPos);
            GLES20.glEnableVertexAttribArray(bgUv);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
            GLES20.glDisableVertexAttribArray(bgPos);
            GLES20.glDisableVertexAttribArray(bgUv);

            com.google.ar.core.Camera cam = frame.getCamera();
            boolean tracking = cam.getTrackingState() == TrackingState.TRACKING;
            if (tracking) {
                if (recording && (frameNo++ % 2) == 0) addDepth(frame, cam);
                cam.getProjectionMatrix(proj, 0, 0.05f, 50f);
                cam.getViewMatrix(view, 0);
                Matrix.multiplyMM(mvp, 0, proj, 0, view, 0);
                int n = count;
                if (n > uploaded) {
                    FloatBuffer fb = ByteBuffer.allocateDirect((n - uploaded) * 12).order(ByteOrder.nativeOrder()).asFloatBuffer();
                    fb.put(pts, uploaded * 3, (n - uploaded) * 3).position(0);
                    GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, vbo);
                    GLES20.glBufferSubData(GLES20.GL_ARRAY_BUFFER, uploaded * 12, (n - uploaded) * 12, fb);
                    GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
                    uploaded = n;
                }
                if (uploaded > 0) {
                    GLES20.glUseProgram(ptProg);
                    GLES20.glUniformMatrix4fv(ptMvp, 1, false, mvp, 0);
                    GLES20.glUniform1f(ptSize, 5f);
                    GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, vbo);
                    GLES20.glEnableVertexAttribArray(ptPos);
                    GLES20.glVertexAttribPointer(ptPos, 3, GLES20.GL_FLOAT, false, 12, 0);
                    GLES20.glDrawArrays(GLES20.GL_POINTS, 0, uploaded);
                    GLES20.glDisableVertexAttribArray(ptPos);
                    GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
                }
            }
            long now = System.currentTimeMillis();
            if (now - lastUi > 300) {
                lastUi = now;
                final String msg = tracking ? (count + " points  ·  " + hint) : "Looking for the surroundings… move the phone slowly.";
                runOnUiThread(new Runnable() { public void run() { if (!finishing) status.setText(msg); } });
            }
        } catch (Exception e) {
            // skip this frame
        }
    }

    // ---------- depth to points ----------
    private boolean addCell(long key) {
        int h = (int) ((key * 0x9E3779B97F4A7C15L) >>> 42);
        int mask = table.length - 1;
        h &= mask;
        while (used[h]) {
            if (table[h] == key) return false;
            h = (h + 1) & mask;
        }
        used[h] = true;
        table[h] = key;
        return true;
    }

    private void addDepth(Frame frame, com.google.ar.core.Camera cam) {
        if (count >= MAX_POINTS - 5000) { hint = "Point limit reached. Tap Finish."; return; }
        Image depth = null, conf = null, img = null;
        try {
            try {
                depth = frame.acquireRawDepthImage16Bits();
                conf = frame.acquireRawDepthConfidenceImage();
            } catch (Exception e1) {
                if (depth != null) { depth.close(); depth = null; }
                if (conf != null) { conf.close(); conf = null; }
                try { depth = frame.acquireDepthImage16Bits(); } catch (Exception e2) { return; }
            }
            int w = depth.getWidth(), h = depth.getHeight();
            Image.Plane dp = depth.getPlanes()[0];
            ByteBuffer db = dp.getBuffer().order(ByteOrder.nativeOrder());
            int drs = dp.getRowStride(), dps = dp.getPixelStride();
            ByteBuffer cb = null; int crs = 0, cps = 1;
            if (conf != null) { Image.Plane cp = conf.getPlanes()[0]; cb = cp.getBuffer(); crs = cp.getRowStride(); cps = cp.getPixelStride(); }

            CameraIntrinsics in = cam.getTextureIntrinsics();
            int[] dim = in.getImageDimensions();
            float[] fl = in.getFocalLength(), pp = in.getPrincipalPoint();
            float sx = (float) w / dim[0], sy = (float) h / dim[1];
            float fx = fl[0] * sx, fy = fl[1] * sy, cx = pp[0] * sx, cy = pp[1] * sy;
            Pose pose = cam.getPose();
            ByteBuffer yb = null, ub = null, vb = null;
            int yrs = 0, urs = 0, ups = 1, iw = 1, ih = 1;
            float ifx = 1, ify = 1, icx = 0, icy = 0;
            try {
                img = frame.acquireCameraImage();
                Image.Plane[] ip = img.getPlanes();
                yb = ip[0].getBuffer(); yrs = ip[0].getRowStride();
                ub = ip[1].getBuffer(); vb = ip[2].getBuffer(); urs = ip[1].getRowStride(); ups = ip[1].getPixelStride();
                CameraIntrinsics ci = cam.getImageIntrinsics();
                int[] idim = ci.getImageDimensions(); iw = idim[0]; ih = idim[1];
                ifx = ci.getFocalLength()[0]; ify = ci.getFocalLength()[1]; icx = ci.getPrincipalPoint()[0]; icy = ci.getPrincipalPoint()[1];
            } catch (Exception ce) { img = null; yb = null; }
            float[] q = new float[3], o = new float[3];
            int step = 1;
            for (int y = 0; y < h; y += step) {
                for (int x = 0; x < w; x += step) {
                    int mm = db.getShort(y * drs + x * dps) & 0xFFFF;
                    if (mm < 200 || mm > 5000) continue;
                    if (cb != null) { int cf = cb.get(y * crs + x * cps) & 0xFF; if (cf < 80) continue; }
                    float z = mm / 1000f;
                    q[0] = (x + 0.5f - cx) * z / fx;
                    q[1] = -(y + 0.5f - cy) * z / fy;
                    q[2] = -z;
                    pose.transformPoint(q, 0, o, 0);
                    long ix = (long) Math.floor(o[0] / VOXEL) & 0x1FFFFF, iy = (long) Math.floor(o[1] / VOXEL) & 0x1FFFFF, iz = (long) Math.floor(o[2] / VOXEL) & 0x1FFFFF;
                    long key = (ix << 42) | (iy << 21) | iz;
                    if (!addCell(key)) continue;
                    int n = count;
                    if (n >= MAX_POINTS) return;
                    pts[n * 3] = o[0]; pts[n * 3 + 1] = o[1]; pts[n * 3 + 2] = o[2];
                    int cr = 160, cg = 160, cb2 = 160;
                    if (yb != null) {
                        int u = Math.round(ifx * q[0] / z + icx), v = Math.round(icy - ify * q[1] / z);
                        if (u >= 0 && v >= 0 && u < iw && v < ih) {
                            int yy = yb.get(v * yrs + u) & 0xFF;
                            int uo = (v >> 1) * urs + (u >> 1) * ups;
                            int uu = (ub.get(uo) & 0xFF) - 128, vv = (vb.get(uo) & 0xFF) - 128;
                            cr = clamp(yy + 1.402f * vv); cg = clamp(yy - 0.344f * uu - 0.714f * vv); cb2 = clamp(yy + 1.772f * uu);
                        }
                    }
                    cols[n * 3] = (byte) cr; cols[n * 3 + 1] = (byte) cg; cols[n * 3 + 2] = (byte) cb2;
                    count = n + 1;
                }
            }
        } catch (Exception e) {
            // depth not ready yet
        } finally {
            if (depth != null) depth.close();
            if (conf != null) conf.close();
            if (img != null) img.close();
        }
    }

    private static int clamp(float v) { return v < 0 ? 0 : (v > 255 ? 255 : (int) v); }
}
