// Native Android/iOS extras: PNG saving through the share sheet, and "Share web copy".
(() => {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const P = C.Plugins || {};
  const CHUNK = 1.5 * 1024 * 1024; // raw bytes per write; multiple of 3

  const bufToB64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  async function writeBlob(blob, filename) {
    const { Filesystem } = P;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let res;
    for (let off = 0; off < buf.length || off === 0; off += CHUNK) {
      const data = bufToB64(buf.subarray(off, off + CHUNK));
      if (off === 0) res = await Filesystem.writeFile({ path: filename, data, directory: 'CACHE' });
      else await Filesystem.appendFile({ path: filename, data, directory: 'CACHE' });
    }
    return res.uri;
  }

  // The app calls window.claude.use('downloads').save(...) when present (PNG export).
  window.claude = window.claude || {};
  window.claude.use = async (name) => {
    if (name !== 'downloads') return null;
    return {
      save: async ({ filename, data }) => {
        const uri = await writeBlob(data, filename);
        await P.Share.share({ title: filename, url: uri, dialogTitle: 'Save or share ' + filename });
      },
    };
  };

  // "Share web copy": send the standalone offline web app to someone who doesn't have the app.
  function addShareButton() {
    const host = document.querySelector('.tools') || document.querySelector('.bar') || document.body;
    const b = document.createElement('button');
    b.className = 'btn'; b.type = 'button'; b.id = 'shareWeb'; b.textContent = 'Share web copy';
    b.onclick = async () => {
      const old = b.textContent; b.disabled = true; b.textContent = 'Preparing…';
      try {
        const r = await fetch('S-CAD-web.html'); if (!r.ok) throw new Error('web copy missing');
        const uri = await writeBlob(await r.blob(), 'S-CAD-offline.html');
        b.textContent = old;
        await P.Share.share({
          title: 'S-CAD offline viewer',
          text: 'S-CAD: open DWG, SketchUp and GLB files. Save this file, then open it in Chrome or any browser. It works offline.',
          url: uri,
          dialogTitle: 'Share S-CAD web copy',
        });
      } catch (e) {
        if (!/cancel/i.test(String(e && (e.message || e)))) alert('Could not share the web copy: ' + (e && e.message ? e.message : e));
      } finally { b.disabled = false; b.textContent = old; }
    };
    host.appendChild(b);
  }
  addShareButton();

  // "3D scan": native depth scan (ARCore). Result is a PLY in the cache folder, opened in the scan viewer.
  function addScanButton() {
    let Scan = null;
    try { Scan = C.registerPlugin ? C.registerPlugin('Scan') : P.Scan; } catch (e) { Scan = P.Scan; }
    if (!Scan) return;
    const host = document.querySelector('.tools') || document.querySelector('.bar') || document.body;
    const b = document.createElement('button');
    b.className = 'btn'; b.type = 'button'; b.id = 'scan3d'; b.textContent = '3D scan';
    b.onclick = async () => {
      const old = b.textContent; b.disabled = true;
      try {
        const r = await Scan.start();
        if (!r || r.cancelled || !r.file) { if (r && r.error) alert(r.error); return; }
        b.textContent = 'Opening…';
        const rd = await P.Filesystem.readFile({ path: r.file, directory: 'CACHE' });
        const bin = atob(rd.data), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        window.__scadPC.open(u8.buffer, 'scan-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.ply');
      } catch (e) { alert('3D scan failed: ' + (e && e.message ? e.message : e)); }
      finally { b.disabled = false; b.textContent = old; }
    };
    host.appendChild(b);
  }
  addScanButton();
})();
