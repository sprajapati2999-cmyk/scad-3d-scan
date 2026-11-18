import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = readFileSync('src/S-CAD.html', 'utf8');
const shim = readFileSync('src/native-shim.js', 'utf8');
const imgs = readFileSync('src/help-images.json', 'utf8');
const help = readFileSync('src/help.js', 'utf8');
const core = readFileSync('src/core3d.js', 'utf8');
const ar = readFileSync('src/ar.js', 'utf8');
const photo = readFileSync('src/photo.js', 'utf8');
const ui = readFileSync('src/ui.js', 'utf8');
const dwgphoto = readFileSync('src/dwgphoto.js', 'utf8');
const uicss = readFileSync('src/ui.css', 'utf8');
const pdfutil = readFileSync('src/pdfutil.js', 'utf8');
const pointcloud = readFileSync('src/pointcloud.js', 'utf8');

// Shared: let the file picker show every file (Android greys out unknown extensions like .dwg/.skp).
let base = src.replace('accept=".dwg,.skp,.glb"', 'accept="*/*"');
if (base === src) throw new Error('file input not found; check the source HTML');
// AR needs read access to the 3D controller, which lives in the app's private scope.
const hookFrom = 'let mode3d = false, ctrl = null;';
if (!base.includes(hookFrom)) throw new Error('3D controller declaration not found');
base = base.replace(hookFrom, () => hookFrom + ' window.__scad3dRef = { get ctrl() { return ctrl; }, get buf() { return metaBuf; } };');
// DWG "Project in photo" needs to draw the 2D drawing to an off-screen canvas.
const rpFrom = 'function renderPng() {';
if (!base.includes(rpFrom)) throw new Error('renderPng not found');
base = base.replace(rpFrom, () => `window.__scadCad = { get on() { return !mode3d && !!scene; }, render(area, maxSide, lwMul, win) {
  if (mode3d || !scene) return null;
  let lw, lh, view;
  if (area === 'all' && scene.bb) { const [x0, y0, x1, y1] = scene.bb, w = Math.max(x1 - x0, 1e-6) * 1.08, h = Math.max(y1 - y0, 1e-6) * 1.08, k = 1600 / Math.max(w, h); lw = Math.max(1, Math.round(w * k)); lh = Math.max(1, Math.round(h * k)); view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: k }; }
  else { lw = Math.round(W); lh = Math.round(H); view = { ...V }; }
  if (win && view) { const u0 = win[0], v0 = win[1], u1 = win[2], v1 = win[3]; view = { ...view, cx: view.cx + ((u0 + u1) / 2 - 0.5) * lw / view.s, cy: view.cy - ((v0 + v1) / 2 - 0.5) * lh / view.s }; lw = Math.max(1, Math.round((u1 - u0) * lw)); lh = Math.max(1, Math.round((v1 - v0) * lh)); }
  const S = Math.max(0.5, Math.min(win ? 24 : 4, maxSide / Math.max(lw, lh)));
  const c = document.createElement('canvas'); c.width = Math.round(lw * S); c.height = Math.round(lh * S);
  const sv = { g, W, H, DPR, V: { ...V } };
  g = c.getContext('2d'); W = lw; H = lh; DPR = S; Object.assign(V, view);
  window.__scadLW = lwMul || 1; try { draw({ transparent: true, bar: false }); } finally { window.__scadLW = 1; g = sv.g; W = sv.W; H = sv.H; DPR = sv.DPR; Object.assign(V, sv.V); readTheme(); schedule(); }
  return c;
} };\n` + rpFrom);
const cullFrom = "for (const p of scene.paths) {\n    if (!visibleLayer(p) || !inView(p.bb)) continue;\n    if ((p.bb[2] - p.bb[0] + p.bb[3] - p.bb[1]) * V.s < 1.2) continue;";
if (!base.includes(cullFrom)) throw new Error('cull block not found');
base = base.replace(cullFrom, () => `const visP = []; for (const p of scene.paths) { if (visibleLayer(p) && inView(p.bb)) visP.push(p); }
  const vk = V.cx + ',' + V.cy + ',' + V.s + ',' + W + ',' + H, moved = vk !== window.__scadVk; if (!ex) window.__scadVk = vk;
  if (moved && !ex) { clearTimeout(window.__scadSettle); window.__scadSettle = setTimeout(() => schedule(), 220); }
  // Full precision whenever the view is still (and always when exporting); while panning or zooming, drop sub-pixel strokes only to keep it smooth.
  window.__scadFull = !moved || !!ex;
  const minPx = window.__scadFull ? 0 : (visP.length > 150000 ? 1.2 : 0.08);
  for (const p of visP) {
    if ((p.bb[2] - p.bb[0] + p.bb[3] - p.bb[1]) * V.s < minPx) continue;`);
const txFrom = 'const hp = t.h * V.s; if (hp < 3 || hp > 4000) continue;';
if (!base.includes(txFrom)) throw new Error('text cull not found');
base = base.replace(txFrom, () => 'const hp = t.h * V.s; if (hp < (window.__scadFull ? 0.4 : 3) || hp > 4000) continue;');
const dpFrom = "o.off = !!(l.off || l.frozen); o.on = !o.off;";
if (!base.includes(dpFrom)) throw new Error('layer init not found');
base = base.replace(dpFrom, () => "o.off = !!(l.off || l.frozen); o.on = !o.off && !/^defpoints$/i.test(String(l.name)); // Defpoints is hidden until switched on");

// Text like AutoCAD: text height is the capital-letter height, MTEXT paragraph alignment inside its box, and 1.667 line spacing.
const tpatch = (from, to) => { if (!base.includes(from)) throw new Error('text patch not found: ' + from.slice(0, 50)); base = base.replace(from, () => to); };
tpatch("const tw = (s) => mctx.measureText(s).width / 100;", "const CAPK = 1 / 0.716, LHK = 5 / 3; // AutoCAD height = cap height; Arial caps are 0.716 em\nconst tw = (s) => mctx.measureText(s).width / 100 * CAPK;");
tpatch("const hh = h * sc * 1.25 * n, hs = h * sc;", "const hh = h * sc * LHK * n, hs = h * sc;");
tpatch("base === 'bottom' ? 0 : -(n - 1) * hs * 1.25;", "base === 'bottom' ? 0 : -(n - 1) * hs * LHK;");
tpatch("g.font = `${t.bold ? 'bold ' : ''}${hp}px Arial, \"Helvetica Neue\", Helvetica, sans-serif`;", "g.font = `${t.bold ? 'bold ' : ''}${hp * CAPK}px Arial, \"Helvetica Neue\", Helvetica, sans-serif`;");
tpatch("const lh = hp * 1.25, n = t.lines.length;", "const lh = hp * LHK, n = t.lines.length;");
tpatch("addText(e.text, e.insertionPoint.x, e.insertionPoint.y, th, rot, ['left', 'center', 'right'][col], ['top', 'middle', 'bottom'][row], e, ctx, M, fl, sf(e.styleName), e.rectWidth);",
`let ix = e.insertionPoint.x, iy = e.insertionPoint.y, pal = col;
        const pq = /\\\\p[^;]*q([clrjd])/i.exec(String(e.text).slice(0, 120));
        if (pq && e.rectWidth > 0) { pal = { c: 1, r: 2, l: 0, j: 0, d: 0 }[pq[1].toLowerCase()]; const dd = (pal - col) * e.rectWidth / 2; ix += dd * Math.cos(rot); iy += dd * Math.sin(rot); }
        addText(e.text, ix, iy, th, rot, ['left', 'center', 'right'][pal], ['top', 'middle', 'bottom'][row], e, ctx, M, fl, sf(e.styleName), e.rectWidth);`);

// Tables: this DWG reader leaves ACAD_TABLE entities without their block link and position. Read both from the raw objects.
const fixFn = `function fixTables(lib, dwg, db) {
  const w = lib.wasmInstance, N = lib.dwg_get_num_objects(dwg);
  const rd = (p, n) => new DataView(new Uint8Array(Array.from(lib.dwg_ptr_to_unsigned_char_array(p, n))).buffer);
  const tabs = [];
  for (let i = 0; i < N; i++) {
    const o = lib.dwg_get_object(dwg, i);
    if (w.dwg_object_get_fixedtype(o) !== 721) continue;
    try {
      const ent = rd(o, 40).getUint32(32, true), tp = rd(ent, 40).getUint32(32, true), dv = rd(tp, 160);
      const m = (r, c) => dv.getFloat64(16 + 8 * (4 * r + c), true);
      if (!(Math.abs(Math.hypot(m(0, 0), m(1, 0)) - 1) < 1e-3) || !isFinite(m(0, 3)) || !isFinite(m(1, 3)) || Math.abs(m(0, 3)) > 1e9) continue;
      tabs.push({ h: Number(lib.dwg_obj_get_handle_value(o)), a: Math.atan2(m(1, 0), m(0, 0)), x: m(0, 3), y: m(1, 3) });
    } catch (e) {}
  }
  if (!tabs.length) return;
  const blocks = db.tables.BLOCK_RECORD.entries.filter((b) => /^\\*T\\d+$/i.test(b.name) && b.entities.length).map((b) => ({ b, h: parseInt(b.handle, 16) })).sort((p, q) => p.h - q.h);
  const used = new Set(), map = new Map();
  tabs.sort((p, q) => p.h - q.h);
  for (const t of tabs) { const c = blocks.find((k) => k.h > t.h && !used.has(k.h)); if (c) { used.add(c.h); map.set(t.h, { t, b: c.b }); } }
  for (const br of db.tables.BLOCK_RECORD.entries) for (const e of br.entities) {
    if (e.type !== 'ACAD_TABLE') continue;
    const k = map.get(parseInt(e.handle, 16)); if (!k) continue;
    e.startPoint = { x: k.t.x, y: k.t.y, z: 0 }; e.directionVector = { x: Math.cos(k.t.a), y: Math.sin(k.t.a), z: 0 }; e.blockRecordHandle = k.b.handle;
  }
}
`;
const fixFrom = "let libP = null, fileName = '';";
if (!base.includes(fixFrom)) throw new Error('libP anchor not found');
base = base.replace(fixFrom, () => fixFn + fixFrom);
const cvFrom = "db = lib.convert(dwg);";
if (!base.includes(cvFrom)) throw new Error('convert anchor not found');
base = base.replace(cvFrom, () => "db = lib.convert(dwg); try { fixTables(lib, dwg, db); } catch (e) { console.warn('tables', e); }");

// Dimensions whose stored picture was baked at another position (copies of blocks): re-anchor it on the dimension's own definition points.
const dimFrom = "if (b) { const ln = effLayer(e, ctx); emit(b.entities, M, { layer: ln, ci: effColor(e, ctx, ln), lt: effLt(e, ctx, ln), lw: effLw(e, ctx, ln) }, depth + 1); } else skip('DIMENSION (no block)');";
if (!base.includes(dimFrom)) throw new Error('dimension block not found');
base = base.replace(dimFrom, () => `if (b) { const ln = effLayer(e, ctx);
          let MM = M;
          try {
            if (!b.__gb) { let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18; const add = (p, r) => { if (p && isFinite(p.x) && isFinite(p.y)) { const q = r || 0; x0 = Math.min(x0, p.x - q); x1 = Math.max(x1, p.x + q); y0 = Math.min(y0, p.y - q); y1 = Math.max(y1, p.y + q); } }; for (const q of b.entities) { add(q.startPoint); add(q.endPoint); add(q.insertionPoint); add(q.center, q.radius); for (const v of q.vertices || []) add(v); } b.__gb = x0 < x1 + 1e-9 && x0 > -1e17 ? [x0, y0, x1, y1] : null; }
            const g = b.__gb, ps = [e.definitionPoint, e.subDefinitionPoint1, e.subDefinitionPoint2, e.textPoint].filter((p) => p && isFinite(p.x) && isFinite(p.y) && (p.x || p.y));
            if (g && ps.length >= 2) {
              const dx0 = Math.min(...ps.map((p) => p.x)), dx1 = Math.max(...ps.map((p) => p.x)), dy0 = Math.min(...ps.map((p) => p.y)), dy1 = Math.max(...ps.map((p) => p.y));
              const tol = 0.3 * Math.max(g[2] - g[0], g[3] - g[1]) + 0.05;
              if (dx0 < g[0] - tol || dx1 > g[2] + tol || dy0 < g[1] - tol || dy1 > g[3] + tol) MM = mul(M, [1, 0, 0, 1, (dx0 + dx1) / 2 - (g[0] + g[2]) / 2, (dy0 + dy1) / 2 - (g[1] + g[3]) / 2]);
            }
          } catch (er) {}
          emit(b.entities, MM, { layer: ln, ci: effColor(e, ctx, ln), lt: effLt(e, ctx, ln), lw: effLw(e, ctx, ln) }, depth + 1); } else skip('DIMENSION (no block)');`);

// MTEXT inline colour codes like {\C0;02} (0 = by block, 256 = by layer, 1-255 = colour index): honour them when the whole label uses one colour.
tpatch("    const bold = /^\\{?\\\\[Ff][^;]*\\|b1/.test(String(str));\n    str = cleanText(str);", "    const bold = /^\\{?\\\\[Ff][^;]*\\|b1/.test(String(str));\n    const icc = [...String(str).matchAll(/\\\\C(\\d+);/g)].map((q) => +q[1]);\n    const inlineCi = icc.length && icc.every((v) => v === icc[0]) ? icc[0] : null;\n    str = cleanText(str);");
tpatch("const m = meta(e, ctx);\n    const xa = align", "const m = meta(e, ctx);\n    if (inlineCi !== null) m.ci = inlineCi === 0 ? (ctx.ci ?? m.ci) : inlineCi === 256 ? layerOf(m.ln).ci : (inlineCi > 0 && inlineCi < 256 ? inlineCi : m.ci);\n    const xa = align");
const lwFrom = 'g.strokeStyle = colorCSS(grp.ci); g.lineWidth = grp.px; g.stroke();';
if (!base.includes(lwFrom)) throw new Error('stroke line not found');
base = base.replace(lwFrom, () => 'g.strokeStyle = colorCSS(grp.ci); g.lineWidth = grp.px * (window.__scadLW || 1); g.stroke();');
// Route scan files (point clouds) to the scan viewer.
const ofFrom = "  const buf = await f.arrayBuffer();\n  const head = new TextDecoder('latin1')";
if (!base.includes(ofFrom)) throw new Error('openFile anchor not found');
base = base.replace(ofFrom, () => "  const buf = await f.arrayBuffer();\n  if (window.__scadPC) { window.__scadPC.close(); if (window.__scadPC.detect(f.name, buf)) { window.__scadPC.open(buf, f.name); return; } }\n  const head = new TextDecoder('latin1')");
// Built-in tutorial, injected last so the toolbar exists.
const gate = '<style id="mgate">@media (max-width:760px){html:not(.m-ready) body{visibility:hidden}}</style><script>setTimeout(function(){document.documentElement.classList.add("m-ready")},4000)</script>';
const withHelp = (h) => h.replace('<head>', () => '<head>' + gate).replace('</body>', () => `<style id="mcss">${uicss}</style><script>window.__HELP_IMG__=${imgs};</script><script>${help}</script><script>${pdfutil}</script><script>${pointcloud}</script><script>${core}</script><script>${ar}</script><script>${photo}</script><script>${dwgphoto}</script><script>${ui}</script></body>`);

mkdirSync('www', { recursive: true });
// 1) Standalone offline web copy (what "Share web copy" sends): no native code.
const web = withHelp(base);
writeFileSync('www/S-CAD-web.html', web);
// 2) The app page: web copy + native extras (share sheet, Share web copy button).
const app = withHelp(base).replace('</body>', () => `<script>${shim}</script></body>`);
writeFileSync('www/index.html', app);
console.log('www/index.html', (app.length / 1e6).toFixed(1), 'MB; www/S-CAD-web.html', (web.length / 1e6).toFixed(1), 'MB');
