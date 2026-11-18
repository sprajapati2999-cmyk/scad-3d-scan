// Shared 3D core for S-CAD AR and Place-in-photo: math, GLB loader, WebGL2 renderer with light controls,
// planar shadows, rotation gizmo helpers, gesture helper, sun position. No dependencies, works offline.
(() => {
  'use strict';
  const S = (window.__S3D = {});

  // ---------- math (column-major mat4 as Float32Array(16)) ----------
  const I = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k]; o[c*4+r] = s; } return o; };
  const trans = (x, y, z) => { const m = I(); m[12] = x; m[13] = y; m[14] = z; return m; };
  const scal = (x, y, z) => { const m = I(); m[0] = x; m[5] = y; m[10] = z; return m; };
  const rotAxis = (ax, a) => { // Rodrigues, ax need not be normalised
    const l = Math.hypot(ax[0], ax[1], ax[2]) || 1, x = ax[0]/l, y = ax[1]/l, z = ax[2]/l, c = Math.cos(a), s = Math.sin(a), t = 1 - c, m = I();
    m[0] = t*x*x + c; m[1] = t*x*y + s*z; m[2] = t*x*z - s*y;
    m[4] = t*x*y - s*z; m[5] = t*y*y + c; m[6] = t*y*z + s*x;
    m[8] = t*x*z + s*y; m[9] = t*y*z - s*x; m[10] = t*z*z + c; return m;
  };
  const rotY = (a) => rotAxis([0, 1, 0], a);
  const fromTRS = (t, q, s) => {
    const [x, y, z, w] = q, m = I();
    m[0] = (1 - 2*(y*y + z*z)) * s[0]; m[1] = 2*(x*y + z*w) * s[0]; m[2] = 2*(x*z - y*w) * s[0];
    m[4] = 2*(x*y - z*w) * s[1]; m[5] = (1 - 2*(x*x + z*z)) * s[1]; m[6] = 2*(y*z + x*w) * s[1];
    m[8] = 2*(x*z + y*w) * s[2]; m[9] = 2*(y*z - x*w) * s[2]; m[10] = (1 - 2*(x*x + y*y)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m;
  };
  const xform = (m, p) => [m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12], m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13], m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]];
  const xdir = (m, p) => [m[0]*p[0] + m[4]*p[1] + m[8]*p[2], m[1]*p[0] + m[5]*p[1] + m[9]*p[2], m[2]*p[0] + m[6]*p[1] + m[10]*p[2]];
  const inv4 = (m) => {
    const a = m, o = new Float32Array(16);
    const b00 = a[0]*a[5] - a[1]*a[4], b01 = a[0]*a[6] - a[2]*a[4], b02 = a[0]*a[7] - a[3]*a[4], b03 = a[1]*a[6] - a[2]*a[5], b04 = a[1]*a[7] - a[3]*a[5], b05 = a[2]*a[7] - a[3]*a[6];
    const b06 = a[8]*a[13] - a[9]*a[12], b07 = a[8]*a[14] - a[10]*a[12], b08 = a[8]*a[15] - a[11]*a[12], b09 = a[9]*a[14] - a[10]*a[13], b10 = a[9]*a[15] - a[11]*a[13], b11 = a[10]*a[15] - a[11]*a[14];
    let d = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06; if (!d) return I(); d = 1 / d;
    o[0] = (a[5]*b11 - a[6]*b10 + a[7]*b09) * d; o[1] = (a[2]*b10 - a[1]*b11 - a[3]*b09) * d; o[2] = (a[13]*b05 - a[14]*b04 + a[15]*b03) * d; o[3] = (a[10]*b04 - a[9]*b05 - a[11]*b03) * d;
    o[4] = (a[6]*b08 - a[4]*b11 - a[7]*b07) * d; o[5] = (a[0]*b11 - a[2]*b08 + a[3]*b07) * d; o[6] = (a[14]*b02 - a[12]*b05 - a[15]*b01) * d; o[7] = (a[8]*b05 - a[10]*b02 + a[11]*b01) * d;
    o[8] = (a[4]*b10 - a[5]*b08 + a[7]*b06) * d; o[9] = (a[1]*b08 - a[0]*b10 - a[3]*b06) * d; o[10] = (a[12]*b04 - a[13]*b02 + a[15]*b00) * d; o[11] = (a[9]*b02 - a[8]*b04 - a[11]*b00) * d;
    o[12] = (a[5]*b07 - a[4]*b09 - a[6]*b06) * d; o[13] = (a[0]*b09 - a[1]*b07 + a[2]*b06) * d; o[14] = (a[13]*b01 - a[12]*b03 - a[14]*b00) * d; o[15] = (a[8]*b03 - a[9]*b01 + a[10]*b00) * d;
    return o;
  };
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const mulv = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
  Object.assign(S, { I, mul, trans, scal, rotAxis, rotY, fromTRS, xform, xdir, inv4, dot, sub, add, mulv, cross, norm });

  // ---------- rays and planes ----------
  S.rayFrom = (invVP, nx, ny) => { // nx, ny in -1..1 (y up)
    const un = (z) => { const v = [invVP[0]*nx + invVP[4]*ny + invVP[8]*z + invVP[12], invVP[1]*nx + invVP[5]*ny + invVP[9]*z + invVP[13], invVP[2]*nx + invVP[6]*ny + invVP[10]*z + invVP[14]], w = invVP[3]*nx + invVP[7]*ny + invVP[11]*z + invVP[15]; return [v[0]/w, v[1]/w, v[2]/w]; };
    const a = un(-1), b = un(1); return { o: a, d: norm(sub(b, a)) };
  };
  S.planeHit = (ray, p, n) => { const dn = dot(ray.d, n); if (Math.abs(dn) < 1e-6) return null; const t = dot(sub(p, ray.o), n) / dn; return t > 0 ? add(ray.o, mulv(ray.d, t)) : null; };

  // ---------- sun ----------
  S.sunPos = (dateUTC, latDeg, lonDeg) => {
    const rad = Math.PI / 180, jd = dateUTC.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24, lst = (((gmst * 15 + lonDeg) % 360) + 360) % 360 * rad, H = lst - ra, lat = latDeg * rad;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H));
    return { az: (az + 2 * Math.PI) % (2 * Math.PI), el };
  };
  // Direction towards the sun in world space (y up). north = world yaw of north, clockwise from -Z seen from above.
  S.sunVec = (az, el, north = 0) => { const a = az + north; return [Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el)]; };

  // ---------- GLB ----------
  const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function parseGLB(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Not a GLB file');
    let off = 12, json = null, bin = null;
    while (off + 8 <= u8.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), start = off + 8;
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(u8.subarray(start, start + len)));
      else if (type === 0x004E4942 && !bin) bin = u8.subarray(start, start + len);
      off = start + len + ((4 - (len % 4)) % 4);
    }
    if (!json) throw new Error('GLB has no JSON');
    return { json, bin };
  }
  function accessor(g, idx) {
    const a = g.json.accessors[idx], bv = g.json.bufferViews[a.bufferView];
    const T = COMP[a.componentType], n = NCOMP[a.type], bytes = T.BYTES_PER_ELEMENT;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * bytes;
    const src = new Uint8Array(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
    const out = new T(a.count * n);
    if (stride === n * bytes) new Uint8Array(out.buffer).set(src.subarray(base, base + a.count * n * bytes));
    else { const dv = new DataView(src.buffer, src.byteOffset); for (let i = 0; i < a.count; i++) for (let j = 0; j < n; j++) { const p = base + i * stride + j * bytes, c = a.componentType; out[i*n+j] = c === 5126 ? dv.getFloat32(p, true) : c === 5123 ? dv.getUint16(p, true) : c === 5125 ? dv.getUint32(p, true) : c === 5121 ? dv.getUint8(p) : c === 5122 ? dv.getInt16(p, true) : dv.getInt8(p); } }
    if (a.normalized && T !== Float32Array) { const f = new Float32Array(out.length), d = T === Uint8Array ? 255 : T === Uint16Array ? 65535 : T === Int8Array ? 127 : 32767; for (let i = 0; i < out.length; i++) f[i] = Math.max(out[i] / d, -1); return { data: f, n, count: a.count }; }
    return { data: out, n, count: a.count };
  }
  S.parseGLB = parseGLB;

  // ---------- renderer ----------
  const VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec2 aUv;
uniform mat4 uVP, uM; out vec3 vN; out vec2 vUv;
void main(){ vN = mat3(uM) * aNor; vUv = aUv; gl_Position = uVP * uM * vec4(aPos, 1.0); }`;
  const FS = `#version 300 es
precision mediump float;
in vec3 vN; in vec2 vUv; out vec4 o;
uniform vec4 uColor; uniform sampler2D uTex; uniform int uHasTex, uFlat, uMode; uniform float uAlphaCut, uSA, uInt, uAmb;
uniform vec3 uLight, uTint;
void main(){
  if (uMode == 1) { o = vec4(0.0, 0.0, 0.0, uSA); return; }
  vec4 c = uColor; if (uHasTex == 1) c *= texture(uTex, vUv);
  if (uAlphaCut > 0.0 && c.a < uAlphaCut) discard;
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(uLight);
  float d = uFlat == 1 ? 1.0 : uAmb + uInt * max(dot(n, L), 0.0) + 0.25 * uAmb * max(dot(n, -vec3(L.x, 0.0, L.z)), 0.0);
  o = vec4(c.rgb * uTint * min(d, 1.25), c.a);
}`;
  S.makeRenderer = (gl) => {
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNor'); gl.bindAttribLocation(p, 2, 'aUv');
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; for (const k of ['uVP', 'uM', 'uColor', 'uTex', 'uHasTex', 'uFlat', 'uMode', 'uAlphaCut', 'uSA', 'uInt', 'uAmb', 'uLight', 'uTint']) u[k] = gl.getUniformLocation(p, k);
    const R = { gl, p, u, light: { dir: [0.4, 0.9, 0.3], int: 0.55, amb: 0.45, tint: [1, 1, 1] } };
    R.setLight = (l) => Object.assign(R.light, l);
    const useLight = () => { gl.useProgram(p); gl.uniform3fv(u.uLight, R.light.dir); gl.uniform1f(u.uInt, R.light.int); gl.uniform1f(u.uAmb, R.light.amb); gl.uniform3fv(u.uTint, R.light.tint); gl.uniform1i(u.uTex, 0); };
    const setup = (vp) => { useLight(); gl.uniformMatrix4fv(u.uVP, false, vp); };

    R.draw = (model, vp, base, o = {}) => {
      setup(vp); gl.uniform1i(u.uFlat, 0); gl.uniform1i(u.uMode, 0);
      for (const pass of [false, true]) for (const { d, m } of model.draws) {
        if (d.blend !== pass) continue;
        gl.uniformMatrix4fv(u.uM, false, mul(base, m)); gl.uniform4fv(u.uColor, d.color); gl.uniform1f(u.uAlphaCut, d.cut);
        if (d.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, d.tex); gl.uniform1i(u.uHasTex, 1); } else gl.uniform1i(u.uHasTex, 0);
        if (d.double || o.noCull) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
        if (d.blend) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); }
        gl.bindVertexArray(d.vao); gl.drawElements(gl.TRIANGLES, d.count, d.type, 0);
      }
      gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
    };

    // Planar shadow of the model on a plane (point p, normal n) along the light direction. MAX blending keeps overlaps from stacking.
    R.shadow = (model, vp, base, plane, alpha) => {
      const s = R.light.dir, n = plane.n, d = -dot(n, plane.p), ns = dot(n, s);
      if (ns < 0.05) return; // sun below the plane or grazing: no shadow
      const m = new Float32Array(16); const sn = [s[0], s[1], s[2], 0], pl = [n[0], n[1], n[2], d];
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) m[c*4+r] = (r === c ? ns : 0) - sn[r] * pl[c];
      setup(vp); gl.uniform1i(u.uMode, 1); gl.uniform1f(u.uSA, alpha); gl.uniform1f(u.uAlphaCut, 0);
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
      const lift = trans(n[0] * 0.002, n[1] * 0.002, n[2] * 0.002), proj = mul(lift, m);
      for (const { d: dr, m: mm } of model.draws) { if (dr.blend) continue; gl.uniformMatrix4fv(u.uM, false, mul(proj, mul(base, mm))); gl.bindVertexArray(dr.vao); gl.drawElements(gl.TRIANGLES, dr.count, dr.type, 0); }
      gl.depthMask(true); gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND); gl.uniform1i(u.uMode, 0); gl.bindVertexArray(null);
    };

    // Simple unlit shapes (gizmo rings, measure markers)
    const shape = (pos, nor, idx) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vb = (data, loc, n) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); };
      vb(pos, 0, 3); vb(nor, 1, 3); gl.vertexAttrib2f(2, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW); gl.bindVertexArray(null);
      return { vao, count: idx.length };
    };
    const torus = (() => {
      const A = 64, B = 10, r = 0.022, pos = [], nor = [], idx = [];
      for (let i = 0; i <= A; i++) { const a = i / A * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); for (let j = 0; j <= B; j++) { const b = j / B * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b); pos.push((1 + r * cb) * ca, r * sb, (1 + r * cb) * sa); nor.push(cb * ca, sb, cb * sa); } }
      for (let i = 0; i < A; i++) for (let j = 0; j < B; j++) { const a = i * (B + 1) + j, b = (i + 1) * (B + 1) + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      return shape(pos, nor, idx);
    })();
    const cube = (() => {
      const f = [[[1,0,0],[0,1,0],[0,0,1]], [[-1,0,0],[0,0,1],[0,1,0]], [[0,1,0],[0,0,1],[1,0,0]], [[0,-1,0],[1,0,0],[0,0,1]], [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[0,1,0],[1,0,0]]];
      const pos = [], nor = [], idx = [];
      f.forEach(([n, u1, v1], k) => { for (const [a, b] of [[-1,-1],[1,-1],[1,1],[-1,1]]) { pos.push(n[0] + u1[0]*a + v1[0]*b, n[1] + u1[1]*a + v1[1]*b, n[2] + u1[2]*a + v1[2]*b); nor.push(...n); } idx.push(k*4, k*4+1, k*4+2, k*4, k*4+2, k*4+3, k*4, k*4+2, k*4+1, k*4, k*4+3, k*4+2); });
      return shape(pos, nor, idx);
    })();
    R.shapes = { torus, cube };
    R.drawShape = (sh, vp, m, color, o = {}) => {
      setup(vp); gl.uniform1i(u.uFlat, 1); gl.uniform1i(u.uMode, 0); gl.uniform1i(u.uHasTex, 0); gl.uniform1f(u.uAlphaCut, 0); gl.uniformMatrix4fv(u.uM, false, m); gl.uniform4fv(u.uColor, color);
      gl.disable(gl.CULL_FACE); if (o.onTop) gl.disable(gl.DEPTH_TEST); else gl.enable(gl.DEPTH_TEST);
      if (color[3] < 1) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
      gl.bindVertexArray(sh.vao); gl.drawElements(gl.TRIANGLES, sh.count, gl.UNSIGNED_SHORT, 0); gl.bindVertexArray(null); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    };
    // Segment between two world points drawn as a thin box
    R.drawLine = (vp, a, b, thick, color, o) => {
      const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]); if (len < 1e-6) return;
      const x = mulv(d, 1 / len); let up = Math.abs(x[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]; const z = norm(cross(x, up)), y = cross(z, x);
      const m = new Float32Array([x[0],x[1],x[2],0, y[0],y[1],y[2],0, z[0],z[1],z[2],0, (a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2, 1]);
      R.drawShape(R.shapes.cube, vp, mul(m, scal(len / 2, thick, thick)), color, o);
    };
    // Rotation gizmo: yaw ring (about world Y) at floor level, optional tilt rings (about world X and Z) through the pivot.
    R.drawGizmo = (vp, floorC, pivot, radius, tilt, active) => {
      const col = (i, c) => active === i ? [1, 1, 1, 1] : c;
      R.drawShape(R.shapes.torus, vp, mul(trans(floorC[0], floorC[1], floorC[2]), scal(radius, radius, radius)), col(0, [0.94, 0.64, 0.23, 1]), { onTop: true });
      if (tilt) {
        R.drawShape(R.shapes.torus, vp, mul(mul(trans(pivot[0], pivot[1], pivot[2]), rotAxis([0, 0, 1], Math.PI / 2)), scal(radius, radius, radius)), col(1, [0.9, 0.3, 0.3, 1]), { onTop: true });
        R.drawShape(R.shapes.torus, vp, mul(mul(trans(pivot[0], pivot[1], pivot[2]), rotAxis([1, 0, 0], Math.PI / 2)), scal(radius, radius, radius)), col(2, [0.3, 0.6, 0.95, 1]), { onTop: true });
      }
    };
    R.dispose = () => { const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); };

    R.build = async (glb) => {
      const g = parseGLB(glb), J = g.json, textures = [];
      const tex = async (i) => {
        if (i == null) return null; if (textures[i] !== undefined) return textures[i];
        textures[i] = null;
        try {
          const im = J.images[J.textures[i].source]; let blob;
          if (im.bufferView != null) { const bv = J.bufferViews[im.bufferView]; blob = new Blob([g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: im.mimeType || 'image/png' }); }
          else if (im.uri) blob = await (await fetch(im.uri)).blob();
          const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
          const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
          gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          const sm = (J.samplers && J.samplers[J.textures[i].sampler || 0]) || {}, wrap = (w) => w === 33071 ? gl.CLAMP_TO_EDGE : w === 33648 ? gl.MIRRORED_REPEAT : gl.REPEAT;
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap(sm.wrapS)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap(sm.wrapT));
          textures[i] = t;
        } catch (e) { console.warn('texture failed', e); }
        return textures[i];
      };
      const draws = [], min = [1e30, 1e30, 1e30], max = [-1e30, -1e30, -1e30];
      const nodes = J.nodes || [], roots = (J.scenes && J.scenes[J.scene || 0] || {}).nodes || nodes.map((_, i) => i), cache = new Map();
      async function meshDraws(mi) {
        if (cache.has(mi)) return cache.get(mi);
        const list = [];
        for (const pr of J.meshes[mi].primitives) {
          if ((pr.mode ?? 4) !== 4 || pr.attributes.POSITION == null) continue;
          const P = accessor(g, pr.attributes.POSITION); let idx = pr.indices != null ? accessor(g, pr.indices).data : null;
          if (!idx) { idx = new Uint32Array(P.count); for (let i = 0; i < P.count; i++) idx[i] = i; }
          const N = pr.attributes.NORMAL != null ? accessor(g, pr.attributes.NORMAL).data : null, UV = pr.attributes.TEXCOORD_0 != null ? accessor(g, pr.attributes.TEXCOORD_0).data : null;
          let pos = P.data, nor = N, uvD = UV, ind = idx;
          if (!N) {
            const np = new Float32Array(idx.length * 3), nn = new Float32Array(idx.length * 3), nu = UV ? new Float32Array(idx.length * 2) : null;
            for (let t = 0; t + 2 < idx.length; t += 3) {
              const a = idx[t] * 3, b = idx[t+1] * 3, c = idx[t+2] * 3, ux = P.data[b]-P.data[a], uy = P.data[b+1]-P.data[a+1], uz = P.data[b+2]-P.data[a+2], vx = P.data[c]-P.data[a], vy = P.data[c+1]-P.data[a+1], vz = P.data[c+2]-P.data[a+2];
              let nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
              [a, b, c].forEach((v, k) => { np.set(P.data.subarray(v, v + 3), (t + k) * 3); nn.set([nx, ny, nz], (t + k) * 3); if (nu) nu.set(UV.subarray(idx[t+k] * 2, idx[t+k] * 2 + 2), (t + k) * 2); });
            }
            pos = np; nor = nn; uvD = nu; ind = new Uint32Array(idx.length); for (let i = 0; i < ind.length; i++) ind[i] = i;
          }
          const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
          const vb = (data, loc, n) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); };
          vb(pos, 0, 3); vb(nor, 1, 3); if (uvD) vb(uvD, 2, 2); else gl.vertexAttrib2f(2, 0, 0);
          const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ind, gl.STATIC_DRAW); gl.bindVertexArray(null);
          const mat = pr.material != null ? J.materials[pr.material] : {}, pbr = mat.pbrMetallicRoughness || {}, bt = pbr.baseColorTexture, t = bt && uvD ? await tex(bt.index) : null;
          list.push({ vao, count: ind.length, type: ind instanceof Uint32Array ? gl.UNSIGNED_INT : (ind instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE), color: pbr.baseColorFactor || [1, 1, 1, 1], tex: t, blend: mat.alphaMode === 'BLEND', cut: mat.alphaMode === 'MASK' ? (mat.alphaCutoff ?? 0.5) : 0, double: !!mat.doubleSided, pos: pos, idx: ind });
        }
        cache.set(mi, list); return list;
      }
      async function walk(ni, parent) {
        const n = nodes[ni], local = n.matrix ? Float32Array.from(n.matrix) : fromTRS(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]), world = mul(parent, local);
        if (n.mesh != null) for (const d of await meshDraws(n.mesh)) {
          draws.push({ d, m: world }); const p = d.pos, step = 3 * Math.max(1, Math.floor(p.length / 3 / 4000));
          for (let i = 0; i < p.length; i += step) { const w = xform(world, [p[i], p[i+1], p[i+2]]); for (let k = 0; k < 3; k++) { if (w[k] < min[k]) min[k] = w[k]; if (w[k] > max[k]) max[k] = w[k]; } }
        }
        for (const c of n.children || []) await walk(c, world);
      }
      for (const r of roots) await walk(r, I());
      if (!draws.length) throw new Error('This model has nothing to show');
      const size = [max[0]-min[0], max[1]-min[1], max[2]-min[2]], centre = [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2];
      return { draws, min, max, size, centre, diag: Math.hypot(size[0], size[2]) };
    };
    return R;
  };

  // ---------- model placement state ----------
  // pos = world position of the model's bounding-box centre, rot = rotation matrix, scale = uniform scale
  S.newPlacement = (model, pos, scale) => ({ pos: pos.slice(), rot: I(), scale, model });
  S.baseMatrix = (st) => { const c = st.model.centre; return mul(mul(trans(st.pos[0], st.pos[1], st.pos[2]), st.rot), mul(scal(st.scale, st.scale, st.scale), trans(-c[0], -c[1], -c[2]))); };
  S.isUpright = (st) => st.rot[5] > 0.9995;
  S.restOnFloor = (st, floorY) => { st.pos[1] = floorY + (st.model.centre[1] - st.model.min[1]) * st.scale; }; // only valid when upright
  S.gizmoRadius = (st) => Math.max(0.5 * Math.hypot(st.model.size[0], st.model.size[1], st.model.size[2]) * st.scale * 0.8, 0.12);
  const AXES = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];
  S.AXES = AXES;
  S.gizmoPick = (ray, floorC, pivot, R, tilt) => {
    let best = -1, bestE = Infinity; const tol = Math.max(0.28 * R, 0.07);
    for (let i = 0; i < (tilt ? 3 : 1); i++) {
      const c = i === 0 ? floorC : pivot, p = S.planeHit(ray, c, AXES[i]); if (!p) continue;
      const e = Math.abs(Math.hypot(p[0]-c[0], p[1]-c[1], p[2]-c[2]) - R); if (e < tol && e < bestE) { best = i; bestE = e; }
    }
    return best;
  };
  S.ringAngle = (ray, c, axIdx) => {
    const ax = AXES[axIdx], p = S.planeHit(ray, c, ax); if (!p) return null;
    const u = norm(cross(ax, Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), v = cross(ax, u), r = sub(p, c);
    return Math.atan2(dot(r, v), dot(r, u));
  };
  S.wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  // ---------- touch gestures: 1 finger drag/tap, 2 finger pinch + twist ----------
  S.gestures = (el, h) => {
    const ptr = new Map(); let t0 = 0, moved = 0, two = null;
    const pt = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
    const pair = () => { const [a, b] = [...ptr.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) {}
      const p = pt(e); ptr.set(e.pointerId, p);
      if (ptr.size === 1) { t0 = performance.now(); moved = 0; h.down && h.down(p); } else if (ptr.size === 2) { two = pair(); h.start2 && h.start2(); moved = 99; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!ptr.has(e.pointerId)) return; e.preventDefault(); const p = pt(e), old = ptr.get(e.pointerId); ptr.set(e.pointerId, p);
      if (ptr.size === 1) { moved += Math.hypot(p.x - old.x, p.y - old.y); h.move && h.move(p); }
      else if (ptr.size === 2 && two) { const n = pair(); h.pinch && h.pinch(n.d / two.d, S.wrap(n.a - two.a), { x: n.mx, y: n.my, w: p.w, h: p.h }); two = n; }
    });
    const up = (e) => {
      if (!ptr.has(e.pointerId)) return; const p = pt(e), n = ptr.size; ptr.delete(e.pointerId);
      if (n === 1) { if (moved < 10 && performance.now() - t0 < 500) h.tap && h.tap(p); h.up && h.up(p); }
      if (ptr.size < 2) two = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };

  S.fmtDist = (m) => { try { const c = window.__scad3dRef && window.__scad3dRef.ctrl; if (c && c.fmt) return c.fmt(m); } catch (e) {} return m >= 1 ? m.toFixed(2) + ' m' : (m * 100).toFixed(1) + ' cm'; };
  S.store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  S.glb = async () => { const r = window.__scad3dRef; if (!r || !r.ctrl) throw new Error('Open a 3D model first'); const c = r.ctrl; if (c.source === 'glb') { const b = r.buf; return b instanceof Uint8Array ? b : new Uint8Array(b); } return c.exportGlb({ textures: true, meta: {} }); };
  S.has3d = () => { const r = window.__scad3dRef; return !!(r && r.ctrl); };
})();
