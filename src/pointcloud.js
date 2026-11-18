// S-CAD 3D scan viewer (trial): opens PLY / LAS / XYZ / PTS / TXT / CSV point clouds, orbit, size, colour modes, 2-point measure.
(() => {
  'use strict';
  const MAXPTS = 3000000;
  const EXT = /\.(ply|las|laz|xyz|pts|txt|csv|asc|xyzn|xyzrgb)$/i;
  let V = null; // open viewer state

  const detect = (name, buf) => {
    const h = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(8, buf.byteLength)));
    if (h.slice(0, 3) === 'ply' || h.slice(0, 4) === 'LASF') return true;
    if (h.slice(0, 2) === 'AC' || h.slice(0, 4) === 'glTF') return false;
    return EXT.test(name || '') && !/\.(dwg|skp|glb)$/i.test(name || '');
  };

  // ---------- parsers: return {pos:Float64Array-like list via arrays, col:Uint8Array(rgb)|null, n, total} ----------
  const finish = (xs, ys, zs, rgb, total) => ({ xs, ys, zs, rgb, n: xs.length, total });

  function parsePLY(buf) {
    const u8 = new Uint8Array(buf);
    let he = -1; const dec = new TextDecoder('latin1');
    const headTxt = dec.decode(u8.subarray(0, Math.min(u8.length, 65536)));
    const m = /end_header\r?\n/.exec(headTxt); if (!m) throw new Error('PLY header not found');
    he = m.index + m[0].length;
    const lines = headTxt.slice(0, m.index).split(/\r?\n/);
    let fmt = 'ascii', els = [], cur = null;
    for (const l of lines) {
      const t = l.trim().split(/\s+/);
      if (t[0] === 'format') fmt = t[1];
      else if (t[0] === 'element') { cur = { name: t[1], n: +t[2], props: [] }; els.push(cur); }
      else if (t[0] === 'property' && cur) { if (t[1] === 'list') cur.props.push({ list: true, ct: t[2], it: t[3], name: t[4] }); else cur.props.push({ type: t[1], name: t[2] }); }
    }
    const vi = els.findIndex((e) => e.name === 'vertex'); if (vi < 0) throw new Error('No vertex data in PLY');
    const ve = els[vi], total = ve.n, stride = Math.max(1, Math.ceil(total / MAXPTS)), cnt = Math.ceil(total / stride);
    const xs = new Float64Array(cnt), ys = new Float64Array(cnt), zs = new Float64Array(cnt);
    const pn = ve.props.map((p) => p.name);
    const ix = pn.indexOf('x'), iy = pn.indexOf('y'), iz = pn.indexOf('z');
    const ir = pn.indexOf('red') >= 0 ? pn.indexOf('red') : pn.indexOf('r'), ig = pn.indexOf('green') >= 0 ? pn.indexOf('green') : pn.indexOf('g'), ib = pn.indexOf('blue') >= 0 ? pn.indexOf('blue') : pn.indexOf('b');
    const ii = ['intensity', 'scalar_intensity', 'scalar_Intensity'].map((k) => pn.indexOf(k)).find((k) => k >= 0) ?? -1;
    const hasRGB = ir >= 0 && ig >= 0 && ib >= 0;
    const rgb = hasRGB || ii >= 0 ? new Uint8Array(cnt * 3) : null;
    let k = 0, imax = 0, ibuf = null;
    if (ii >= 0) ibuf = new Float32Array(cnt);
    if (fmt === 'ascii') {
      const txt = dec.decode(u8.subarray(he)); let pos = 0;
      for (let i = 0; i < total; i++) {
        let e = txt.indexOf('\n', pos); if (e < 0) e = txt.length;
        if (i % stride === 0 && k < cnt) {
          const t = txt.slice(pos, e).trim().split(/\s+/);
          xs[k] = +t[ix]; ys[k] = +t[iy]; zs[k] = +t[iz];
          if (hasRGB) { rgb[k * 3] = +t[ir]; rgb[k * 3 + 1] = +t[ig]; rgb[k * 3 + 2] = +t[ib]; } else if (ii >= 0) { ibuf[k] = +t[ii]; if (ibuf[k] > imax) imax = ibuf[k]; }
          k++;
        }
        pos = e + 1;
      }
    } else {
      const le = fmt === 'binary_little_endian', dv = new DataView(buf, he);
      const SZ = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
      const rd = (t, o) => { switch (t) { case 'char': case 'int8': return dv.getInt8(o); case 'uchar': case 'uint8': return dv.getUint8(o); case 'short': case 'int16': return dv.getInt16(o, le); case 'ushort': case 'uint16': return dv.getUint16(o, le); case 'int': case 'int32': return dv.getInt32(o, le); case 'uint': case 'uint32': return dv.getUint32(o, le); case 'float': case 'float32': return dv.getFloat32(o, le); default: return dv.getFloat64(o, le); } };
      if (ve.props.some((p) => p.list)) throw new Error('Unsupported PLY layout');
      if (vi !== 0) throw new Error('Unsupported PLY element order');
      const offs = []; let rs = 0; for (const p of ve.props) { offs.push(rs); rs += SZ[p.type] || 4; }
      const ty = ve.props.map((p) => p.type);
      for (let i = 0; i < total; i += stride) {
        const o = i * rs; if (o + rs > dv.byteLength || k >= cnt) break;
        xs[k] = rd(ty[ix], o + offs[ix]); ys[k] = rd(ty[iy], o + offs[iy]); zs[k] = rd(ty[iz], o + offs[iz]);
        if (hasRGB) { rgb[k * 3] = rd(ty[ir], o + offs[ir]); rgb[k * 3 + 1] = rd(ty[ig], o + offs[ig]); rgb[k * 3 + 2] = rd(ty[ib], o + offs[ib]); } else if (ii >= 0) { ibuf[k] = rd(ty[ii], o + offs[ii]); if (ibuf[k] > imax) imax = ibuf[k]; }
        k++;
      }
    }
    if (ibuf && imax > 0) for (let i = 0; i < k; i++) { const v = Math.round(255 * ibuf[i] / imax); rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v; }
    return finish(xs.subarray(0, k), ys.subarray(0, k), zs.subarray(0, k), rgb && rgb.subarray(0, k * 3), total);
  }

  function parseLAS(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    const fmtRaw = dv.getUint8(104);
    if (fmtRaw & 0x80 || /\.laz$/i.test('')) throw new Error('LAZ (compressed) files are not supported yet. Convert to LAS or PLY first.');
    const off = dv.getUint32(96, true), fmt = fmtRaw & 0x3f, rl = dv.getUint16(105, true), ver = dv.getUint8(25);
    let total = dv.getUint32(107, true); if (!total && ver >= 4) total = Number(dv.getBigUint64(247, true));
    const sc = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)], of = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)];
    total = Math.min(total, Math.floor((buf.byteLength - off) / rl));
    const ro = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 }[fmt];
    const stride = Math.max(1, Math.ceil(total / MAXPTS)), cnt = Math.ceil(total / stride);
    const xs = new Float64Array(cnt), ys = new Float64Array(cnt), zs = new Float64Array(cnt), rgb = new Uint16Array(cnt * 3);
    let k = 0, rmax = 0, imax = 0;
    for (let i = 0; i < total && k < cnt; i += stride) {
      const o = off + i * rl;
      xs[k] = dv.getInt32(o, true) * sc[0] + of[0]; ys[k] = dv.getInt32(o + 4, true) * sc[1] + of[1]; zs[k] = dv.getInt32(o + 8, true) * sc[2] + of[2];
      const it = dv.getUint16(o + 12, true); if (it > imax) imax = it;
      if (ro) { const r = dv.getUint16(o + ro, true), g = dv.getUint16(o + ro + 2, true), b = dv.getUint16(o + ro + 4, true); rgb[k * 3] = r; rgb[k * 3 + 1] = g; rgb[k * 3 + 2] = b; if (r > rmax) rmax = r; if (g > rmax) rmax = g; if (b > rmax) rmax = b; }
      else rgb[k * 3] = it & 255, rgb[k * 3 + 1] = it >> 8;
      k++;
    }
    if (ro && rmax > 0) { const f = rmax > 255 ? 255 / 65535 : 1; for (let i = 0; i < k * 3; i++) rgb[i] = Math.min(255, Math.round(rgb[i] * f)); }
    else if (!ro) { // intensity grey
      let im = imax || 1; for (let i = 0; i < k; i++) { const it = rgb[i * 3] | (rgb[i * 3 + 1] << 8); const v = Math.min(255, Math.round(255 * it / im)); rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v; }
    }
    return finish(xs.subarray(0, k), ys.subarray(0, k), zs.subarray(0, k), Uint8Array.from(rgb.subarray(0, k * 3)), total);
  }

  function parseText(buf) {
    const txt = new TextDecoder().decode(new Uint8Array(buf)), lines = txt.split(/\r?\n/);
    const num = /^[\s,;+\-.\deE]+$/;
    // first pass: count candidate lines
    let n = 0; for (const l of lines) if (l.length > 4 && num.test(l)) n++;
    const stride = Math.max(1, Math.ceil(n / MAXPTS)), cnt = Math.ceil(n / stride) + 1;
    const xs = new Float64Array(cnt), ys = new Float64Array(cnt), zs = new Float64Array(cnt), rgb = new Float32Array(cnt * 3);
    let k = 0, j = 0, cols = 0, rmax = 0, hasC = false, mode = 0;
    for (const l of lines) {
      if (l.length < 5 || !num.test(l)) continue;
      if (j++ % stride) continue; if (k >= cnt) break;
      const t = l.trim().split(/[\s,;]+/); if (t.length < 3) continue;
      const x = +t[0], y = +t[1], z = +t[2]; if (!isFinite(x + y + z)) continue;
      if (!cols) { cols = t.length; mode = cols >= 7 && cols !== 9 ? 2 : cols >= 6 ? 1 : cols === 4 ? 3 : 0; hasC = mode > 0; }
      xs[k] = x; ys[k] = y; zs[k] = z;
      let r, g, b;
      if (mode === 1) { r = +t[3]; g = +t[4]; b = +t[5]; } else if (mode === 2) { r = +t[4]; g = +t[5]; b = +t[6]; } else if (mode === 3) { r = g = b = +t[3]; }
      if (mode) { rgb[k * 3] = r; rgb[k * 3 + 1] = g; rgb[k * 3 + 2] = b; if (r > rmax) rmax = r; if (g > rmax) rmax = g; if (b > rmax) rmax = b; }
      k++;
    }
    if (hasC && rmax > 0) { const f = 255 / rmax; if (rmax > 255 || rmax <= 1.001 || mode === 3) for (let i = 0; i < k * 3; i++) rgb[i] = Math.round(rgb[i] * f); }
    return finish(xs.subarray(0, k), ys.subarray(0, k), zs.subarray(0, k), hasC ? Uint8Array.from(rgb.subarray(0, k * 3), (v) => Math.max(0, Math.min(255, Math.round(v)))) : null, n);
  }

  function parse(buf, name) {
    const h = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, 4));
    if (h === 'LASF') return parseLAS(buf);
    if (h.slice(0, 3) === 'ply') return parsePLY(buf);
    if (/\.laz$/i.test(name)) throw new Error('LAZ (compressed) files are not supported yet. Convert to LAS or PLY first.');
    return parseText(buf);
  }

  // ---------- viewer ----------
  const VS = `attribute vec3 p; attribute vec3 c; uniform mat4 m; uniform float sz; uniform int md; uniform vec3 up; uniform vec2 hr; varying vec3 v;
vec3 ramp(float t){t=clamp(t,0.,1.);return t<.25?mix(vec3(.1,.2,.9),vec3(.1,.8,.9),t*4.):t<.5?mix(vec3(.1,.8,.9),vec3(.2,.85,.2),(t-.25)*4.):t<.75?mix(vec3(.2,.85,.2),vec3(.95,.9,.1),(t-.5)*4.):mix(vec3(.95,.9,.1),vec3(.9,.15,.1),(t-.75)*4.);}
void main(){gl_Position=m*vec4(p,1.);gl_PointSize=sz;
 if(md==0)v=c; else if(md==1)v=ramp((dot(p,up)-hr.x)/max(hr.y-hr.x,1e-6)); else v=vec3(.8);}`;
  const FS = `precision mediump float; varying vec3 v; void main(){gl_FragColor=vec4(v,1.);}`;

  const mm = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  function close() { if (!V) return; V.ro && V.ro.disconnect(); V.el.remove(); V = null; const f = document.getElementById('fname'); if (f) f.innerHTML = '<b>No file</b>'; }

  function open(buf, name) {
    close();
    const stage = document.getElementById('stage');
    const el = document.createElement('div'); el.id = 'pcv';
    el.innerHTML = `<canvas id="pcc"></canvas><canvas id="pco"></canvas>
      <div class="pcbar"><button class="btn" data-a="close" type="button">Close scan</button><button class="btn" data-a="fit" type="button">Fit</button><button class="btn" data-a="col" type="button">Colour: –</button><button class="btn" data-a="up" type="button">Up: Z</button><button class="btn pcsave" data-a="save" type="button" hidden>Save file</button><button class="btn" data-a="meas" type="button" aria-pressed="false">Measure</button><label class="pcsz">Size <input type="range" id="pcsz" min="1" max="12" step="0.5" value="2.5"></label></div>
      <div class="pcinfo" id="pcinfo">Reading scan…</div>`;
    stage.appendChild(el);
    V = { el, name, raw: buf, mode: 0, upZ: true, meas: false, pts: [], yaw: 0.8, pit: 0.5, dist: 1, tgt: [0, 0, 0], sz: 2.5, pn: new Map() };
    const fn = document.getElementById('fname'); if (fn) fn.innerHTML = '<b>' + name.replace(/[<&]/g, '') + '</b>';
    const info = el.querySelector('#pcinfo');
    try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) el.querySelector('.pcsave').hidden = false; } catch (e) {}
    setTimeout(() => {
      try {
        const d = parse(buf, name); if (!d.n) throw new Error('No points found in this file.');
        build(d);
      } catch (e) { console.error(e); const m = e && e.message ? e.message : String(e); close(); if (typeof showMsg === 'function') showMsg('Could not open this scan', m); else alert(m); }
    }, 30);
  }

  function build(d) {
    const el = V.el, cv = el.querySelector('#pcc'), ov = el.querySelector('#pco'), n = d.n;
    let x0 = 1e300, x1 = -1e300, y0 = 1e300, y1 = -1e300, z0 = 1e300, z1 = -1e300;
    for (let i = 0; i < n; i++) { const x = d.xs[i], y = d.ys[i], z = d.zs[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const C = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]; V.C = C;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = d.xs[i] - C[0]; pos[i * 3 + 1] = d.ys[i] - C[1]; pos[i * 3 + 2] = d.zs[i] - C[2]; }
    const col = new Uint8Array(n * 3); if (d.rgb) col.set(d.rgb);
    V.pos = pos; V.n = n; V.hasCol = !!d.rgb; V.ext = [x1 - x0, y1 - y0, z1 - z0]; V.rad = Math.hypot(...V.ext) / 2 || 1; V.dist = V.rad * 2.2; V.mode = V.hasCol ? 0 : 1;
    const gl = cv.getContext('webgl', { antialias: false, preserveDrawingBuffer: true }) || cv.getContext('experimental-webgl'); if (!gl) throw new Error('WebGL not available');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = (arr, loc, type, norm) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, loc); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, type, norm, 0, 0); };
    buf(pos, 'p', gl.FLOAT, false); buf(col, 'c', gl.UNSIGNED_BYTE, true);
    const U = (k) => gl.getUniformLocation(pr, k);
    V.gl = gl; V.U = { m: U('m'), sz: U('sz'), md: U('md'), up: U('up'), hr: U('hr') };
    const g2 = ov.getContext('2d');
    const info = el.querySelector('#pcinfo');
    const fmt = (v) => Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3);
    const upv = () => V.upZ ? [0, 0, 1] : [0, 1, 0];
    const basis = () => V.upZ ? { r: [1, 0, 0], f: [0, 1, 0], u: [0, 0, 1] } : { r: [1, 0, 0], f: [0, 0, -1], u: [0, 1, 0] };
    const cam = () => {
      const b = basis(), cp = Math.cos(V.pit), sp = Math.sin(V.pit), cy = Math.cos(V.yaw), sy = Math.sin(V.yaw);
      const dir = [0, 1, 2].map((i) => cp * cy * b.r[i] + cp * sy * b.f[i] + sp * b.u[i]);
      const eye = [0, 1, 2].map((i) => V.tgt[i] + V.dist * dir[i]);
      const f = nrm([-dir[0], -dir[1], -dir[2]]), r = nrm(crs(f, b.u)), u = crs(r, f);
      const w = cv.width, h = cv.height, asp = w / h, fv = 1 / Math.tan(0.5 * 0.9), near = Math.max(V.dist * 0.01, V.rad * 0.0005), far = V.dist + V.rad * 4;
      const P = new Float32Array([fv / asp, 0, 0, 0, 0, fv, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
      const Vm = new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]), -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]), (f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]), 1]);
      return { M: mm(P, Vm), r, u, f };
    };
    const proj = (M, p, w, h) => { const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], z = M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14], ww = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15]; if (ww <= 0) return null; return [(x / ww * 0.5 + 0.5) * w, (1 - (y / ww * 0.5 + 0.5)) * h, z / ww]; };
    const hr = () => { const u = upv(); let lo = 1e300, hi = -1e300; const s = Math.max(1, Math.floor(n / 50000)); for (let i = 0; i < n; i += s) { const v = pos[i * 3] * u[0] + pos[i * 3 + 1] * u[1] + pos[i * 3 + 2] * u[2]; if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
    let HR = hr(), lastM = null;
    const labels = ['Colour: scan', 'Colour: height', 'Colour: plain'];
    const colBtn = el.querySelector('[data-a=col]');
    const setCol = () => { colBtn.textContent = labels[V.mode]; };
    const draw = () => {
      if (!V) return; const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect(), w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = ov.width = w; cv.height = ov.height = h; }
      gl.viewport(0, 0, w, h); gl.clearColor(0.07, 0.08, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
      const c = cam(); lastM = c.M; gl.uniformMatrix4fv(V.U.m, false, c.M); gl.uniform1f(V.U.sz, V.sz * dpr); gl.uniform1i(V.U.md, V.mode); gl.uniform3fv(V.U.up, upv()); gl.uniform2fv(V.U.hr, HR);
      gl.drawArrays(gl.POINTS, 0, n);
      g2.clearRect(0, 0, w, h);
      const sp = V.pts.map((p) => proj(c.M, p, w, h));
      g2.lineWidth = 2 * dpr; g2.strokeStyle = '#ffd400'; g2.fillStyle = '#ffd400'; g2.font = `${13 * dpr}px system-ui,sans-serif`;
      sp.forEach((s) => { if (s) { g2.beginPath(); g2.arc(s[0], s[1], 6 * dpr, 0, 7); g2.stroke(); } });
      if (V.pts.length === 2 && sp[0] && sp[1]) {
        g2.beginPath(); g2.moveTo(sp[0][0], sp[0][1]); g2.lineTo(sp[1][0], sp[1][1]); g2.stroke();
        const a = V.pts[0], b = V.pts[1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], dd = Math.hypot(dx, dy, dz);
        const t = `${fmt(dd)}   (ΔX ${fmt(dx)}  ΔY ${fmt(dy)}  ΔZ ${fmt(dz)})`, mx = (sp[0][0] + sp[1][0]) / 2, my = (sp[0][1] + sp[1][1]) / 2, tw = g2.measureText(t).width;
        g2.fillStyle = 'rgba(0,0,0,.75)'; g2.fillRect(mx - tw / 2 - 6 * dpr, my - 22 * dpr, tw + 12 * dpr, 22 * dpr); g2.fillStyle = '#ffd400'; g2.fillText(t, mx - tw / 2, my - 6 * dpr);
      }
    };
    const status = () => {
      const m = V.meas ? (V.pts.length === 1 ? ' · tap the second point' : V.pts.length === 2 ? ' · tap to start a new measurement' : ' · tap the first point') : '';
      info.textContent = `${n.toLocaleString()} points${d.total > n ? ' (of ' + d.total.toLocaleString() + ', thinned)' : ''} · ${fmt(V.ext[0])} × ${fmt(V.ext[1])} × ${fmt(V.ext[2])}${m}`;
    };
    V.draw = draw; setCol(); status(); draw();
    const fit = () => { V.tgt = [0, 0, 0]; V.dist = V.rad * 2.2; V.yaw = 0.8; V.pit = 0.5; draw(); };
    V.ro = new ResizeObserver(draw); V.ro.observe(el);
    el.querySelector('.pcbar').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return; const k = a.dataset.a;
      if (k === 'close') close();
      else if (k === 'save') { try { window.claude.use('downloads').then((d) => d && d.save({ filename: V.name, data: new Blob([V.raw]) })); } catch (er) { alert('Could not save: ' + er.message); } }
      else if (k === 'fit') fit();
      else if (k === 'col') { V.mode = (V.mode + 1) % 3; if (V.mode === 0 && !V.hasCol) V.mode = 1; setCol(); draw(); }
      else if (k === 'up') { V.upZ = !V.upZ; a.textContent = 'Up: ' + (V.upZ ? 'Z' : 'Y'); HR = hr(); V.pts = V.pts; fit(); }
      else if (k === 'meas') { V.meas = !V.meas; a.setAttribute('aria-pressed', V.meas); a.classList.toggle('on', V.meas); V.pts = []; status(); draw(); }
    });
    el.querySelector('#pcsz').oninput = (e) => { V.sz = +e.target.value; draw(); };
    // picking: nearest projected point, preferring the front-most within a small radius
    const pick = (cx, cy) => {
      const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, px = (cx - r.left) * dpr, py = (cy - r.top) * dpr, M = lastM, w = cv.width, h = cv.height, rad = 14 * dpr;
      let best = -1, bz = 2, bd = 1e30;
      for (let i = 0; i < n; i++) {
        const X = pos[i * 3], Y = pos[i * 3 + 1], Z = pos[i * 3 + 2], ww = M[3] * X + M[7] * Y + M[11] * Z + M[15]; if (ww <= 0) continue;
        const sx = ((M[0] * X + M[4] * Y + M[8] * Z + M[12]) / ww * 0.5 + 0.5) * w, sy = (1 - ((M[1] * X + M[5] * Y + M[9] * Z + M[13]) / ww * 0.5 + 0.5)) * h;
        const dx = sx - px, dy = sy - py, dd = dx * dx + dy * dy; if (dd > rad * rad) continue;
        const z = ww; // depth along view
        const sc = z * 0.02 + Math.sqrt(dd) * V.dist * 0.0015; // blend depth and screen distance
        if (best < 0 || sc < bd) { best = i; bd = sc; }
      }
      if (best < 0) return;
      if (V.pts.length >= 2) V.pts = [];
      V.pts.push([pos[best * 3] + C[0], pos[best * 3 + 1] + C[1], pos[best * 3 + 2] + C[2]].map((v, i) => v - C[i]));
      status(); draw();
    };
    // measuring in centred coords; convert for display identical (differences) so fine.
    // gestures
    const ptr = new Map(); let g0 = null;
    cv.style.touchAction = 'none'; ov.style.pointerEvents = 'none';
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); g0 = { t: Date.now(), x: e.clientX, y: e.clientY, moved: 0 }; });
    cv.addEventListener('pointermove', (e) => {
      if (!ptr.has(e.pointerId)) return; const o = ptr.get(e.pointerId), nx = [e.clientX, e.clientY];
      if (ptr.size === 1) {
        const dx = nx[0] - o[0], dy = nx[1] - o[1]; g0 && (g0.moved += Math.abs(dx) + Math.abs(dy));
        if (e.shiftKey || e.buttons === 2 || e.buttons === 4) pan(dx, dy); else { V.yaw -= dx * 0.008; V.pit = Math.max(-1.5, Math.min(1.5, V.pit + dy * 0.008)); }
        ptr.set(e.pointerId, nx); draw();
      } else if (ptr.size === 2) {
        const ids = [...ptr.keys()], a = ptr.get(ids[0]), b = ptr.get(ids[1]); const d0 = Math.hypot(a[0] - b[0], a[1] - b[1]), c0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        ptr.set(e.pointerId, nx); const a2 = ptr.get(ids[0]), b2 = ptr.get(ids[1]), d1 = Math.hypot(a2[0] - b2[0], a2[1] - b2[1]), c1 = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
        if (d0 > 5 && d1 > 5) V.dist = Math.max(V.rad * 0.002, Math.min(V.rad * 40, V.dist * d0 / d1)); pan(c1[0] - c0[0], c1[1] - c0[1]); g0 && (g0.moved += 99); draw();
      }
    });
    const up = (e) => { if (ptr.size === 1 && g0 && g0.moved < 8 && Date.now() - g0.t < 400 && V.meas && e.type === 'pointerup') pick(e.clientX, e.clientY); ptr.delete(e.pointerId); if (!ptr.size) g0 = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { e.preventDefault(); V.dist = Math.max(V.rad * 0.002, Math.min(V.rad * 40, V.dist * Math.exp(e.deltaY * 0.0012))); draw(); }, { passive: false });
    const pan = (dx, dy) => { const c = cam(), r = cv.getBoundingClientRect(), k = V.dist * Math.tan(0.45) * 2 / r.height; for (let i = 0; i < 3; i++) V.tgt[i] += (-c.r[i] * dx + c.u[i] * dy) * k; };
  }

  window.__scadPC = { detect, open, close, parse };
})();
