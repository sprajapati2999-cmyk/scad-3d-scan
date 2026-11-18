// WebXR augmented reality for S-CAD (Chrome on Android with Google Play Services for AR, https only).
// Place the open 3D model in the real world: pinch/drag/twist, rotation gizmo, ground shadow,
// measure, walk inside at 1:1 with a minimap, and a sun and shadow study.
(() => {
  'use strict';
  const S = window.__S3D, XR = navigator.xr;
  if (!S || !XR || !XR.isSessionSupported) return;
  const { mul, trans, scal, rotAxis, xform, inv4 } = S;
  const D2R = Math.PI / 180, SNAP = 15 * D2R;

  // ---------- minimap data: wall segments + detected floor levels ----------
  function buildMini(model) {
    const segs = [], buckets = new Map();
    for (const { d, m } of model.draws) {
      const P = d.pos, idx = d.idx, vn = P.length / 3, w = new Float32Array(P.length);
      for (let i = 0; i < vn; i++) { const q = xform(m, [P[i*3], P[i*3+1], P[i*3+2]]); w[i*3] = q[0]; w[i*3+1] = q[1]; w[i*3+2] = q[2]; }
      const stride = Math.max(1, Math.floor(idx.length / 3 / 400000));
      for (let t = 0; t + 2 < idx.length; t += 3 * stride) {
        const a = idx[t] * 3, b = idx[t+1] * 3, c = idx[t+2] * 3;
        const ux = w[b]-w[a], uy = w[b+1]-w[a+1], uz = w[b+2]-w[a+2], vx = w[c]-w[a], vy = w[c+1]-w[a+1], vz = w[c+2]-w[a+2];
        const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx, l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue;
        const nyy = ny / l;
        if (Math.abs(nyy) < 0.3) {
          const pts = [[w[a], w[a+2]], [w[b], w[b+2]], [w[c], w[c+2]]]; let bi = 0, bj = 1, bd = -1;
          for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const dd = Math.hypot(pts[i][0]-pts[j][0], pts[i][1]-pts[j][1]); if (dd > bd) { bd = dd; bi = i; bj = j; } }
          if (bd > 0.01) segs.push(pts[bi][0], pts[bi][1], pts[bj][0], pts[bj][1], Math.min(w[a+1], w[b+1], w[c+1]), Math.max(w[a+1], w[b+1], w[c+1]));
        } else if (nyy > 0.9) { const k = Math.round(((w[a+1] + w[b+1] + w[c+1]) / 3) * 10); buckets.set(k, (buckets.get(k) || 0) + (l / 2) * stride); }
      }
    }
    let maxA = 0; for (const v of buckets.values()) maxA = Math.max(maxA, v);
    const cand = [...buckets.entries()].filter(([, v]) => v > 0.08 * maxA).sort((p, q) => q[1] - p[1]), levels = [];
    for (const [k] of cand) { const y = k / 10; if (levels.every((l) => Math.abs(l - y) > 1.8)) levels.push(y); }
    levels.sort((p, q) => p - q); if (!levels.length) levels.push(model.min[1]);
    return { segs: new Float32Array(segs), levels };
  }

  // ---------- AR session ----------
  async function startAR() {
    if (!S.has3d()) { alert('Open a 3D model first'); return; }
    if (!window.isSecureContext) { alert('AR needs this page to be opened from a secure https:// web address. You opened it from a file on the phone, which Chrome does not allow for AR. Put the file on a free site such as GitHub Pages and open that link instead.'); return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Preparing AR…';
    let ui, session, gl, R, model, canvas;
    try {
      const glb = await S.glb();
      canvas = document.createElement('canvas');
      gl = canvas.getContext('webgl2', { xrCompatible: true, alpha: true, antialias: true, depth: true }); if (!gl) throw new Error('WebGL 2 is not available');
      if (gl.makeXRCompatible) { try { await gl.makeXRCompatible(); } catch (e) { console.warn('makeXRCompatible', e); } }
      R = S.makeRenderer(gl); model = await R.build(glb);

      const fitS = 0.5 / Math.max(model.size[0], model.size[2], 1e-6);
      const off0 = -new Date().getTimezoneOffset() / 60, saved = S.store.get('scad-sun', null);
      const st = { mode: 'place', pl: null, hit: null, tilt: false, snap: true, joy: [0, 0], sizeOpen: false, more: false, sunEdit: null, origin: null, markO: false, walls: [], pend: null, marking: false, run: false, lefty: false, lastT: 0, floorY: 0, viewer: [0, 0, 0], fwd: [0, 0, -1], VP: null, invVP: null, meas: [], walk: null, mini: null, cutY: 0, drag: null, ring: -1, y0: null,
        sunOn: false, sun: Object.assign({ lat: 20, lon: Math.round(off0 * 15), off: off0, date: new Date().toISOString().slice(0, 10), hour: 12, north: 0 }, saved || {}) };
      st.sun.date = new Date().toISOString().slice(0, 10);

      ui = document.createElement('div'); ui.id = 'arUI';
      ui.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:14px system-ui,sans-serif;color:#fff;z-index:2147483000;touch-action:none';
      ui.innerHTML = `<style>
        #arUI button{padding:10px 14px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(255,255,255,.08);color:#f4f5f7;font:500 14px Inter,system-ui,sans-serif}
        #arUI button.on{background:linear-gradient(135deg,#ffc247,#ff9d1f);border-color:transparent;color:#1a1206;font-weight:700;box-shadow:0 4px 14px rgba(255,160,30,.4)} #arUI .row{display:flex;flex-wrap:wrap;gap:7px;justify-content:center}
        #arUI .card{pointer-events:auto;padding:14px;border-radius:26px;background:rgba(26,30,36,.66);-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 30px rgba(0,0,0,.35)}
        #arUI #arBar{flex-wrap:nowrap;gap:2px;padding:6px;border-radius:30px;background:rgba(26,30,36,.66);-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 30px rgba(0,0,0,.35)} #arUI #arBar button{flex:1;border:0;background:none;padding:12px 4px;border-radius:24px;box-shadow:none;color:rgba(244,245,247,.78)} #arUI #arBar button.on{background:linear-gradient(135deg,#ffc247,#ff9d1f);color:#1a1206} #arUI #arBar button[data-x]{background:rgba(179,38,30,.85)!important;color:#fff;flex:0 0 64px}
        #arUI .g{background:rgba(26,30,36,.66);-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 30px rgba(0,0,0,.35);color:#f4f5f7}
        #arUI .rb{width:48px;height:48px;padding:0;border-radius:24px;font-size:18px;display:grid;place-items:center}
        #arUI .row button:not(.on){background:rgba(26,30,36,.7);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)} #arUI #arBar button:not(.on){background:none!important;backdrop-filter:none;-webkit-backdrop-filter:none}
        #arUI.clean #arTop,#arUI.clean #arPanel,#arUI.clean #arBar,#arUI.clean #arMini,#arUI.clean #arJoy,#arUI.clean #arMsg{visibility:hidden} #arUI.clean #arShow{display:block}
        #arUI #sHourT{font-size:26px;letter-spacing:-.03em}
        #arUI label{display:flex;align-items:center;gap:8px;font-size:13px;margin:4px 0} #arUI input[type=range]{flex:1;min-width:0}
        #arUI input[type=number],#arUI input[type=date]{width:92px;padding:6px;border-radius:8px;border:0;background:#fff;color:#111}
        #arUI .lab{min-width:74px;opacity:.9}
      </style>
      <div id="arGest" style="position:absolute;inset:0;pointer-events:auto;touch-action:none"></div>
      <div id="arTop" style="position:absolute;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));display:flex;gap:10px;align-items:center;pointer-events:none"><button id="arX" class="g rb" aria-label="Exit AR" style="pointer-events:auto">&#x2715;</button><div id="arTitle" class="g" style="flex:1;height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600">Place</div><button id="arEye" class="g rb" aria-label="Clean view for screenshots" style="pointer-events:auto"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button><button id="arTR" class="g" style="pointer-events:auto;height:48px;min-width:48px;border-radius:24px;display:none"></button></div>
      <button id="arShow" class="g" style="position:absolute;left:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));height:44px;padding:0 16px;border-radius:22px;display:none;pointer-events:auto;font:500 13px system-ui;transition:opacity .6s">Show controls</button>
      <div id="arMsg" class="g" style="position:absolute;left:18px;right:18px;top:calc(72px + env(safe-area-inset-top,0px));padding:9px 14px;border-radius:18px;text-align:center;pointer-events:none;font-size:13px;line-height:1.35">Move your phone slowly to find the floor or a table, then tap to place the model.</div>
      <canvas id="arMini" width="336" height="336" style="position:absolute;right:12px;top:138px;width:168px;height:168px;border-radius:16px;pointer-events:auto;display:none;touch-action:none"></canvas>
      <div id="arJoy" style="position:absolute;left:22px;bottom:205px;width:132px;height:132px;border-radius:66px;background:rgba(26,30,36,.55);border:1px solid rgba(255,255,255,.2);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);display:none;pointer-events:auto;touch-action:none"><div style="position:absolute;inset:14px;border-radius:50%;border:1.5px dashed rgba(255,255,255,.25)"></div><div id="arJoyK" style="position:absolute;left:38px;top:38px;width:56px;height:56px;border-radius:28px;background:linear-gradient(135deg,#ffc247,#ff9d1f);box-shadow:0 6px 16px rgba(255,160,30,.45)"></div></div>
      <div id="arMeas" style="position:absolute;padding:4px 9px;border-radius:9px;background:rgba(13,17,20,.88);display:none;transform:translate(-50%,-140%);white-space:nowrap;font-weight:600"></div>
      <div style="position:absolute;left:8px;right:8px;bottom:12px;display:flex;flex-direction:column;gap:8px;pointer-events:none">
        <div id="arPanel" class="card" style="align-self:stretch"></div>
        <div id="arBar" class="row" style="pointer-events:auto">
          <button data-m="place" class="on">Place</button><button data-m="measure">Measure</button><button data-m="walk">Walk</button><button data-m="sun">Sun</button>
        </div>
      </div>`;
      document.body.appendChild(ui);
      ui.addEventListener('beforexrselect', (e) => e.preventDefault());
      const $ = (q) => ui.querySelector(q), msg = $('#arMsg'), panel = $('#arPanel'), mini = $('#arMini'), joy = $('#arJoy'), joyK = $('#arJoyK'), measEl = $('#arMeas');

      const tries = [
        { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: ui } },
        { requiredFeatures: ['hit-test'], optionalFeatures: ['local-floor'] },
        { optionalFeatures: ['hit-test', 'dom-overlay', 'local-floor'], domOverlay: { root: ui } },
        {}
      ];
      let lastErr;
      for (const opt of tries) { try { session = await XR.requestSession('immersive-ar', opt); break; } catch (e) { lastErr = e; } }
      if (!session) throw lastErr || new Error('AR session refused');
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl), depthNear: 0.02 });
      let ref, haveFloor = false;
      try { ref = await session.requestReferenceSpace('local-floor'); haveFloor = true; } catch (e) { ref = await session.requestReferenceSpace('local'); }
      let hitSource = null;
      try { const viewer = await session.requestReferenceSpace('viewer'); if (session.requestHitTestSource) hitSource = await session.requestHitTestSource({ space: viewer }); } catch (e) { hitSource = null; }
      if (window.__AR_DEBUG) { canvas.width = 390; canvas.height = 720; canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147482999;background:#789'; document.body.appendChild(canvas); window.__AR_ST = st; }
      if (!hitSource) msg.textContent = 'Surface detection is unavailable here, so the model goes on an estimated floor in front of you. Tap to place it.';

      // ----- helpers -----
      const say = (t) => { msg.textContent = t; };
      const ndc = (p) => [p.x / p.w * 2 - 1, 1 - p.y / p.h * 2];
      const rayAt = (p) => { const [x, y] = ndc(p); return S.rayFrom(st.invVP, x, y); };
      const floorHit = (p) => S.planeHit(rayAt(p), [0, st.floorY, 0], [0, 1, 0]);
      const setScale = (s) => { const pl = st.pl; if (!pl) return; const up = S.isUpright(pl); pl.scale = Math.min(Math.max(s, 1e-3), 200); if (up) S.restOnFloor(pl, st.floorY); syncScale(); };
      const scaleLabel = (v) => v >= 0.995 ? (v >= 10 ? Math.round(v) : +v.toFixed(2)) + '×' : '1:' + Math.round(1 / v);
      const scalePos = (v) => Math.min(1, Math.max(0, (Math.log10(v) + 3) / 4.3));
      const syncScale = () => { const r = ui && ui.querySelector('#sScale'), t = ui && ui.querySelector('#sScaleT'); if (st.pl) { if (r) r.value = Math.round(scalePos(st.pl.scale) * 1000); if (t) t.textContent = scaleLabel(st.pl.scale); }  const tr = ui && ui.querySelector('#arTR'); if (tr && st.mode === 'place' && st.pl) tr.textContent = scaleLabel(st.pl.scale) + ' ▾'; };
      const placeAt = (h) => {
        st.floorY = h[1];
        if (!st.pl) { st.pl = S.newPlacement(model, [h[0], h[1], h[2]], fitS); S.restOnFloor(st.pl, st.floorY); say('Placed. Drag to move, pinch to scale, twist with two fingers or drag the ring to rotate.'); }
        else { st.pl.pos[0] = h[0]; st.pl.pos[2] = h[2]; if (S.isUpright(st.pl)) S.restOnFloor(st.pl, st.floorY); }
        syncScale();
      };
      const sunNow = () => { const s = st.sun, [y, m, d] = s.date.split('-').map(Number); const utc = Date.UTC(y, m - 1, d, 0, 0) + (s.hour - s.off) * 3600000; return S.sunPos(new Date(utc), s.lat, s.lon); };
      const refreshSun = () => { const p = sunNow(); st.sunAz = p.az; st.sunEl = p.el; const e = $('#sunInfo'); if (e) e.textContent = `Sun: ${(p.az / D2R).toFixed(0)}° azimuth, ${(p.el / D2R).toFixed(0)}° high${p.el <= 0 ? ' (below the horizon)' : ''}`; S.store.set('scad-sun', { lat: st.sun.lat, lon: st.sun.lon, off: st.sun.off, hour: st.sun.hour, north: st.sun.north }); };

      // ----- panels per mode -----
      const chip = (a, t, on) => `<button data-a="${a}"${on ? ' class="on"' : ''}>${t}</button>`;
      const TITLES = { place: 'Place', measure: 'Measure', walk: 'Walk', sun: 'Sun' };
      const setTop = () => { $('#arTitle').textContent = st.mode === 'sun' ? 'Sun · ' + new Date(st.sun.date + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : TITLES[st.mode]; const tr = $('#arTR');
        if (st.mode === 'place') { tr.style.display = 'block'; tr.textContent = (st.pl ? scaleLabel(st.pl.scale) : '–') + ' ▾'; tr.className = 'g' + (st.sizeOpen ? ' on' : ''); } else if (st.mode === 'walk') { tr.style.display = 'block'; tr.textContent = st.run ? 'Run' : 'Walk'; tr.className = 'g'; } else tr.style.display = 'none'; };
      const renderPanel0 = () => {
        let card = false;
        if (st.mode === 'place') {
          let h = `<div class="row">${chip('snap', 'Snap 15°', st.snap)}${chip('tilt', 'Tilt', st.tilt)}${chip('flat', 'Level')}${chip('fit', 'Fit')}</div>`;
          if (st.sizeOpen) { card = true; h = `<label><span class="lab" style="min-width:46px">Size</span><input id="sScale" type="range" min="0" max="1000" step="1" value="${st.pl ? Math.round(scalePos(st.pl.scale) * 1000) : 500}"><b id="sScaleT" style="min-width:54px;text-align:right">${st.pl ? scaleLabel(st.pl.scale) : '–'}</b></label><div class="row">${chip('s:1', '1:1')}${chip('s:0.02', '1:50')}${chip('s:0.01', '1:100')}${chip('s:0.005', '1:200')}</div>
            <div class="row" style="margin:7px 0 10px">${st.walls.length < 4 ? chip('addwall', st.marking ? 'Tap 2 floor points…' : '+ Wall (' + st.walls.length + '/4)', st.marking) : ''}${st.walls.length ? chip('snapw', 'Snap to wall') + chip('clrwall', 'Clear walls') : ''}</div>` + h; }
          panel.innerHTML = h;
        } else if (st.mode === 'measure') panel.innerHTML = `<div class="row">${chip('undo', 'Undo')}${chip('clear', 'Clear')}</div>`;
        else if (st.mode === 'walk') {
          const lv = st.mini ? st.mini.levels : [];
          let h = `<div class="row">${lv.length > 1 ? lv.map((y, i) => chip('lv:' + i, 'Level ' + (i + 1), Math.abs(st.cutY - (y + 1.2)) < 0.05)).join('') : ''}${chip('lefty', '⇄ Left hand', st.lefty)}${chip('mz+', 'Map +')}${chip('mz-', 'Map −')}${chip('more', 'Origin ▾', st.more)}</div>`;
          if (st.more) { card = true; h = `<div class="row" style="margin-bottom:8px">${chip('setO', 'Set origin here')}${chip('markO', 'Mark on map', st.markO)}${st.origin ? chip('goO', 'Go to origin') + chip('clrO', 'Clear') : ''}${chip('map', 'Map: ' + (mini.style.display === 'none' ? 'off' : 'on'))}</div>` + h; }
          panel.innerHTML = h;
        } else if (st.mode === 'sun') {
          card = true; const s = st.sun, e = st.sunEdit;
          panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><b id="sHourT">${fmtHour(s.hour)}</b><span id="sunInfo" class="lab"></span></div>
            <label style="margin:8px 0"><input id="sHour" type="range" min="0" max="24" step="0.25" value="${s.hour}"></label>
            <div class="row">${chip('sunon', 'Sun light: ' + (st.sunOn ? 'on' : 'off'), st.sunOn)}${chip('sunedit:date', 'Date', e === 'date')}${chip('sunedit:place', 'Place', e === 'place')}${chip('sunedit:north', 'North ' + Math.round(s.north / D2R) + '°', e === 'north')}</div>
            ${e === 'date' ? `<label><span class="lab">Date</span><input id="sDate" type="date" value="${s.date}"><span class="lab" style="min-width:0">UTC+</span><input id="sOff" type="number" step="0.5" value="${s.off}" style="width:60px"></label>` : ''}
            ${e === 'place' ? `<label><span class="lab">Latitude</span><input id="sLat" type="number" step="0.1" value="${s.lat}"><span class="lab" style="min-width:0">Lon</span><input id="sLon" type="number" step="0.1" value="${s.lon}"></label><div class="row">${chip('geo', 'Use my location')}</div>` : ''}
            ${e === 'north' ? `<label><span class="lab">North</span><input id="sNorth" type="range" min="0" max="360" step="1" value="${Math.round(s.north / D2R)}"><b id="sNorthT" style="min-width:48px">${Math.round(s.north / D2R)}°</b></label><div class="row">${chip('align', 'North = model north')}</div>` : ''}`;
          refreshSun();
        }
        panel.className = card ? 'card' : ''; panel.style.alignSelf = 'stretch'; setTop();
      };
      const renderPanel = () => { renderPanel0(); if (st.walk) setTimeout(placeJoy, 0); };
      const fmtHour = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${String(hh % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`; };
      panel.addEventListener('input', (e) => {
        const s = st.sun, id = e.target.id;
        if (id === 'sScale') { if (st.pl) setScale(Math.pow(10, -3 + (e.target.value / 1000) * 4.3)); return; }
        if (id === 'sDate') s.date = e.target.value || s.date; else if (id === 'sOff') s.off = +e.target.value || 0; else if (id === 'sLat') s.lat = Math.max(-90, Math.min(90, +e.target.value || 0)); else if (id === 'sLon') s.lon = Math.max(-180, Math.min(180, +e.target.value || 0));
        else if (id === 'sHour') { s.hour = +e.target.value; $('#sHourT').textContent = fmtHour(s.hour); } else if (id === 'sNorth') { s.north = +e.target.value * D2R; $('#sNorthT').textContent = Math.round(s.north / D2R) + '°'; }
        refreshSun();
      });

      // ----- walk mode -----
      const startWalk = async () => {
        if (!st.mini) { await new Promise((r) => setTimeout(r, 30)); st.mini = buildMini(model); }
        const first = !st.walk;
        if (first) {
          if (!st.pl) { st.pl = S.newPlacement(model, st.viewer, 1); }
          st.walk = { scale: st.pl.scale, pos: st.pl.pos.slice(), rot: Float32Array.from(st.pl.rot), floorY: st.floorY };
          if (!st.hit || st.hit[1] > st.viewer[1] - 0.3) st.floorY = haveFloor ? 0 : (st.y0 ?? st.viewer[1]) - 1.4; else st.floorY = st.hit[1];
          const pl = st.pl; pl.scale = 1; pl.rot = S.I(); pl.pos = [st.viewer[0], 0, st.viewer[2]];
          st.cutY = st.mini.levels[0] + 1.2; shiftToLevel(st.mini.levels[0]);
        }
        mini.style.display = 'block'; joy.style.display = 'block'; applyJoy(); say('Walk inside the model at full size. Use the stick to move, turn your phone to look around.'); renderPanel();
      };
      const placeJoy = () => { const pn = $('#arPanel'), bar = $('#arBar'); let top = innerHeight; for (const e of [pn, bar]) if (e && e.offsetHeight) top = Math.min(top, e.getBoundingClientRect().top); joy.style.bottom = Math.max(12, innerHeight - top + 14) + 'px'; };
      const applyJoy = () => { placeJoy(); joy.style.left = st.lefty ? 'auto' : '22px'; joy.style.right = st.lefty ? '22px' : 'auto'; mini.style.right = st.lefty ? 'auto' : '12px'; mini.style.left = st.lefty ? '12px' : 'auto'; };
      addEventListener('resize', () => { if (st.walk) placeJoy(); });
      let joyId = null;
      const joyMove = (e) => { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / 46, y = (e.clientY - r.top - r.height / 2) / 46, m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } st.joy = [x, y]; joyK.style.transform = `translate(${x * 46}px,${y * 46}px)`; };
      joy.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); joyId = e.pointerId; try { joy.setPointerCapture(joyId); } catch (er) {} joyMove(e); });
      joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) { e.preventDefault(); joyMove(e); } });
      const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; st.joy = [0, 0]; joyK.style.transform = ''; };
      joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
      const endWalk = () => { if (!st.walk) return; const w = st.walk; st.pl.scale = w.scale; st.pl.pos = w.pos; st.pl.rot = w.rot; st.floorY = w.floorY; st.walk = null; mini.style.display = 'none'; joy.style.display = 'none'; st.joy = [0, 0]; };
      const shiftToLevel = (lvY) => { const pl = st.pl, b = S.baseMatrix(pl), wy = xform(b, [0, lvY, 0])[1]; pl.pos[1] += st.floorY - wy; };
      const jumpTo = (x, z) => { const pl = st.pl, w = xform(S.baseMatrix(pl), [x, st.cutY, z]); pl.pos[0] += st.viewer[0] - w[0]; pl.pos[2] += st.viewer[2] - w[2]; };

      const miniXf = () => { const mn = model.min, mx = model.max, pad = 14, z = st.mz || 1, k = ((336 - 2 * pad) / Math.max(mx[0] - mn[0], mx[2] - mn[2], 1e-6)) * z; let cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2; if (z > 1.001 && st.walk && st.pl) { const p = xform(inv4(S.baseMatrix(st.pl)), st.viewer); cx = p[0]; cz = p[2]; } const o = (168 - pad) / k; return { k, pad, mn: [cx - o, 0, cz - o] }; };
      const drawMini = () => {
        if (!st.mini || mini.style.display === 'none') return; const c = mini.getContext('2d'), { k, pad, mn } = miniXf(), sg = st.mini.segs;
        c.clearRect(0, 0, 336, 336); c.fillStyle = 'rgba(13,17,20,.78)'; c.fillRect(0, 0, 336, 336);
        c.strokeStyle = '#d7dde2'; c.lineWidth = 1.5; c.beginPath();
        for (let i = 0; i < sg.length; i += 6) { if (st.cutY < sg[i+4] - 0.05 || st.cutY > sg[i+5] + 0.05) continue; c.moveTo(pad + (sg[i] - mn[0]) * k, pad + (sg[i+1] - mn[2]) * k); c.lineTo(pad + (sg[i+2] - mn[0]) * k, pad + (sg[i+3] - mn[2]) * k); }
        c.stroke();
        c.strokeStyle = 'rgba(232,163,58,.55)'; c.lineWidth = 2; c.strokeRect(pad + (model.min[0] - mn[0]) * k, pad + (model.min[2] - mn[2]) * k, (model.max[0] - model.min[0]) * k, (model.max[2] - model.min[2]) * k);
        if (st.origin) { const ox = pad + (st.origin.x - mn[0]) * k, oy = pad + (st.origin.z - mn[2]) * k; c.strokeStyle = '#38c6d9'; c.lineWidth = 3; c.beginPath(); c.arc(ox, oy, 11, 0, 7); c.moveTo(ox - 17, oy); c.lineTo(ox + 17, oy); c.moveTo(ox, oy - 17); c.lineTo(ox, oy + 17); c.stroke(); }
        const ib = inv4(S.baseMatrix(st.pl)), p = xform(ib, st.viewer), f = S.xdir(ib, st.fwd), px = pad + (p[0] - mn[0]) * k, py = pad + (p[2] - mn[2]) * k, ang = Math.atan2(f[2], f[0]);
        c.fillStyle = 'rgba(232,163,58,.45)'; c.beginPath(); c.moveTo(px, py); c.arc(px, py, 46, ang - 0.5, ang + 0.5); c.closePath(); c.fill();
        c.fillStyle = '#e8a33a'; c.beginPath(); c.arc(px, py, 7, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
      };
      const mptr = new Map(); let mpd = 0, mmoved = false;
      const setMZ = (z) => { st.mz = Math.min(10, Math.max(1, z)); };
      mini.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { mini.setPointerCapture(e.pointerId); } catch (er) {} mptr.set(e.pointerId, [e.clientX, e.clientY]); if (mptr.size === 2) { const a = [...mptr.values()]; mpd = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); mmoved = true; } else mmoved = false; });
      mini.addEventListener('pointermove', (e) => { if (!mptr.has(e.pointerId)) return; mptr.set(e.pointerId, [e.clientX, e.clientY]); if (mptr.size === 2) { const a = [...mptr.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if (mpd > 0) setMZ((st.mz || 1) * d / mpd); mpd = d; mmoved = true; } });
      const mUp = (e) => {
        if (!mptr.has(e.pointerId)) return; const wasOne = mptr.size === 1 && !mmoved; mptr.delete(e.pointerId); if (!wasOne || !st.walk || e.type === 'pointercancel') return;
        const r = mini.getBoundingClientRect(), { k, pad, mn } = miniXf();
        const mx2 = mn[0] + ((e.clientX - r.left) / r.width * 336 - pad) / k, mz2 = mn[2] + ((e.clientY - r.top) / r.height * 336 - pad) / k;
        if (st.markO) { st.origin = { x: mx2, z: mz2, cutY: st.cutY }; st.markO = false; say('Origin marked. Use Go to origin any time.'); renderPanel(); } else jumpTo(mx2, mz2);
      };
      mini.addEventListener('pointerup', mUp); mini.addEventListener('pointercancel', mUp);
      mini.addEventListener('wheel', (e) => { e.preventDefault(); setMZ((st.mz || 1) * (e.deltaY < 0 ? 1.25 : 0.8)); }, { passive: false });

      // ----- buttons -----
      ui.querySelector('#arBar').addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-x')) { session.end(); return; }
        const m = b.dataset.m; if (!m) return;
        if (st.mode === 'walk' && m !== 'walk') endWalk();
        st.mode = m; ui.querySelectorAll('#arBar [data-m]').forEach((x) => x.classList.toggle('on', x.dataset.m === m));
        if (m === 'walk') { if (!st.pl) { say('Place the model first, then tap Walk.'); st.mode = 'place'; ui.querySelectorAll('#arBar [data-m]').forEach((x) => x.classList.toggle('on', x.dataset.m === 'place')); renderPanel(); return; } renderPanel(); await startWalk(); }
        else { renderPanel(); say(m === 'measure' ? 'Measure: aim the ring and tap.' : m === 'sun' ? 'Sun study: set date, time, place and north. Turn Sun light on.' : st.pl ? 'Drag to move, pinch to scale.' : 'Tap to place the model.'); }
      });
      $('#arX').addEventListener('click', () => session.end());
      { const sh = $('#arShow'); let tm = 0; $('#arEye').addEventListener('click', () => { st.clean = true; ui.classList.add('clean'); sh.style.opacity = '1'; clearTimeout(tm); tm = setTimeout(() => { sh.style.opacity = '0'; }, 3200); say(''); });
        sh.addEventListener('click', (e) => { e.stopPropagation(); st.clean = false; ui.classList.remove('clean'); clearTimeout(tm); if (st.walk) placeJoy(); }); }
      $('#arTR').addEventListener('click', () => { if (st.mode === 'place') { st.sizeOpen = !st.sizeOpen; renderPanel(); } else if (st.mode === 'walk') { st.run = !st.run; renderPanel(); } });
      panel.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a; if (!a) return;
        if (a === 'more') { st.more = !st.more; renderPanel(); return; }
        if (a.startsWith('sunedit:')) { const v = a.slice(8); st.sunEdit = st.sunEdit === v ? null : v; renderPanel(); return; }
        if (a === 'fit') setScale(fitS); else if (a.startsWith('s:')) setScale(+a.slice(2));
        else if (a === 'snap') st.snap = !st.snap; else if (a === 'tilt') { st.tilt = !st.tilt; if (!st.tilt && st.pl) { const up = S.isUpright(st.pl); if (!up) { /* keep tilt, just hide rings */ } } }
        else if (a === 'addwall') { st.marking = !st.marking; st.pend = null; say(st.marking ? 'Tap the two ends of the line where the wall meets the floor.' : 'Cancelled.'); }
        else if (a === 'clrwall') { st.walls = []; st.pend = null; st.marking = false; }
        else if (a === 'snapw') { if (!st.walls.length || !st.pl) say('Add a wall first.'); else { const b2 = S.baseMatrix(st.pl), mn = model.min, mx = model.max; let best = null; for (const wp of st.walls) { let lo = Infinity; for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) lo = Math.min(lo, S.dot(S.sub(xform(b2, [x, y, z]), wp.p), wp.n)); if (!best || Math.abs(lo) < Math.abs(best.lo)) best = { wp, lo }; } st.pl.pos[0] -= best.wp.n[0] * best.lo; st.pl.pos[2] -= best.wp.n[2] * best.lo; } }
        else if (a === 'flat') { if (st.pl) { const y = Math.atan2(st.pl.rot[8], st.pl.rot[0]); st.pl.rot = rotAxis([0, 1, 0], y); S.restOnFloor(st.pl, st.floorY); } }
        else if (a === 'undo') st.meas.pop(); else if (a === 'clear') st.meas = [];
        else if (a === 'sunon') { st.sunOn = !st.sunOn; refreshSun(); }
        else if (a === 'align') { if (st.pl) { const v = S.xdir(st.pl.rot, [0, 0, -1]); st.sun.north = (Math.atan2(v[0], -v[2]) + 2 * Math.PI) % (2 * Math.PI); const e2 = $('#sNorth'); if (e2) e2.value = Math.round(st.sun.north / D2R); const t = $('#sNorthT'); if (t) t.textContent = Math.round(st.sun.north / D2R) + '°'; refreshSun(); } else say('Place the model first.'); }
        else if (a === 'geo') { if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => { st.sun.lat = +p.coords.latitude.toFixed(3); st.sun.lon = +p.coords.longitude.toFixed(3); st.sun.off = -new Date().getTimezoneOffset() / 60; renderPanel(); }, () => say('Could not read your location. Type latitude and longitude instead.'), { timeout: 8000 }); }
        else if (a.startsWith('lv:')) { const y = st.mini.levels[+a.slice(3)]; st.cutY = y + 1.2; shiftToLevel(y); }
        else if (a === 'mz+') setMZ((st.mz || 1) * 1.5); else if (a === 'mz-') setMZ((st.mz || 1) / 1.5);
        else if (a === 'setO') { if (st.walk) { const p = xform(inv4(S.baseMatrix(st.pl)), st.viewer); st.origin = { x: p[0], z: p[2], cutY: st.cutY }; st.markO = false; say('Origin set at your position.'); renderPanel(); } }
        else if (a === 'markO') { st.markO = !st.markO; say(st.markO ? 'Tap the map to mark the origin.' : 'Cancelled.'); renderPanel(); }
        else if (a === 'goO') { if (st.origin && st.walk) { st.cutY = st.origin.cutY; shiftToLevel(st.cutY - 1.2); jumpTo(st.origin.x, st.origin.z); } }
        else if (a === 'clrO') { st.origin = null; st.markO = false; renderPanel(); }
        else if (a === 'run') { st.run = !st.run; renderPanel(); } else if (a === 'lefty') { st.lefty = !st.lefty; applyJoy(); renderPanel(); } else if (a === 'map') mini.style.display = mini.style.display === 'none' ? 'block' : 'none';
        if (a !== 'geo') renderPanel();
      });

      // ----- gestures on the camera view -----
      const gestEl = $('#arGest'), tapAt = () => {
        const h = st.hit; if (!h) { say('No surface found yet. Move the phone slowly.'); return; }
        if (st.marking && st.mode === 'place') { if (!st.pend) { st.pend = h.slice(); say('Now tap where the wall ends on the floor.'); return; } const a = st.pend, b = h.slice(); st.pend = null; const d = S.sub(b, a); if (Math.hypot(d[0], d[2]) < 0.15) { say('Those points are too close. Tap the other end of the wall.'); st.pend = a; return; } let n = S.norm(S.cross([0, 1, 0], d)); if (S.dot(n, S.sub(st.viewer, a)) < 0) n = S.mulv(n, -1); st.walls.push({ p: a, n, a, b }); st.marking = false; say('Wall ' + st.walls.length + ' set. Shadows will fall on it and Snap to wall uses it.'); renderPanel(); return; }
        if (st.mode === 'measure') { if (st.meas.length >= 2) st.meas = []; st.meas.push(h.slice()); return; }
        if (st.mode === 'place') placeAt(h);
      };
      S.gestures(gestEl, {
        down(p) {
          st.drag = null; st.ring = -1; if (st.mode !== 'place' || !st.pl || !st.VP) return;
          const pl = st.pl, ray = rayAt(p), Rr = S.gizmoRadius(pl), floorC = [pl.pos[0], st.floorY, pl.pos[2]], ring = S.gizmoPick(ray, floorC, pl.pos, Rr, st.tilt);
          if (ring >= 0) { const c = ring === 0 ? floorC : pl.pos, a = S.ringAngle(ray, c, ring); st.ring = ring; st.drag = { type: 'ring', ax: ring, c, a, acc: 0, rot0: Float32Array.from(pl.rot) }; }
          else { const h = floorHit(p); if (h) st.drag = { type: 'move', last: h }; }
        },
        move(p) {
          const d = st.drag, pl = st.pl; if (!d || !pl) return;
          if (d.type === 'ring') { const a = S.ringAngle(rayAt(p), d.c, d.ax); if (a == null) return; d.acc += S.wrap(a - d.a); d.a = a; const ang = st.snap ? Math.round(d.acc / SNAP) * SNAP : d.acc; pl.rot = mul(rotAxis(S.AXES[d.ax], ang), d.rot0); if (d.ax === 0 || S.isUpright(pl)) { /* yaw keeps contact */ } if (S.isUpright(pl)) S.restOnFloor(pl, st.floorY); }
          else { const h = floorHit(p); if (!h) return; pl.pos[0] += h[0] - d.last[0]; pl.pos[2] += h[2] - d.last[2]; d.last = h; }
        },
        up() { st.drag = null; st.ring = -1; },
        pinch(ratio, dAng) { const pl = st.pl; if (!pl || st.mode !== 'place') return; setScale(pl.scale * ratio); pl.rot = mul(rotAxis([0, 1, 0], -dAng), pl.rot); },
        tap() { if (!hasOverlay) tapAt(); else tapAt(); }
      });
      const hasOverlay = !!session.domOverlayState;
      session.addEventListener('select', () => { if (!hasOverlay) tapAt(); });
      session.addEventListener('end', () => {
        try { hitSource && hitSource.cancel && hitSource.cancel(); } catch (e) {}
        ui.remove(); if (canvas.parentNode) canvas.remove(); btn.disabled = false; btn.textContent = label; R.dispose();
      });
      renderPanel();

      // ----- frame loop -----
      const project = (p) => { if (!st.VP) return null; const m = st.VP, x = m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12], y = m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13], w = m[3]*p[0] + m[7]*p[1] + m[11]*p[2] + m[15]; if (w <= 0) return null; return [(x / w * 0.5 + 0.5) * innerWidth, (0.5 - y / w * 0.5) * innerHeight]; };
      const onFrame = (t, frame) => {
        session.requestAnimationFrame(onFrame);
        const layer = session.renderState.baseLayer, pose = frame.getViewerPose(ref); if (!pose) return;
        const vm = pose.transform.matrix; st.viewer = [vm[12], vm[13], vm[14]]; st.fwd = [-vm[8], -vm[9], -vm[10]]; if (st.y0 == null) st.y0 = st.viewer[1];
        st.hit = null;
        { const dt = st.lastT ? Math.min(0.1, (t - st.lastT) / 1000) : 0; st.lastT = t; const j = st.joy, mg = Math.hypot(j[0], j[1]);
          if (st.walk && st.pl && mg > 0.08) { const l = Math.hypot(st.fwd[0], st.fwd[2]) || 1, f = [st.fwd[0] / l, st.fwd[2] / l], rt = [-f[1], f[0]], sp = (st.run ? 3.2 : 1.4) * Math.min(1, (mg - 0.08) / 0.8) * dt, dx = f[0] * -j[1] + rt[0] * j[0], dz = f[1] * -j[1] + rt[1] * j[0], dl = Math.hypot(dx, dz) || 1; st.pl.pos[0] -= dx / dl * sp; st.pl.pos[2] -= dz / dl * sp; } }
        if (hitSource) { const res = frame.getHitTestResults(hitSource); if (res.length) { const hp = res[0].getPose(ref); if (hp) { const m = hp.transform.matrix; st.hit = [m[12], m[13], m[14]]; } } }
        else { const l = Math.hypot(st.fwd[0], st.fwd[2]) || 1; st.hit = [st.viewer[0] + st.fwd[0] / l * 1.8, haveFloor ? 0 : st.y0 - 1.4, st.viewer[2] + st.fwd[2] / l * 1.8]; }
        // light: sun study or a pleasant default
        if (st.sunOn && st.sunEl != null) { const up = st.sunEl > 0; R.setLight({ dir: S.sunVec(st.sunAz, Math.max(st.sunEl, 0.02), st.sun.north), int: up ? 0.75 : 0.1, amb: up ? 0.38 : 0.22, tint: up && st.sunEl < 0.3 ? [1, 0.88, 0.75] : [1, 1, 1] }); }
        else R.setLight({ dir: [0.4, 0.9, 0.3], int: 0.55, amb: 0.45, tint: [1, 1, 1] });
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
        pose.views.forEach((view, vi) => {
          const vp = layer.getViewport(view); gl.viewport(vp.x, vp.y, vp.width, vp.height);
          const VP = mul(view.projectionMatrix, view.transform.inverse.matrix); if (vi === 0) { st.VP = VP; st.invVP = inv4(VP); }
          const pl = st.pl;
          if (st.mode === 'place' && !st.walk) { for (const w of st.walls) for (const [q, r] of [[w.a, w.b], [w.a, [w.a[0], w.a[1] + 2.4, w.a[2]]], [w.b, [w.b[0], w.b[1] + 2.4, w.b[2]]], [[w.a[0], w.a[1] + 2.4, w.a[2]], [w.b[0], w.b[1] + 2.4, w.b[2]]]]) R.drawLine(VP, q, r, 0.01, [0.22, 0.78, 0.85, 0.95], { onTop: true }); if (st.pend) R.drawShape(R.shapes.torus, VP, mul(trans(st.pend[0], st.pend[1] + 0.003, st.pend[2]), scal(0.05, 0.05, 0.05)), [0.22, 0.78, 0.85, 0.95]); }
          if (pl) {
            const base = S.baseMatrix(pl);
            if (!st.walk && (!st.sunOn || st.sunEl > 0)) { R.shadow(model, VP, base, { p: [0, st.floorY, 0], n: [0, 1, 0] }, 0.38); for (const w of st.walls) R.shadow(model, VP, base, w, 0.38); }
            R.draw(model, VP, base, { noCull: !!st.walk });
            if (st.mode === 'place' && !st.walk && !st.clean) R.drawGizmo(VP, [pl.pos[0], st.floorY, pl.pos[2]], pl.pos, S.gizmoRadius(pl), st.tilt, st.ring);
          }
          if (st.hit && !st.walk && !st.clean) R.drawShape(R.shapes.torus, VP, mul(trans(st.hit[0], st.hit[1] + 0.003, st.hit[2]), scal(0.07, 0.07, 0.07)), [0.94, 0.64, 0.23, 0.95]);
          st.meas.forEach((p) => R.drawShape(R.shapes.cube, VP, mul(trans(p[0], p[1], p[2]), scal(0.012, 0.012, 0.012)), [0.2, 0.9, 0.9, 1], { onTop: true }));
          if (st.meas.length === 2) R.drawLine(VP, st.meas[0], st.meas[1], 0.004, [0.2, 0.9, 0.9, 1], { onTop: true });
        });
        // measure label
        if (st.meas.length === 2) {
          const a = st.meas[0], b = st.meas[1], real = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]), mid = [(a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2], pr = project(mid);
          if (pr) { measEl.style.display = 'block'; measEl.style.left = pr[0] + 'px'; measEl.style.top = pr[1] + 'px'; measEl.textContent = S.fmtDist(real) + (st.pl ? '  ·  ' + S.fmtDist(real / st.pl.scale) + ' on the model' : ''); } else measEl.style.display = 'none';
        } else measEl.style.display = 'none';
        if (st.walk) drawMini();
        if (window.__AR_DEBUG) window.__AR_FRAMES = (window.__AR_FRAMES || 0) + 1;
      };
      session.requestAnimationFrame(onFrame);
    } catch (e) {
      btn.disabled = false; btn.textContent = label; if (ui) ui.remove(); if (R) R.dispose();
      alert('AR could not start: ' + (e && e.message ? e.message : e)); console.error(e);
    }
  }

  // ---------- toolbar button ----------
  let btn;
  function addButton() {
    const host = document.querySelector('.tools') || document.body;
    btn = document.createElement('button'); btn.className = 'btn'; btn.id = 'arBtn'; btn.type = 'button'; btn.textContent = 'AR'; btn.hidden = true;
    btn.title = 'View this model in augmented reality'; btn.onclick = startAR; host.appendChild(btn);
    const sync = () => { btn.hidden = document.documentElement.getAttribute('data-mode') !== 'skp'; };
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] }); sync();
  }
  XR.isSessionSupported('immersive-ar').then((ok) => { if (ok) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton(); } }).catch(() => {});
  window.__scadAR = { startAR, buildMini };
})();
