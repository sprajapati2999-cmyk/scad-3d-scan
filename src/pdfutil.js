// Tiny PDF writer: one page per canvas (JPEG inside), plus a shared "save a blob" helper.
(function () {
  const enc = (s) => new TextEncoder().encode(s);
  async function save(blob, name) {
    let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) {}
    if (dl) { await dl.save({ filename: name, data: blob }); return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  // pages: [{ canvas, title? }] -> Blob (application/pdf)
  function pdf(pages) {
    const parts = [], offs = []; let len = 0;
    const put = (d) => { const u = typeof d === 'string' ? enc(d) : d; parts.push(u); len += u.length; };
    const obj = (n, body) => { offs[n] = len; put(n + ' 0 obj\n'); put(body); put('\nendobj\n'); };
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const n = pages.length, kids = pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
    pages.forEach((p, i) => {
      const c = p.canvas, w = c.width, h = c.height, pw = +(w * 0.75).toFixed(2), ph = +(h * 0.75).toFixed(2), id = 3 + i * 3;
      const b64 = c.toDataURL('image/jpeg', 0.92).split(',')[1], bin = atob(b64), jb = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) jb[k] = bin.charCodeAt(k);
      const cont = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
      obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents ${id + 1} 0 R /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> >>`);
      obj(id + 1, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`);
      offs[id + 2] = len; put(`${id + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jb.length} >>\nstream\n`); put(jb); put('\nendstream\nendobj\n');
    });
    const total = 3 + n * 3, xr = len;
    put(`xref\n0 ${total}\n0000000000 65535 f \n`); for (let k = 1; k < total; k++) put(String(offs[k]).padStart(10, '0') + ' 00000 n \n');
    put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  window.__scadFile = { save, pdf };
})();
