// "Project in photo" for the DWG viewer: take or pick a photo, drag the four corners of a flat plane onto any surface
// (floor, wall, ceiling, panel) and the drawing is warped onto it in true perspective, in its own colours. Saves a PNG.
(() => {
  'use strict';
  let busy = false;

  // unit square (0,0)(1,0)(1,1)(0,1) -> quad p[0..3]; returns column-major inverse (quad px -> unit square) or null
  function quadInv(p) {
    const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1; if (Math.abs(den) < 1e-9) return null;
    const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    // inverse = adjugate of [[a,b,c],[d,e,f],[g,h,1]]
    let m = [e - f * h, c * h - b, b * f - c * e, f * g - d, a - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d]; // rows
    const cx = (x0 + x1 + x2 + x3) / 4, cy = (y0 + y1 + y2 + y3) / 4;
    if (m[6] * cx + m[7] * cy + m[8] < 0) m = m.map((v) => -v);
    for (let i = 0; i < 4; i++) if (m[6] * p[i][0] + m[7] * p[i][1] + m[8] <= 0) return null; // not convex / behind
    return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]); // column-major for GL
  }

  function openDwgPhoto() {
    const cad = window.__scadCad;
    if (busy) return;
    if (!cad || !cad.on) { alert('Open a DWG drawing first.'); return; }
    busy = true;
    const st = { mode: 'plane', pa: 1, pw: 1, ph: 1, dc: [0.5, 0.5], sc: 1, rot: 0, area: 'view', back: 'none', op: 1, lw: 1, img: null, w: 0, h: 0, q: null, dr: null, scale: 1, cw: 0, ch: 0, drag: null, tex: null };
    const ui = document.createElement('div'); ui.id = 'dpUI';
    ui.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0d1013;color:#f4f5f7;font-family:Inter,system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden';
    ui.innerHTML = `<style>
      #dpUI button{font-family:inherit;cursor:pointer}
      #dpUI .g{background:rgba(26,30,36,.7);-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 30px rgba(0,0,0,.35);color:#f4f5f7}
      #dpUI .rb{width:48px;height:48px;border-radius:24px;font-size:20px;display:grid;place-items:center}
      #dpUI .pill{height:40px;padding:0 14px;border-radius:20px;font-size:13px;font-weight:500;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#f4f5f7}
      #dpUI .pill.on{background:rgba(255,178,36,.18);border-color:rgba(255,178,36,.5);color:#ffb224;font-weight:700}
      #dpUI .cta{height:50px;padding:0 24px;border:0;border-radius:25px;background:linear-gradient(135deg,#ffc247,#ff9d1f);color:#1a1206;font-weight:700;font-size:15px;box-shadow:0 6px 18px rgba(255,160,30,.4)}
      #dpUI .lab{font-size:12px;color:rgba(244,245,247,.66);font-weight:500}
      #dpUI input[type=range]{width:100%;accent-color:#ffb224}
    </style>
    <div id="dpStage" style="position:absolute;inset:0"></div>
    <div style="position:absolute;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));display:flex;gap:10px;align-items:center;pointer-events:none">
      <button class="g rb" id="dpClose" aria-label="Close" style="pointer-events:auto">&#x2715;</button>
      <div class="g" id="dpHint" style="flex:1;min-height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px 14px;font-size:13px;font-weight:500;line-height:1.3;box-sizing:border-box">Project the drawing onto a photo</div>
    </div>
    <div id="dpStart" class="g" style="position:absolute;left:14px;right:14px;bottom:calc(22px + env(safe-area-inset-bottom,0px));border-radius:30px;padding:20px;box-sizing:border-box;max-width:460px;margin:0 auto">
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">Choose a photo</div><div class="lab" style="margin-bottom:16px;font-size:13px">Any surface works: floor, wall, ceiling or a panel.</div>
      <div style="display:flex;gap:10px"><button class="cta" id="dpCam" style="flex:1">Take photo</button><button class="pill" id="dpPick" style="flex:1;height:50px;border-radius:25px;font-size:15px">Choose photo</button></div></div>
    <button id="dpShowB" class="pill" style="position:absolute;left:50%;transform:translateX(-50%);bottom:calc(22px + env(safe-area-inset-bottom,0px));display:none;height:46px;padding:0 22px;background:rgba(26,30,36,.85)">Controls &#9650;</button>
    <div id="dpBar" class="g" style="position:absolute;left:14px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));border-radius:26px;padding:12px 14px;box-sizing:border-box;max-width:560px;margin:0 auto;display:none">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><button class="pill" data-mode="plane">Plane</button><button class="pill" data-mode="draw">Drawing</button><span style="flex:1"></span><button class="pill" id="dpMoreB">More &#9662;</button><button class="pill" id="dpHideB" aria-label="Hide controls">&#9660;</button></div>
      <div id="dpPlaneRow" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><span class="lab">Plane size</span><input id="dpPW" type="number" min="0.01" step="0.1" style="width:64px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;padding:0 8px;font:inherit"><span class="lab">&times;</span><input id="dpPH" type="number" min="0.01" step="0.1" style="width:64px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;padding:0 8px;font:inherit"><span class="lab">width &times; height</span></div>
      <div id="dpDrawRow" style="display:none;flex-direction:column;gap:0">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><button class="pill" id="dpFitD">Fit</button><button class="pill" id="dpFillD">Fill</button><button class="pill" id="dpRot">Rotate 90&deg;</button><button class="pill" id="dpZ1">1:1 width</button></div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><span class="lab">Rotate</span><button class="pill" id="dpRm" style="padding:0 12px">&minus;1&deg;</button><input type="range" id="dpRotS" min="-180" max="180" step="1" value="0" style="flex:1;min-width:0"><button class="pill" id="dpRp" style="padding:0 12px">+1&deg;</button><b id="dpRotT" style="min-width:42px;text-align:right">0&deg;</b></div>
      </div>
      <div id="dpMore" style="display:none">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><span class="lab" style="width:54px">Show</span><button class="pill" data-area="view">On screen</button><button class="pill" data-area="all">Whole drawing</button></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><span class="lab" style="width:54px">Behind</span><button class="pill" data-back="none">None</button><button class="pill" data-back="dark">Dark</button><button class="pill" data-back="light">Light</button></div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px"><span class="lab" style="width:54px">Lines</span><input type="range" id="dpLW" min="0.5" max="4" step="0.25" value="1" style="flex:1"><b id="dpLWT" style="min-width:40px;text-align:right">1&times;</b></div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px"><span class="lab" style="width:54px">Opacity</span><input type="range" id="dpOp" min="10" max="100" value="100" style="flex:1"></div>
      </div>
      <div style="display:flex;gap:8px"><button class="pill" id="dpReset" style="height:46px;border-radius:23px">Reset</button><button class="pill" id="dpNew" style="height:46px;border-radius:23px">New photo</button><button class="pill" id="dpPdf" style="height:46px;border-radius:23px">PDF</button><button class="cta" id="dpSave" style="flex:1;height:46px;padding:0 12px;font-size:14px">Save PNG</button></div>
    </div>
    <input type="file" id="dpFileCam" accept="image/*" capture="environment" hidden><input type="file" id="dpFile" accept="image/*" hidden>`;
    document.body.appendChild(ui);
    const $ = (s) => ui.querySelector(s), stage = $('#dpStage');
    const hint = (t) => { $('#dpHint').textContent = t; };
    const close = () => { try { window.removeEventListener('resize', fit); } catch (e) {} ui.remove(); busy = false; };
    $('#dpClose').onclick = close;

    // ---------- canvases ----------
    const wrap = document.createElement('div'); wrap.style.cssText = 'position:absolute;touch-action:none';
    const pc = document.createElement('canvas'), gc = document.createElement('canvas'), oc = document.createElement('canvas');
    for (const c of [pc, gc, oc]) { c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'; wrap.appendChild(c); }
    stage.appendChild(wrap);
    const loupe = document.createElement('canvas'); loupe.width = loupe.height = 240; loupe.style.cssText = 'position:absolute;width:120px;height:120px;border-radius:60px;border:2px solid #ffb224;box-shadow:0 6px 20px rgba(0,0,0,.5);display:none;pointer-events:none;z-index:3;background:#000';
    ui.appendChild(loupe);

    const gcOpt = { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true };
    const gl = gc.getContext('webgl2', gcOpt) || gc.getContext('webgl', gcOpt); const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (!gl) { alert('This browser cannot do the 3D warp (WebGL).'); close(); return; }
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;uniform vec2 res;varying vec2 vp;void main(){vp=vec2((p.x*.5+.5)*res.x,(1.-(p.y*.5+.5))*res.y);gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision highp float;varying vec2 vp;uniform mat3 Hi;uniform sampler2D t;uniform sampler2D t2;uniform vec4 w;uniform float hd;uniform float op;uniform float pa;uniform vec2 C;uniform float sc;uniform float da;uniform vec2 cs;void main(){vec3 q=Hi*vec3(vp,1.);if(q.z<=0.)discard;vec2 p=q.xy/q.z;if(p.x<0.||p.x>1.||p.y<0.||p.y>1.)discard;vec2 P=vec2(p.x,p.y/pa)-C;vec2 R=vec2(cs.x*P.x+cs.y*P.y,-cs.y*P.x+cs.x*P.y);vec2 uv=R/vec2(sc,sc/da)+0.5;if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)discard;vec4 a=texture2D(t,uv);vec4 b=texture2D(t2,clamp((uv-w.xy)/(w.zw-w.xy),0.,1.));bool ins=hd>.5&&uv.x>=w.x&&uv.x<=w.z&&uv.y>=w.y&&uv.y<=w.w;gl_FragColor=(ins?b:a)*op;}'));
    gl.linkProgram(pr); gl.useProgram(pr);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(pr, n); const uRes = gl.getUniformLocation(pr, 'res'), uHi = gl.getUniformLocation(pr, 'Hi'), uOp = gl.getUniformLocation(pr, 'op');

    // ---------- drawing texture ----------
    const mtex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    const upCanvas = (d) => { // a canvas the GPU can mip-map: power-of-two only needed on WebGL1
      const bk = st.back, c = document.createElement('canvas'); const pot = (n) => Math.min(mtex, Math.max(256, 1 << Math.ceil(Math.log2(Math.max(2, n)))));
      c.width = isGL2 ? d.width : pot(d.width); c.height = isGL2 ? d.height : pot(d.height); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      if (bk !== 'none') { x.fillStyle = bk === 'dark' ? 'rgba(18,20,24,.78)' : 'rgba(255,255,255,.85)'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(d, 0, 0, c.width, c.height); return c;
    };
    const makeTex = (c, unit) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.activeTexture(gl.TEXTURE0); return t;
    };
    // Detail texture: re-draws just the part of the drawing that sits in the plane, at the size it has in the photo.
    function detailWin() {
      const pa = st.pa, da = st.dr.w / st.dr.h, cs = [Math.cos(st.rot), Math.sin(st.rot)], uvs = [[0, 0], [1, 0], [1, 1], [0, 1]].map((p) => { const Px = p[0] - st.dc[0], Py = p[1] / pa - st.dc[1]; const Rx = cs[0] * Px + cs[1] * Py, Ry = -cs[1] * Px + cs[0] * Py; return [Rx / st.sc + 0.5, Ry / (st.sc / da) + 0.5]; });
      let u0 = Math.min(...uvs.map((a) => a[0])), u1 = Math.max(...uvs.map((a) => a[0])), v0 = Math.min(...uvs.map((a) => a[1])), v1 = Math.max(...uvs.map((a) => a[1]));
      const pw = (u1 - u0) * 0.04, ph = (v1 - v0) * 0.04; u0 = Math.max(0, u0 - pw); u1 = Math.min(1, u1 + pw); v0 = Math.max(0, v0 - ph); v1 = Math.min(1, v1 + ph);
      return u1 - u0 > 0.002 && v1 - v0 > 0.002 ? [u0, v0, u1, v1] : null;
    }
    function buildDetail(k) {
      if (window.__NODETAIL || !st.q || !st.tex || !st.valid) return; const win = detailWin(); if (!win) return;
      let long = 0; for (let i = 0; i < 4; i++) { const a = st.q[i], b = st.q[(i + 1) % 4]; long = Math.max(long, Math.hypot(a[0] - b[0], a[1] - b[1])); }
      const side = Math.round(Math.max(2048, Math.min(Math.min(mtex, 6000), long * k * 2)));
      const d = cad.render(st.area, side, st.lw, win); if (!d) return;
      if (st.tex2) gl.deleteTexture(st.tex2); st.tex2 = makeTex(upCanvas(d), 1); st.win = win;
    }
    let dTimer = 0; const scheduleDetail = () => { clearTimeout(dTimer); dTimer = setTimeout(() => { if (!document.body.contains(ui)) return; buildDetail(1); st.detailOk = true; renderGL(); }, 280); };
    function buildTexture() {
      const mt = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048, TS = Math.min(4096, mt); const d = cad.render(st.area, TS, st.lw); if (!d) return false;
      const c = upCanvas(d);
      if (st.tex) gl.deleteTexture(st.tex);
      st.dr = { w: d.width, h: d.height };
      st.tex = makeTex(c, 0); st.win = null; st.detailOk = false;
      return true;
    }
    function initQuad() { // flat rectangle with the drawing's proportions, lower-middle of the photo
      const ar = st.dr.w / st.dr.h; let w = st.w * 0.6, h = w / ar; if (h > st.h * 0.5) { h = st.h * 0.5; w = h * ar; }
      const cx = st.w / 2, cy = st.h * 0.58;
      st.q = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
      st.pa = ar; st.pw = +ar.toFixed(2); st.ph = 1; fitDrawing(false);
    }
    function fitDrawing(fill) { const da = st.dr.w / st.dr.h, ph = 1 / st.pa; st.sc = fill ? Math.max(1, ph * da) : Math.min(1, ph * da); st.dc = [0.5, 0.5 * ph]; st.rot = 0; }
    function setPlaneAspect(w, h) { if (!(w > 0 && h > 0)) return; st.pw = w; st.ph = h; st.pa = w / h; fitDrawing(false); }
    function planeUV(x, y) { const H = quadInv(st.q); if (!H) return null; const a = H[0] * x + H[3] * y + H[6], b = H[1] * x + H[4] * y + H[7], c = H[2] * x + H[5] * y + H[8]; return [a / c, b / c / st.pa]; }
    function renderGL() {
      gl.viewport(0, 0, gc.width, gc.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const Hi = st.q && st.tex ? quadInv(st.q) : null; st.valid = !!Hi; if (!Hi) return;
      gl.useProgram(pr); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, st.tex);
      gl.uniform2f(uRes, st.w, st.h); gl.uniformMatrix3fv(uHi, false, Hi); gl.uniform1i(U('t'), 0); gl.uniform1i(U('t2'), 1); if (st.tex2 && st.win) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, st.tex2); gl.activeTexture(gl.TEXTURE0); gl.uniform4f(U('w'), st.win[0], st.win[1], st.win[2], st.win[3]); gl.uniform1f(U('hd'), st.detailOk ? 1 : 0); } else gl.uniform1f(U('hd'), 0); gl.bindTexture(gl.TEXTURE_2D, st.tex); gl.uniform1f(uOp, st.op); gl.uniform1f(U('pa'), st.pa); gl.uniform2f(U('C'), st.dc[0], st.dc[1]); gl.uniform1f(U('sc'), st.sc); gl.uniform1f(U('da'), st.dr.w / st.dr.h); gl.uniform2f(U('cs'), Math.cos(st.rot), Math.sin(st.rot));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const toCss = (p) => [p[0] * st.scale, p[1] * st.scale];
    function renderOverlay() {
      const dpr = Math.min(2, window.devicePixelRatio || 1); oc.width = Math.round(st.cw * dpr); oc.height = Math.round(st.ch * dpr);
      const o = oc.getContext('2d'); o.setTransform(dpr, 0, 0, dpr, 0, 0); o.clearRect(0, 0, st.cw, st.ch); if (!st.q) return;
      const p = st.q.map(toCss);
      o.lineJoin = 'round'; o.beginPath(); p.forEach((a, i) => (i ? o.lineTo(a[0], a[1]) : o.moveTo(a[0], a[1]))); o.closePath();
      o.strokeStyle = st.valid ? 'rgba(255,178,36,.95)' : 'rgba(255,90,70,.95)'; o.lineWidth = 2; o.setLineDash([7, 5]); o.stroke(); o.setLineDash([]);
      if (st.mode === 'plane') p.forEach((a, i) => { o.beginPath(); o.arc(a[0], a[1], 13, 0, 7); o.fillStyle = 'rgba(255,178,36,.95)'; o.fill(); o.lineWidth = 2.5; o.strokeStyle = '#fff'; o.stroke();
        if (i === 0) { o.fillStyle = '#1a1206'; o.font = '700 11px Inter,sans-serif'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText('1', a[0], a[1] + 0.5); } });
    }
    function render() { st.detailOk = false; renderGL(); renderOverlay(); scheduleDetail(); }
    function fit() {
      if (!st.img) return;
      const r = stage.getBoundingClientRect(), top = 72, bot = $('#dpBar').style.display === 'none' ? ($('#dpShowB').style.display === 'none' ? 24 : 80) : ($('#dpBar').offsetHeight + 28);
      const aw = r.width - 8, ah = Math.max(80, r.height - top - bot); st.scale = Math.min(aw / st.w, ah / st.h);
      st.cw = Math.round(st.w * st.scale); st.ch = Math.round(st.h * st.scale);
      wrap.style.width = st.cw + 'px'; wrap.style.height = st.ch + 'px'; wrap.style.left = Math.round((r.width - st.cw) / 2) + 'px'; wrap.style.top = Math.round(top + (ah - st.ch) / 2) + 'px';
      render();
    }
    window.addEventListener('resize', fit);

    // ---------- photo ----------
    function loadPhoto(file) {
      if (!file) return; const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        let w = im.naturalWidth, h = im.naturalHeight; const k = Math.min(1, 2600 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
        pc.width = gc.width = w; pc.height = gc.height = h; pc.getContext('2d').drawImage(im, 0, 0, w, h); URL.revokeObjectURL(url);
        st.img = true; st.w = w; st.h = h;
        if (!buildTexture()) { hint('Could not render the drawing.'); return; }
        initQuad(); $('#dpStart').style.display = 'none'; $('#dpBar').style.display = 'block'; sync();
        hint('Drag each corner onto the corners of your surface. Drag inside to move, pinch to resize.'); fit();
      };
      im.onerror = () => { URL.revokeObjectURL(url); hint('That image could not be opened.'); };
      im.src = url;
    }
    $('#dpCam').onclick = () => $('#dpFileCam').click(); $('#dpPick').onclick = () => $('#dpFile').click();
    $('#dpFileCam').onchange = (e) => loadPhoto(e.target.files[0]); $('#dpFile').onchange = (e) => loadPhoto(e.target.files[0]);
    $('#dpNew').onclick = () => $('#dpFile').click();

    function sync() {
      ui.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === st.mode));
      $('#dpPlaneRow').style.display = st.mode === 'plane' ? 'flex' : 'none'; $('#dpDrawRow').style.display = st.mode === 'draw' ? 'flex' : 'none';
      { const dg = Math.round(((st.rot * 180 / Math.PI) % 360 + 540) % 360 - 180); $('#dpRotS').value = dg; $('#dpRotT').textContent = dg + '\u00b0'; }
      $('#dpPW').value = st.pw; $('#dpPH').value = st.ph;
      hint(st.mode === 'draw' ? 'Drag to scroll the drawing inside the plane. Pinch to resize it. Use the Rotate slider to turn it. The plane stays put.' : 'Drag the four corners onto the surface. Drag inside to move the plane, pinch to resize it.');
      ui.querySelectorAll('[data-area]').forEach((b) => b.classList.toggle('on', b.dataset.area === st.area));
      ui.querySelectorAll('[data-back]').forEach((b) => b.classList.toggle('on', b.dataset.back === st.back));
    }
    ui.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { st.mode = b.dataset.mode; sync(); render(); }));
    const pwh = () => { setPlaneAspect(parseFloat($('#dpPW').value), parseFloat($('#dpPH').value)); sync(); render(); };
    $('#dpPW').onchange = pwh; $('#dpPH').onchange = pwh;
    { let tm = 0; $('#dpLW').oninput = (e) => { st.lw = +e.target.value; $('#dpLWT').textContent = st.lw + '\u00d7'; clearTimeout(tm); tm = setTimeout(() => { buildTexture(); render(); }, 120); }; }
    $('#dpMoreB').onclick = () => { const m = $('#dpMore'), o = m.style.display === 'none'; m.style.display = o ? 'block' : 'none'; $('#dpMoreB').innerHTML = o ? 'More &#9652;' : 'More &#9662;'; fit(); render(); };
    $('#dpHideB').onclick = () => { $('#dpBar').style.display = 'none'; $('#dpShowB').style.display = 'block'; fit(); render(); };
    $('#dpShowB').onclick = () => { $('#dpBar').style.display = 'block'; $('#dpShowB').style.display = 'none'; fit(); render(); };
    const setRot = (dg) => { st.rot = dg * Math.PI / 180; sync(); render(); };
    $('#dpRotS').oninput = (e) => setRot(+e.target.value);
    $('#dpRm').onclick = () => setRot(+$('#dpRotS').value - 1); $('#dpRp').onclick = () => setRot(+$('#dpRotS').value + 1);
    $('#dpFitD').onclick = () => { fitDrawing(false); sync(); render(); }; $('#dpFillD').onclick = () => { fitDrawing(true); sync(); render(); };
    $('#dpRot').onclick = () => { st.rot += Math.PI / 2; sync(); render(); };
    $('#dpZ1').onclick = () => { st.sc = 1; st.dc = [0.5, 0.5 / st.pa]; render(); };
    ui.querySelectorAll('[data-area]').forEach((b) => (b.onclick = () => { st.area = b.dataset.area; const old = st.q; const q0 = st.q; buildTexture(); initQuad(); st.q = q0; setPlaneAspect(st.pw, st.ph); sync(); fit(); }));
    ui.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => { st.back = b.dataset.back; buildTexture(); sync(); render(); }));
    $('#dpOp').oninput = (e) => { st.op = e.target.value / 100; render(); };
    $('#dpReset').onclick = () => { initQuad(); render(); };

    // ---------- gestures ----------
    const ptrs = new Map();
    const pos = (e) => { const r = wrap.getBoundingClientRect(); return [(e.clientX - r.left) / st.scale, (e.clientY - r.top) / st.scale]; };
    const inside = (p) => { const q = st.q; let c = false; for (let i = 0, j = 3; i < 4; j = i++) if ((q[i][1] > p[1]) !== (q[j][1] > p[1]) && p[0] < ((q[j][0] - q[i][0]) * (p[1] - q[i][1])) / (q[j][1] - q[i][1]) + q[i][0]) c = !c; return c; };
    function showLoupe(i) {
      const p = st.q[i], r = wrap.getBoundingClientRect(), L = loupe, z = 3, sz = 120 / z / st.scale; L.style.display = 'block';
      const sx = r.left + p[0] * st.scale, sy = r.top + p[1] * st.scale; let lx = sx - 60, ly = sy - 170; if (ly < 70) ly = sy + 50;
      L.style.left = Math.max(4, Math.min(innerWidth - 124, lx)) + 'px'; L.style.top = ly + 'px';
      const c = L.getContext('2d'); c.clearRect(0, 0, 240, 240); const x0 = p[0] - sz / 2, y0 = p[1] - sz / 2;
      c.drawImage(pc, x0, y0, sz, sz, 0, 0, 240, 240); c.drawImage(gc, x0, y0, sz, sz, 0, 0, 240, 240);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(120, 100); c.lineTo(120, 140); c.moveTo(100, 120); c.lineTo(140, 120); c.stroke();
    }
    wrap.addEventListener('pointerdown', (e) => {
      if (!st.q) return; wrap.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (st.mode === 'draw') { if (ptrs.size === 2) { const a = [...ptrs.values()]; st.drag = { k: 'dpinch', d0: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), a0: Math.atan2(a[1][1] - a[0][1], a[1][0] - a[0][0]), sc0: st.sc, rot0: st.rot }; } else st.drag = { k: 'pan', last: planeUV(...pos(e)) }; return; }
      if (ptrs.size === 2) { const a = [...ptrs.values()]; st.drag = { k: 'pinch', d0: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), a0: Math.atan2(a[1][1] - a[0][1], a[1][0] - a[0][0]), q0: st.q.map((p) => p.slice()) }; return; }
      const p = pos(e); let bi = -1, bd = 40 / st.scale; st.q.forEach((c, i) => { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) st.drag = { k: 'h', i: bi }; else if (inside(p)) st.drag = { k: 'move', last: p }; else st.drag = null;
      if (st.drag && st.drag.k === 'h') showLoupe(bi);
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); const d = st.drag; if (!d) return;
      if (d.k === 'pan') { const u = planeUV(...pos(e)); if (u && d.last) { st.dc = [st.dc[0] + u[0] - d.last[0], st.dc[1] + u[1] - d.last[1]]; d.last = planeUV(...pos(e)); } render(); return; }
      if (d.k === 'dpinch' && ptrs.size >= 2) { const a = [...ptrs.values()], dist = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), ang = Math.atan2(a[1][1] - a[0][1], a[1][0] - a[0][0]); st.sc = Math.min(50, Math.max(0.01, d.sc0 * dist / Math.max(1, d.d0))); render(); return; }
      if (d.k === 'pinch' && ptrs.size >= 2) {
        const a = [...ptrs.values()], dist = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), ang = Math.atan2(a[1][1] - a[0][1], a[1][0] - a[0][0]);
        const f = dist / Math.max(1, d.d0), da = ang - d.a0, cs = Math.cos(da), sn = Math.sin(da);
        const cx = d.q0.reduce((s, p) => s + p[0], 0) / 4, cy = d.q0.reduce((s, p) => s + p[1], 0) / 4;
        st.q = d.q0.map((p) => { const x = (p[0] - cx) * f, y = (p[1] - cy) * f; return [cx + x * cs - y * sn, cy + x * sn + y * cs]; });
      } else if (d.k === 'h') { const p = pos(e); st.q[d.i] = [Math.max(0, Math.min(st.w, p[0])), Math.max(0, Math.min(st.h, p[1]))]; }
      else if (d.k === 'move') { const p = pos(e), dx = p[0] - d.last[0], dy = p[1] - d.last[1]; st.q = st.q.map((c) => [c[0] + dx, c[1] + dy]); d.last = p; }
      render(); if (d.k === 'h') showLoupe(d.i);
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) { st.drag = null; loupe.style.display = 'none'; } else if (st.drag && (st.drag.k === 'pinch' || st.drag.k === 'dpinch')) st.drag = null; render(); };
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);

    // ---------- save ----------
    const composite = () => {
      const k = Math.max(1, Math.min(2, 5000 / Math.max(st.w, st.h))), W = Math.round(st.w * k), H = Math.round(st.h * k);
      const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d'); o.imageSmoothingQuality = 'high'; o.drawImage(pc, 0, 0, W, H);
      gc.width = W; gc.height = H; buildDetail(k); st.detailOk = true; renderGL(); o.drawImage(gc, 0, 0);
      gc.width = st.w; gc.height = st.h; st.detailOk = false; scheduleDetail(); return out;
    };
    const doSave = async (pdf) => {
      if (!st.valid) { hint('The corners make an impossible shape. Drag them so the outline is a four-sided shape with no crossing.'); return; }
      const out = composite(), F = window.__scadFile;
      if (pdf) await F.save(F.pdf([{ canvas: out }]), 'S-CAD-drawing-in-photo.pdf');
      else await F.save(await new Promise((r) => out.toBlob(r, 'image/png')), 'S-CAD-drawing-in-photo.png');
      hint('Saved.'); render();
    };
    $('#dpSave').onclick = () => doSave(false); $('#dpPdf').onclick = () => doSave(true);
    window.__DWGPHOTO = { st, loadPhoto, render, fit };
  }

  function addButton() {
    const host = document.querySelector('.tools') || document.body, b = document.createElement('button');
    b.className = 'btn cad-only'; b.id = 'dwgPhotoBtn'; b.type = 'button'; b.textContent = 'Project in photo'; b.title = 'Project this drawing onto a photo'; b.onclick = openDwgPhoto; host.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
