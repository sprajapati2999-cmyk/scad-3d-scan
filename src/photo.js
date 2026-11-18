// Place-in-photo for S-CAD: take or pick a photo, mark the floor (4 corners) and optionally a wall,
// then place, scale and rotate the 3D model in it, match the light, and save a PNG.
// Works in any browser and in the app. No AR support needed.
(() => {
  'use strict';
  const S = window.__S3D; if (!S) return;
  const { mul, trans, scal, rotAxis, inv4 } = S, D2R = Math.PI / 180, SNAP = 15 * D2R;

  // ---------- camera from a marked floor rectangle ----------
  function solveH(src, dst) { // 4 point DLT, h33 = 1
    const A = [], b = [];
    for (let i = 0; i < 4; i++) { const [X, Y] = src[i], [u, v] = dst[i]; A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y]); b.push(u); A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y]); b.push(v); }
    for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-12) return null; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
    const h = b.map((v, i) => v / A[i][i]); return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  }
  function poseFromH(H, f, cx, cy) {
    const col = (j) => [(H[0][j] - cx * H[2][j]) / f, (H[1][j] - cy * H[2][j]) / f, H[2][j]];
    let h1 = col(0), h2 = col(1), h3 = col(2); const lam = 2 / (Math.hypot(...h1) + Math.hypot(...h2));
    h1 = S.mulv(h1, lam); h2 = S.mulv(h2, lam); h3 = S.mulv(h3, lam);
    if (h3[2] < 0) { h1 = S.mulv(h1, -1); h2 = S.mulv(h2, -1); h3 = S.mulv(h3, -1); }
    const r1 = S.norm(h1); let r2 = S.sub(h2, S.mulv(r1, S.dot(r1, h2))); r2 = S.norm(r2); const r3 = S.cross(r1, r2);
    const C = S.mulv([S.dot(r1, h3), S.dot(r2, h3), S.dot(r3, h3)], -1); // camera centre in plane coordinates
    return { r1, r2, r3, t: h3, C };
  }
  // returns { V (GL view), P (GL projection), cam (world position) } for a floor rectangle W x L (metres) marked by 4 pixel corners
  function cameraFromFloor(px, W, L, fovDeg, w, h) {
    const f = (Math.max(w, h) / 2) / Math.tan(fovDeg * D2R / 2), cx = w / 2, cy = h / 2; let best = null;
    for (const sg of [1, -1]) {
      const H = solveH([[0, 0], [W, 0], [W, sg * L], [0, sg * L]], px); if (!H) continue;
      const p = poseFromH(H, f, cx, cy); if (!best || p.C[2] > best.p.C[2]) best = { p, sg };
    }
    if (!best) return null; const { p, sg } = best;
    // cam-from-plane columns r1 r2 r3 t ; plane = (x, -z, y) of the world (world y up)
    // X_cam = r1*x + r2*(-z) + r3*y + t ;  GL view flips y and z
    const m = new Float32Array([p.r1[0], -p.r1[1], -p.r1[2], 0, p.r3[0], -p.r3[1], -p.r3[2], 0, -p.r2[0], p.r2[1], p.r2[2], 0, p.t[0], -p.t[1], -p.t[2], 1]);
    const n = 0.05, fa = 500, P = new Float32Array([2 * f / w, 0, 0, 0, 0, 2 * f / h, 0, 0, 0, 0, -(fa + n) / (fa - n), -1, 0, 0, -2 * fa * n / (fa - n), 0]);
    const Vi = inv4(m), camW = [Vi[12], Vi[13], Vi[14]];
    return { V: m, P, cam: camW, sg, f };
  }
  S.photoCamera = cameraFromFloor; // exposed for tests

  // ---------- UI ----------
  let busy = false;
  async function openPhoto() {
    if (busy) return; if (!S.has3d()) { alert('Open a 3D model first'); return; }
    busy = true; let ui, R, model, cleanup = () => {};
    try {
      const glb = await S.glb();
      ui = document.createElement('div'); ui.id = 'phUI';
      ui.style.cssText = 'position:fixed;inset:0;background:#0b0e10;z-index:2147483000;font:14px system-ui,sans-serif;color:#fff;display:flex;flex-direction:column;touch-action:none';
      ui.innerHTML = `<style>
        #phUI button{padding:10px 14px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(255,255,255,.08);color:#f4f5f7;font:500 14px Inter,system-ui,sans-serif} #phUI button.on{background:linear-gradient(135deg,#ffc247,#ff9d1f);border-color:transparent;color:#1a1206;font-weight:700;box-shadow:0 4px 14px rgba(255,160,30,.4)}
        #phUI .gb{width:48px;height:48px;padding:0;border-radius:24px;display:grid;place-items:center;font-size:18px;background:rgba(26,30,36,.66);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.1)}
        #phUI #phClose::before{content:none!important}
        #phUI .gs{flex:1;height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;gap:2px;background:rgba(26,30,36,.66);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.1)} #phUI .gs button{border:0;background:none;padding:8px 8px;font-size:13px;font-weight:500;color:rgba(244,245,247,.55);display:flex;align-items:center;gap:6px;border-radius:16px;box-shadow:none} #phUI .gs button::before{content:"";width:8px;height:8px;border-radius:4px;background:currentColor} #phUI .gs button.on{color:#ffb224;font-weight:700;background:none;box-shadow:none}
        #phUI .cta{width:100%;height:52px;margin-top:12px;border:0;border-radius:26px;background:linear-gradient(135deg,#ffc247,#ff9d1f)!important;color:#1a1206!important;font-weight:700;font-size:15px;box-shadow:0 6px 18px rgba(255,160,30,.4)}
        #phUI #phPanel{margin:0 10px calc(10px + env(safe-area-inset-bottom,0px));border-radius:28px;padding:12px!important;background:rgba(26,30,36,.66);-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 30px rgba(0,0,0,.35)!important;background:rgba(26,30,36,.72)!important}
        #phUI .row{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin:4px 0} #phUI label{display:flex;align-items:center;gap:8px;font-size:13px;margin:5px 0}
        #phUI input[type=range]{flex:1;min-width:0} #phUI .lab{min-width:92px;opacity:.9} #phUI input[type=number]{width:70px;padding:6px;border-radius:8px;border:0;background:#fff;color:#111}
        #phUI .dot{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:#e8a33a;color:#14110a;font:700 13px/26px system-ui;text-align:center;pointer-events:none;box-shadow:0 0 0 2px #fff}
        #phUI .dot.w{background:#38c6d9}
      </style>
      <div style="display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 6px"><button id="phClose" class="gb" aria-label="Close">&#x2715;</button><div id="phSteps" class="gs"></div><button id="phFs" class="gb" aria-label="Full screen"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg></button></div>
      <div id="phStage" style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden">
        <div id="phPick" class="row" style="flex-direction:column;align-items:center;gap:12px;padding:20px;text-align:center"><div style="max-width:320px;opacity:.9">Take a photo of the room or place, or pick one. Then you mark the floor so the model can stand on it at the right size and perspective.</div>
          <div class="row"><button id="phCam" class="on">Take photo</button><button id="phGal">Choose photo</button></div></div>
        <div id="phWrap" style="position:relative;display:none"><img id="phImg" style="position:absolute;inset:0;width:100%;height:100%"><canvas id="phShadow" style="position:absolute;inset:0;width:100%;height:100%"></canvas><canvas id="phGL" style="position:absolute;inset:0;width:100%;height:100%"></canvas><div id="phDots" style="position:absolute;inset:0;pointer-events:none"></div><div id="phGest" style="position:absolute;inset:0;touch-action:none"></div></div>
      </div>
      <div id="phHint" style="padding:6px 12px;text-align:center;opacity:.9;height:52px;overflow:hidden;font-size:13px"></div>
      <div id="phPanel" style="padding:8px 10px 12px;background:transparent;max-height:46vh;overflow:auto;display:none"></div>
      <input id="phFileCam" type="file" accept="image/*" capture="environment" hidden><input id="phFile" type="file" accept="image/*" hidden>`;
      document.body.appendChild(ui);
      const $ = (q) => ui.querySelector(q);
      const gl = $('#phGL').getContext('webgl2', { alpha: true, antialias: true, depth: true, premultipliedAlpha: true });
      if (!gl) throw new Error('WebGL 2 is not available');
      R = S.makeRenderer(gl); model = await R.build(glb);
      const st = { tab: 'planes', step: '', img: null, w: 0, h: 0, floor: [], walls: [], wallH: 2.4, W: 3, L: 3, unit: 'm', fov: 68, cam: null, pl: null, wallPlanes: [], drag: null, ring: -1, tilt: false, snap: true, grid: false, cmp: null,
        light: { rel: 20, el: 45, int: 0.7, amb: 0.5, warm: 0, sop: 0.4, soft: 6 } };
      cleanup = () => { try { R.dispose(); } catch (e) {} try { ro && ro.disconnect(); removeEventListener('resize', fit); } catch (e) {} ui.remove(); busy = false; };
      $('#phClose').onclick = cleanup;
      $('#phSteps').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const f = document.createElement('button'); f.dataset.a = b.dataset.a; $('#phPanel').appendChild(f); f.click(); f.remove(); });
      $('#phFs').onclick = () => { try { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen(); } catch (e) {} };
      const hint = (t) => { $('#phHint').textContent = t; };
      const wrap = $('#phWrap'), dots = $('#phDots'), shCv = $('#phShadow'), shCtx = shCv.getContext('2d'), glCv = $('#phGL');
      const toM = (v) => st.unit === 'ft' ? v * 0.3048 : v;

      // ----- load photo -----
      const DEF_FLOOR = () => [[0.1, 0.93], [0.9, 0.93], [0.72, 0.64], [0.28, 0.64]];
      const DEF_WALLS = [[[0.3, 0.66], [0.7, 0.66]], [[0.12, 0.9], [0.28, 0.66]], [[0.88, 0.9], [0.72, 0.66]], [[0.3, 0.84], [0.7, 0.84]]];
      const loadPhoto = async (file) => {
        if (!file) return; hint('Loading photo…');
        const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); st.w = Math.round(bmp.width * k); st.h = Math.round(bmp.height * k);
        const c = document.createElement('canvas'); c.width = st.w; c.height = st.h; c.getContext('2d').drawImage(bmp, 0, 0, st.w, st.h); st.img = c;
        $('#phImg').src = c.toDataURL('image/jpeg', 0.92); glCv.width = shCv.width = st.w; glCv.height = shCv.height = st.h;
        $('#phPick').style.display = 'none'; wrap.style.display = 'block'; $('#phPanel').style.display = 'block'; fit(); st.floor = DEF_FLOOR(); st.walls = []; st.pl = null; st.tab = 'planes'; st.step = ''; solve(); estimateLight(); renderPanel(); hint('Drag the four corners onto the floor in your photo, then tap Place. Drag inside the shape to move it, pinch to resize.'); redraw();
      };
      const fit = () => { if (!st.w) return; const s = $('#phStage'), W = s.clientWidth, H = s.clientHeight, k = Math.min(W / st.w, H / st.h); wrap.style.width = st.w * k + 'px'; wrap.style.height = st.h * k + 'px'; shCv.style.filter = `blur(${st.light.soft * k}px)`; };
      addEventListener('resize', fit); let ro = null; try { ro = new ResizeObserver(() => fit()); ro.observe($('#phStage')); } catch (e) {}
      $('#phCam').onclick = () => $('#phFileCam').click(); $('#phGal').onclick = () => $('#phFile').click();
      $('#phFileCam').onchange = (e) => loadPhoto(e.target.files[0]).catch((x) => alert('Could not open that photo: ' + x.message)); $('#phFile').onchange = (e) => loadPhoto(e.target.files[0]).catch((x) => alert('Could not open that photo: ' + x.message));

      // ----- light estimate from the photo -----
      const estimateLight = () => {
        const GW = 64, GH = Math.max(16, Math.round(64 * st.h / st.w)), c = document.createElement('canvas'); c.width = GW; c.height = GH;
        const g = c.getContext('2d'); g.drawImage(st.img, 0, 0, GW, GH); const d = g.getImageData(0, 0, GW, GH).data;
        const quad = st.floor.length === 4 ? st.floor.map((q) => [q[0] * GW, q[1] * GH]) : null;
        const inQuad = (x, y) => { let s0 = 0; for (let i = 0; i < 4; i++) { const [x1, y1] = quad[i], [x2, y2] = quad[(i + 1) % 4], cr = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1); if (cr !== 0) { if (s0 === 0) s0 = Math.sign(cr); else if (Math.sign(cr) !== s0) return false; } } return true; };
        // samples used for brightness: the marked floor, or the lower 55% of the photo (keeps sky and windows out)
        const pts = [], all = [];
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
          const i = (y * GW + x) * 4, r = d[i] / 255, gg = d[i+1] / 255, b = d[i+2] / 255, Y = 0.2126 * r + 0.7152 * gg + 0.0722 * b; all.push([Y, r, b]);
          if (quad ? inQuad(x + 0.5, y + 0.5) : y > GH * 0.45) pts.push([x / (GW - 1) * 2 - 1, y / (GH - 1) * 2 - 1, Y]);
        }
        if (pts.length < 30) { for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) pts.push([x / (GW - 1) * 2 - 1, y / (GH - 1) * 2 - 1, all[y * GW + x][0]]); }
        // least squares plane  Y ~ m + gx*x + gy*y   (x right, y down)
        let n = pts.length, sx = 0, sy = 0, sY = 0, sxx = 0, syy = 0, sxy = 0, sxY = 0, syY = 0;
        for (const [x, y, Y] of pts) { sx += x; sy += y; sY += Y; sxx += x * x; syy += y * y; sxy += x * y; sxY += x * Y; syY += y * Y; }
        const mean = sY / n, cxx = sxx - sx * sx / n, cyy = syy - sy * sy / n, cxy = sxy - sx * sy / n, cxY = sxY - sx * sY / n, cyY = syY - sy * sY / n, det = cxx * cyy - cxy * cxy || 1e-9;
        const gx = (cxY * cyy - cyY * cxy) / det, gy = (cyY * cxx - cxY * cxy) / det;
        const dirStrength = Math.min(1, Math.hypot(gx, gy) / (mean + 0.08) * 1.4);
        // light colour: average colour of the whole photo (a blue sky or brown floor alone shouldn't decide it)
        let hr = 0, hb = 0; all.forEach((p) => { hr += p[1]; hb += p[2]; }); hr /= all.length; hb /= all.length;
        const L = st.light, clamp = (v, lo, hi2) => Math.max(lo, Math.min(hi2, v));
        L.amb = clamp(0.28 + 0.55 * mean, 0.25, 0.85); L.int = clamp(0.3 + 0.7 * dirStrength, 0.3, 1.0);
        L.rel = dirStrength > 0.12 ? Math.round(Math.atan2(gx, gy) / D2R) : 20; L.el = dirStrength > 0.5 ? 38 : 52;
        L.warm = clamp((hr - hb) / (hr + hb + 0.02) * 2, -0.6, 0.6); L.sop = +(0.2 + 0.5 * dirStrength).toFixed(2); L.soft = Math.round(10 - 8 * dirStrength);
        const side = dirStrength <= 0.12 ? 'soft, even light' : ['from behind you', 'from your right-hand side', 'from the front', 'from your left-hand side'][((Math.round(L.rel / 90) % 4) + 4) % 4];
        hint('Estimated: ' + side + (st.floor.length === 4 ? ' (read from the floor)' : ' (mark the floor, then estimate again for a better result)') + '. Fine-tune with the sliders.');
        return { gx, gy, mean, dirStrength };
      };

      // ----- camera + helpers -----
      const solve = () => {
        const oldVP = st.pl && st.VP ? st.VP : null; let anc = null;
        if (oldVP) { const x = st.pl.pos[0], z = st.pl.pos[2], cw = oldVP[3] * x + oldVP[11] * z + oldVP[15]; if (cw > 1e-6) anc = [((oldVP[0] * x + oldVP[8] * z + oldVP[12]) / cw + 1) / 2, (1 - (oldVP[1] * x + oldVP[9] * z + oldVP[13]) / cw) / 2]; }
        st.cam = null; if (st.floor.length < 4) return;
        const px = st.floor.map((p) => [p[0] * st.w, p[1] * st.h]); st.cam = cameraFromFloor(px, toM(st.W), toM(st.L), st.fov, st.w, st.h);
        if (!st.cam) return; st.VP = mul(st.cam.P, st.cam.V); st.invVP = inv4(st.VP); st.camXZ = [st.cam.cam[0], st.cam.cam[2]];
        if (anc && st.pl) { const h = fh(anc); if (h && isFinite(h[0]) && isFinite(h[2])) { st.pl.pos[0] = h[0]; st.pl.pos[2] = h[2]; } }
        st.wallPlanes = st.walls.map((w) => { const a = fh(w[0]), b = fh(w[1]); if (!a || !b) return null; let n = S.norm(S.cross([0, 1, 0], S.sub(b, a))); if (S.dot(n, S.sub(st.cam.cam, a)) < 0) n = S.mulv(n, -1); return { p: a, n, a, b }; }).filter(Boolean);
      };
      const ensurePlaced = () => { if (st.pl || !st.cam) return; const W = toM(st.W), L = toM(st.L), fp = Math.max(model.size[0], model.size[2], 1e-6), sc = Math.min(1, 0.7 * Math.min(W, Math.abs(L)) / fp); st.fitS = sc; st.pl = S.newPlacement(model, [W / 2, 0, -st.cam.sg * L / 2], sc); S.restOnFloor(st.pl, 0); };
      const ndc = (p) => [p.x / p.w * 2 - 1, 1 - p.y / p.h * 2];
      const rayAt = (p) => { const [x, y] = ndc(p); return S.rayFrom(st.invVP, x, y); };
      const fh = (n01) => S.planeHit(S.rayFrom(st.invVP, n01[0] * 2 - 1, 1 - n01[1] * 2), [0, 0, 0], [0, 1, 0]);
      const floorHit = (p) => S.planeHit(rayAt(p), [0, 0, 0], [0, 1, 0]);
      const setScale = (s) => { const pl = st.pl; if (!pl) return; const up = S.isUpright(pl); pl.scale = Math.min(Math.max(s, 1e-3), 500); if (up) S.restOnFloor(pl, 0); };
      const lightDir = () => { const f = S.norm([st.cam.cam[0] * 0 + (st.pl ? st.pl.pos[0] - st.cam.cam[0] : 0), 0, st.pl ? st.pl.pos[2] - st.cam.cam[2] : -1]), r = [-f[2], 0, f[0]], t = st.light.rel * D2R, el = st.light.el * D2R;
        return [(-f[0] * Math.cos(t) + r[0] * Math.sin(t)) * Math.cos(el), Math.sin(el), (-f[2] * Math.cos(t) + r[2] * Math.sin(t)) * Math.cos(el)]; };

      // ----- rendering -----
      const render = (forExport) => {
        const out = { ok: false }; if (!st.img) return out;
        gl.viewport(0, 0, st.w, st.h); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
        shCtx.clearRect(0, 0, st.w, st.h);
        if (!st.cam) return out;
        if (st.tab !== 'planes') ensurePlaced();
        if (!st.pl) { out.ok = true; return out; }
        const L = st.light, warm = L.warm, tint = [1 + 0.18 * Math.max(warm, 0) - 0.12 * Math.max(-warm, 0), 1 + 0.02 * warm, 1 - 0.2 * Math.max(warm, 0) + 0.15 * Math.max(-warm, 0)];
        R.setLight({ dir: lightDir(), int: L.int, amb: L.amb, tint }); const VP = st.VP, pl = st.pl, base = S.baseMatrix(pl);
        R.shadow(model, VP, base, { p: [0, 0, 0], n: [0, 1, 0] }, L.sop); for (const wp of st.wallPlanes) R.shadow(model, VP, base, wp, L.sop);
        shCtx.drawImage(glCv, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        R.draw(model, VP, base);
        if (!forExport) {
          if (st.tab === 'planes' && st.grid) { const W = toM(st.W), Ln = st.cam.sg * toM(st.L), col = [0.94, 0.64, 0.23, 0.9], z = (y) => -y;
            const c = [[0, 0], [W, 0], [W, Ln], [0, Ln]]; for (let i = 0; i < 4; i++) R.drawLine(VP, [c[i][0], 0.004, z(c[i][1])], [c[(i+1)%4][0], 0.004, z(c[(i+1)%4][1])], 0.012 * Math.max(1, W / 3), col, { onTop: true });
            const nx = Math.max(2, Math.round(W / 0.5)), ny = Math.max(2, Math.round(Math.abs(Ln) / 0.5)); for (let i = 1; i < Math.min(nx, 24); i++) R.drawLine(VP, [W * i / nx, 0.004, 0], [W * i / nx, 0.004, z(Ln)], 0.004 * Math.max(1, W / 3), [1, 1, 1, 0.35]);
            for (let i = 1; i < Math.min(ny, 24); i++) R.drawLine(VP, [0, 0.004, z(Ln * i / ny)], [W, 0.004, z(Ln * i / ny)], 0.004 * Math.max(1, W / 3), [1, 1, 1, 0.35]);
          }
          if (st.tab === 'planes') for (const wp of st.wallPlanes) { const { a, b } = wp, hh = st.wallH; for (const [p, q] of [[a, b], [a, [a[0], hh, a[2]]], [b, [b[0], hh, b[2]]], [[a[0], hh, a[2]], [b[0], hh, b[2]]]]) R.drawLine(VP, p, q, 0.012, [0.22, 0.78, 0.85, 0.95], { onTop: true }); }
          if (st.tab === 'place') R.drawGizmo(VP, [pl.pos[0], 0, pl.pos[2]], pl.pos, S.gizmoRadius(pl), st.tilt, st.ring);
        }
        out.ok = true; return out;
      };
      const cmpEl = document.createElement('div'); cmpEl.style.cssText = 'position:absolute;top:0;bottom:0;width:44px;margin-left:-22px;display:none;touch-action:none;cursor:ew-resize;z-index:4';
      cmpEl.innerHTML = '<div style="position:absolute;left:21px;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 6px rgba(0,0,0,.6)"></div><div style="position:absolute;left:4px;top:50%;width:36px;height:36px;margin-top:-18px;border-radius:18px;background:#fff;color:#1a1206;display:grid;place-items:center;font:700 14px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.5)">&#x2194;</div><div style="position:absolute;left:-44px;top:8px;font:600 11px system-ui;background:rgba(0,0,0,.55);padding:2px 7px;border-radius:9px;color:#fff">Before</div><div style="position:absolute;left:50px;top:8px;font:600 11px system-ui;background:rgba(0,0,0,.55);padding:2px 7px;border-radius:9px;color:#fff">After</div>'; wrap.appendChild(cmpEl);
      const applyCmp = () => { const on = st.tab === 'save' && st.cmp != null && st.cam; const c = on ? `inset(0 0 0 ${st.cmp * 100}%)` : ''; shCv.style.clipPath = glCv.style.clipPath = c; cmpEl.style.display = on ? 'block' : 'none'; cmpEl.style.left = (st.cmp || 0) * 100 + '%'; };
      { let dr = false; const mv = (e) => { const r = wrap.getBoundingClientRect(); st.cmp = Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)); applyCmp(); };
        cmpEl.addEventListener('pointerdown', (e) => { dr = true; try { cmpEl.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); e.stopPropagation(); mv(e); });
        cmpEl.addEventListener('pointermove', (e) => { if (dr) mv(e); }); cmpEl.addEventListener('pointerup', () => { dr = false; }); cmpEl.addEventListener('pointercancel', () => { dr = false; }); }
      const redraw = () => { solve(); render(); drawDots(); applyCmp(); };
      const drawDots = () => {
        dots.innerHTML = ''; const fd = st.tab !== 'planes'; if (fd && st.floor.length < 4) return; { const f = st.floor.map((q) => q[0] + ',' + q[1]).join(' '); dots.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 1 1" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:${fd ? 0.4 : 1}"><polygon points="${f}" fill="rgba(255,178,36,.2)" stroke="rgba(255,178,36,.95)" stroke-width="2.2" stroke-dasharray="7 5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>${st.walls.map((w) => `<line x1="${w[0][0]}" y1="${w[0][1]}" x2="${w[1][0]}" y2="${w[1][1]}" stroke="#38c6d9" stroke-width="2.4" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"/>`).join('')}</svg>`); } if (fd) return; const mk = (p, i, w) => { const d = document.createElement('div'); d.className = 'dot' + (w ? ' w' : ''); d.style.left = p[0] * 100 + '%'; d.style.top = p[1] * 100 + '%'; d.textContent = i; dots.appendChild(d); };
        st.floor.forEach((p, i) => mk(p, i + 1, false)); st.walls.forEach((w, wi) => w.forEach((p, i) => mk(p, String.fromCharCode(65 + wi) + (i + 1), true)));
      };

      // ----- panel -----
      const chip = (a, t, on) => `<button data-a="${a}"${on ? ' class="on"' : ''}>${t}</button>`;
      const slider = (id, lab, min, max, step, val, txt) => `<label><span class="lab">${lab}</span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"><b id="${id}T" style="min-width:46px;text-align:right">${txt}</b></label>`;
      const renderPanel = () => {
        const p = $('#phPanel'), L = st.light, tabs = ''; $('#phSteps').innerHTML = ['planes:Floor', 'place:Place', 'light:Light', 'save:Save'].map((t) => { const [k, n] = t.split(':'); return `<button data-a="tab:${k}"${st.tab === k ? ' class="on"' : ''}>${n}</button>`; }).join('');
        let body = '';
        if (st.tab === 'planes') body = `<div class="row">${st.walls.length < 4 ? chip('addwall', '+ Wall (' + st.walls.length + '/4)') : ''}${st.walls.length ? chip('rmwall', 'Remove wall') : ''}${chip('reset', 'Reset planes')}${chip('grid', 'Grid: ' + (st.grid ? 'on' : 'off'))}</div>
          <label><span class="lab">Floor size</span><input id="pW" type="number" min="0.1" step="0.1" value="${st.W}"> × <input id="pL" type="number" min="0.1" step="0.1" value="${st.L}"> <button data-a="unit">${st.unit}</button></label>
          ${st.walls.length ? slider('pWH', 'Wall height', 1, 6, 0.1, st.wallH, st.wallH.toFixed(1) + ' m') : ''}${slider('pFov', 'Lens (field of view)', 40, 100, 1, st.fov, st.fov + '°')}
          <div style="opacity:.75;font-size:12px">Drag the 4 corners onto the floor, drag inside to move it, pinch to resize. Enter the real size of the shape.</div>`;
        else if (st.tab === 'place') body = `<div class="row">${chip('fit', 'Fit')}${chip('s:1', '1:1')}${chip('s:0.5', '×0.5')}${chip('s:2', '×2')}${chip('snapw', 'Snap to wall')}</div><div class="row">${chip('snap', 'Snap 15°: ' + (st.snap ? 'on' : 'off'), st.snap)}${chip('tilt', 'Tilt rings: ' + (st.tilt ? 'on' : 'off'), st.tilt)}${chip('flat', 'Level model')}</div>
          <div style="opacity:.8;font-size:12px;text-align:center">Drag to move on the floor, pinch to scale, twist with two fingers or drag the ring to rotate.</div>`;
        else if (st.tab === 'light') body = `${slider('lRel', 'Light direction', -180, 180, 1, L.rel, L.rel + '°')}${slider('lEl', 'Height of light', 5, 85, 1, L.el, L.el + '°')}${slider('lInt', 'Intensity', 0, 1.5, 0.05, L.int, L.int.toFixed(2))}${slider('lAmb', 'Ambient light', 0, 1, 0.05, L.amb, L.amb.toFixed(2))}${slider('lWarm', 'Warm ↔ cool', -1, 1, 0.05, L.warm, L.warm.toFixed(2))}${slider('lSop', 'Shadow strength', 0, 0.9, 0.05, L.sop, L.sop.toFixed(2))}${slider('lSoft', 'Shadow softness', 0, 24, 1, L.soft, L.soft + '')}
          <div class="row">${chip('auto', 'Estimate from photo')}</div><div style="opacity:.8;font-size:12px;text-align:center">0° = light from behind you, 90° = from your right, 180° = from the front.</div>`;
        else body = `<div class="row">${chip('save', 'Save PNG')}${chip('savepdf', 'Save PDF')}${chip('cmp', 'Before / after: ' + (st.cmp == null ? 'off' : 'on'), st.cmp != null)}${st.cmp != null ? chip('saveba', 'Save before / after') : ''}</div><div style="opacity:.8;font-size:12px;text-align:center">${st.cmp != null ? 'Drag the white handle across the photo to compare. Left shows the original photo.' : 'Saves the photo with the model and shadow, without the guides.'}</div>`;
        const NEXT = { planes: ['place', 'Next: place the model'], place: ['light', 'Next: match the light'], light: ['save', 'Next: save'] }[st.tab];
        p.innerHTML = tabs + body + (NEXT ? `<button data-a="tab:${NEXT[0]}" class="cta">${NEXT[1]}</button>` : '');
      };
      const panel = $('#phPanel');
      panel.addEventListener('input', (e) => {
        const id = e.target.id, v = +e.target.value, L = st.light, t = (k, s) => { const el = $('#' + k + 'T'); if (el) el.textContent = s; };
        if (id === 'pW') st.W = Math.max(0.1, v || 0.1); else if (id === 'pL') st.L = Math.max(0.1, v || 0.1); else if (id === 'pFov') { st.fov = v; t('pFov', v + '°'); }
        else if (id === 'lRel') { L.rel = v; t('lRel', v + '°'); } else if (id === 'lEl') { L.el = v; t('lEl', v + '°'); } else if (id === 'lInt') { L.int = v; t('lInt', v.toFixed(2)); } else if (id === 'lAmb') { L.amb = v; t('lAmb', v.toFixed(2)); }
        else if (id === 'lWarm') { L.warm = v; t('lWarm', v.toFixed(2)); } else if (id === 'lSop') { L.sop = v; t('lSop', v.toFixed(2)); } else if (id === 'lSoft') { L.soft = v; t('lSoft', v + ''); fit(); }
        if (id === 'pWH') { st.wallH = v; t('pWH', v.toFixed(1) + ' m'); } redraw();
      });
      panel.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b || !b.dataset.a) return; const a = b.dataset.a;
        if (a.startsWith('tab:')) { st.tab = a.slice(4); if (st.tab === 'planes') hint('Drag the four corners onto the floor in your photo. Drag inside the shape to move it, pinch to resize.'); else if (st.tab === 'place') hint('The model stands on the floor you marked. Drag it, pinch to scale, twist to rotate.'); else if (st.tab === 'save') hint('Slide to compare before and after, then save.'); }
        else if (a === 'addwall') { if (st.walls.length < 4) { st.walls.push(DEF_WALLS[st.walls.length].map((q) => q.slice())); hint('Wall ' + String.fromCharCode(64 + st.walls.length) + ' added. Drag its two base points onto the line where the wall meets the floor.'); } }
        else if (a === 'rmwall') st.walls.pop();
        else if (a === 'cmp') { st.cmp = st.cmp == null ? 0.5 : null; }
        else if (a === 'saveba') { await save('ba'); return; } else if (a === 'savepdf') { await save('pdf'); return; }
        else if (a === 'reset') { st.floor = DEF_FLOOR(); st.walls = []; st.pl = null; hint('Planes reset. Drag the four floor corners onto the floor.'); }
        else if (a === 'grid') st.grid = !st.grid; else if (a === 'unit') { const k = st.unit === 'm' ? 1 / 0.3048 : 0.3048; st.unit = st.unit === 'm' ? 'ft' : 'm'; st.W = +(st.W * k).toFixed(2); st.L = +(st.L * k).toFixed(2); }
        else if (a === 'fit') setScale(st.fitS || 1); else if (a.startsWith('s:')) setScale(+a.slice(2));
        else if (a === 'snap') st.snap = !st.snap; else if (a === 'tilt') st.tilt = !st.tilt;
        else if (a === 'flat') { if (st.pl) { st.pl.rot = rotAxis([0, 1, 0], Math.atan2(st.pl.rot[8], st.pl.rot[0])); S.restOnFloor(st.pl, 0); } }
        else if (a === 'snapw') { if (!st.wallPlanes.length || !st.pl) hint('Add a wall first (Planes tab).'); else { const b2 = S.baseMatrix(st.pl), mn = model.min, mx = model.max; let best = null; for (const wp of st.wallPlanes) { let lo = Infinity; for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) lo = Math.min(lo, S.dot(S.sub(S.xform(b2, [x, y, z]), wp.p), wp.n)); if (!best || Math.abs(lo) < Math.abs(best.lo)) best = { wp, lo }; } st.pl.pos[0] -= best.wp.n[0] * best.lo; st.pl.pos[2] -= best.wp.n[2] * best.lo; } }
        else if (a === 'auto') estimateLight();
        else if (a === 'save') await save();
        renderPanel(); redraw();
      });

      // ----- gestures -----
      const loupe = document.createElement('canvas'); loupe.width = loupe.height = 240; loupe.style.cssText = 'position:fixed;width:120px;height:120px;border-radius:60px;border:2px solid #ffb224;box-shadow:0 6px 20px rgba(0,0,0,.5);display:none;pointer-events:none;z-index:6;background:#000'; ui.appendChild(loupe);
      const showLoupe = (q) => { const r = wrap.getBoundingClientRect(), im = $('#phImg'); if (!im.naturalWidth) return; const sx = r.left + q[0] * r.width, sy = r.top + q[1] * r.height; loupe.style.display = 'block'; let ly = sy - 170; if (ly < 60) ly = sy + 50; loupe.style.left = Math.max(4, Math.min(innerWidth - 124, sx - 60)) + 'px'; loupe.style.top = ly + 'px';
        const c = loupe.getContext('2d'), fw = 40 / r.width, fh = 40 / r.height; c.clearRect(0, 0, 240, 240); for (const el of [im, shCv, glCv]) { const nw = el.naturalWidth || el.width, nh = el.naturalHeight || el.height; try { c.drawImage(el, (q[0] - fw / 2) * nw, (q[1] - fh / 2) * nh, fw * nw, fh * nh, 0, 0, 240, 240); } catch (e) {} }
        c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(120, 100); c.lineTo(120, 140); c.moveTo(100, 120); c.lineTo(140, 120); c.stroke(); };
      const inPoly = (q, x, y) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > y) !== (q[j][1] > y) && x < ((q[j][0] - q[i][0]) * (y - q[i][1])) / (q[j][1] - q[i][1]) + q[i][0]) c = !c; return c; };
      const near = (arr, p, r) => { let bi = -1, bd = r; arr.forEach((q, i) => { const d = Math.hypot(q[0] * p.w - p.x, q[1] * p.h - p.y); if (d < bd) { bd = d; bi = i; } }); return bi; };
      const pos01 = (p) => [Math.min(1, Math.max(0, p.x / p.w)), Math.min(1, Math.max(0, p.y / p.h))];
      S.gestures($('#phGest'), {
        down(p) {
          st.drag = null; st.ring = -1;
          if (st.tab === 'planes') { let bd = 34, hit = null; for (const arr of [st.floor, ...st.walls]) { const i = near(arr, p, bd); if (i >= 0) { bd = Math.hypot(arr[i][0] * p.w - p.x, arr[i][1] * p.h - p.y); hit = { type: 'dot', arr, i }; } } st.drag = hit; if (!hit && inPoly(st.floor, p.x / p.w, p.y / p.h)) st.drag = { type: 'moveall', last: [p.x / p.w, p.y / p.h] }; if (hit) showLoupe(hit.arr[hit.i]); return; }
          if (st.tab !== 'place' || !st.pl || !st.cam) return;
          const pl = st.pl, ray = rayAt(p), Rr = S.gizmoRadius(pl), floorC = [pl.pos[0], 0, pl.pos[2]], ring = S.gizmoPick(ray, floorC, pl.pos, Rr, st.tilt);
          if (ring >= 0) { const c = ring === 0 ? floorC : pl.pos; st.ring = ring; st.drag = { type: 'ring', ax: ring, c, a: S.ringAngle(ray, c, ring), acc: 0, rot0: Float32Array.from(pl.rot) }; }
          else { const h = floorHit(p); if (h) st.drag = { type: 'move', last: h }; }
        },
        move(p) {
          const d = st.drag; if (!d) return;
          if (d.type === 'dot') { d.arr[d.i] = pos01(p); redraw(); showLoupe(d.arr[d.i]); return; }
          if (d.type === 'moveall') { const x = p.x / p.w, y = p.y / p.h, dx = x - d.last[0], dy = y - d.last[1]; st.floor = st.floor.map((q) => [Math.min(1, Math.max(0, q[0] + dx)), Math.min(1, Math.max(0, q[1] + dy))]); d.last = [x, y]; redraw(); return; }
          const pl = st.pl; if (!pl) return;
          if (d.type === 'ring') { const a = S.ringAngle(rayAt(p), d.c, d.ax); if (a == null) return; d.acc += S.wrap(a - d.a); d.a = a; const ang = st.snap ? Math.round(d.acc / SNAP) * SNAP : d.acc; pl.rot = mul(rotAxis(S.AXES[d.ax], ang), d.rot0); if (S.isUpright(pl)) S.restOnFloor(pl, 0); }
          else { const h = floorHit(p); if (!h) return; pl.pos[0] += h[0] - d.last[0]; pl.pos[2] += h[2] - d.last[2]; d.last = h; }
          render();
        },
        up() { st.drag = null; st.ring = -1; loupe.style.display = 'none'; render(); },
        pinch(ratio, dAng) { if (st.tab === 'planes') { const w = st.w, h = st.h, cx = st.floor.reduce((a, q) => a + q[0], 0) / 4, cy = st.floor.reduce((a, q) => a + q[1], 0) / 4, cs = Math.cos(dAng), sn = Math.sin(dAng); st.floor = st.floor.map((q) => { const x = (q[0] - cx) * w * ratio, y = (q[1] - cy) * h * ratio; return [Math.min(1, Math.max(0, cx + (x * cs - y * sn) / w)), Math.min(1, Math.max(0, cy + (x * sn + y * cs) / h))]; }); redraw(); return; } if (st.tab !== 'place' || !st.pl) return; setScale(st.pl.scale * ratio); st.pl.rot = mul(rotAxis([0, 1, 0], -dAng), st.pl.rot); render(); },
        tap() {}
      });

      // ----- save -----
      const save = async (mode) => {
        if (!st.cam) { hint('Mark the floor first.'); return; }
        const out = document.createElement('canvas'); out.width = st.w; out.height = st.h; const o = out.getContext('2d');
        o.drawImage(st.img, 0, 0); render(true);
        o.filter = `blur(${st.light.soft}px)`; o.drawImage(shCv, 0, 0); o.filter = 'none'; o.drawImage(glCv, 0, 0); // same task: the GL buffer is still valid
        let fin = out; if (mode === 'ba' && st.cmp != null) { fin = document.createElement('canvas'); fin.width = st.w; fin.height = st.h; const f = fin.getContext('2d'), x0 = Math.round(st.cmp * st.w); f.drawImage(st.img, 0, 0); f.drawImage(out, x0, 0, st.w - x0, st.h, x0, 0, st.w - x0, st.h);
          const u = Math.max(1, st.w / 600); f.fillStyle = '#fff'; f.fillRect(x0 - u, 0, 2 * u, st.h); f.font = `600 ${14 * u}px system-ui,sans-serif`; f.textBaseline = 'top';
          for (const [t, x, al] of [['Before', x0 - 10 * u, 'right'], ['After', x0 + 10 * u, 'left']]) { f.textAlign = al; const w = f.measureText(t).width; f.fillStyle = 'rgba(0,0,0,.55)'; f.fillRect(al === 'right' ? x - w - 8 * u : x - 8 * u, 8 * u, w + 16 * u, 26 * u); f.fillStyle = '#fff'; f.fillText(t, x, 13 * u); } }
        if (mode === 'pdf') { await window.__scadFile.save(window.__scadFile.pdf([{ canvas: out }]), 'S-CAD-in-photo.pdf'); hint('Saved.'); render(); return; }
        const blob = await new Promise((r) => fin.toBlob(r, 'image/png')); const name = mode === 'ba' ? 'S-CAD-before-after.png' : 'S-CAD-in-photo.png';
        let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) {}
        if (dl) await dl.save({ filename: name, data: blob });
        else { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000); }
        hint('Saved.'); render();
      };

      window.__PHOTO = { st, loadPhoto, redraw, render, model, estimateLight };
    } catch (e) { alert('Place in photo could not start: ' + (e && e.message ? e.message : e)); console.error(e); cleanup(); busy = false; if (ui) ui.remove(); }
  }

  // ---------- toolbar button ----------
  function addButton() {
    const host = document.querySelector('.tools') || document.body, b = document.createElement('button');
    b.className = 'btn'; b.id = 'photoBtn'; b.type = 'button'; b.textContent = 'Photo'; b.hidden = true; b.title = 'Place this model in a photo'; b.onclick = openPhoto; host.appendChild(b);
    const sync = () => { b.hidden = document.documentElement.getAttribute('data-mode') !== 'skp'; };
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] }); sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
