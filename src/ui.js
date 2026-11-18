// Full screen toggle for the main toolbar.
(() => {
  const el = document.documentElement;
  if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return;
  function add() {
    const host = document.querySelector('.tools'); if (!host) return;
    const b = document.createElement('button'); b.className = 'btn'; b.id = 'fsBtn'; b.type = 'button'; b.textContent = 'Full screen'; b.setAttribute('aria-pressed', 'false');
    const on = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    b.onclick = () => { try { if (on()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (e) {} };
    const sync = () => { b.textContent = on() ? 'Exit full screen' : 'Full screen'; b.setAttribute('aria-pressed', on()); };
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
    host.insertBefore(b, host.querySelector('#theme') || null);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();

// ---------- phone layout: glass top card, one bottom bar, "Space" and "More" sheets (desktop is unchanged) ----------
(() => {

  const ic = {
    open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    sel: '<path d="M5 3l14 7-6 2-2 6z"/>', meas: '<path d="M3 17L17 3l4 4L7 21z M8 12l2 2 M11 9l2 2 M14 6l2 2"/>',
    lay: '<path d="M12 3l9 5-9 5-9-5z M3 13l9 5 9-5"/>', space: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5"/>',
    fs: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>', more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ic[k]}</svg>`;
  function build() {
    const bar = document.querySelector('.bar'), tools = document.querySelector('.tools'); if (!bar || !tools) return;
    const $ = (s) => document.querySelector(s), click = (s) => { const b = $(s); if (b && !b.disabled) b.click(); };
    const top = document.createElement('div'); top.id = 'mtop';
    top.innerHTML = `<button id="mFs" aria-label="Full screen">${svg('fs')}</button><button id="mMore" aria-label="More options" aria-expanded="false">${svg('more')}</button>`;
    const chip = document.createElement('div'); chip.id = 'mchip'; chip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ic.open + '</svg><div style="min-width:0"><b>S-CAD</b><small>DWG &amp; SketchUp viewer</small></div>'; bar.insertBefore(chip, bar.firstChild); bar.appendChild(top);
    const fitB = document.createElement('button'); fitB.id = 'mFit'; fitB.type = 'button'; fitB.setAttribute('aria-label', 'Fit to screen'); fitB.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'; document.body.appendChild(fitB); fitB.onclick = () => click('#fit');
    const info = $('#info'), upd = () => { if (!info) return; const kv = {}; info.querySelectorAll('dt').forEach((dt) => { const dd = dt.nextElementSibling; if (dd) kv[dt.textContent.trim()] = dd.textContent.trim(); }); const nm = kv.File; if (!nm) return; const extra = kv.Triangles ? kv.Triangles + ' triangles' : (kv.Format || ''); chip.querySelector('b').textContent = nm; chip.querySelector('small').textContent = extra + (kv['Model size'] && !extra ? kv['Model size'] : ''); };
    if (info) { new MutationObserver(upd).observe(info, { childList: true, subtree: true }); upd(); }
    const mb = document.createElement('nav'); mb.id = 'mbar'; mb.setAttribute('aria-label', 'Main tools');
    const tab = (id, k, t, cls) => `<button id="${id}" type="button"${cls ? ` class="${cls}"` : ''}><span class="ic">${svg(k)}</span>${t}</button>`;
    mb.innerHTML = tab('mOpen', 'open', 'Open') + tab('mSel', 'sel', 'Select') + tab('mMeas', 'meas', 'Measure') + tab('mLay', 'lay', 'Layers') + tab('mSpace', 'space', 'Space', 'sp');
    document.body.appendChild(mb);
    const scrim = document.createElement('div'); scrim.id = 'mscrim'; document.body.appendChild(scrim);
    const sheet = document.createElement('div'); sheet.id = 'msheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'View in space'); document.body.appendChild(sheet);
    const closeAll = () => { sheet.classList.remove('on'); tools.classList.remove('sheet'); scrim.classList.remove('on'); $('#mMore').setAttribute('aria-expanded', 'false'); };
    scrim.onclick = closeAll;
    const isSkp = () => document.documentElement.getAttribute('data-mode') === 'skp';
    const openSpace = () => {
      closeAll();
      const ar = $('#arBtn'), arOk = ar && !ar.hidden && !ar.disabled, ph = isSkp() ? $('#photoBtn') : $('#dwgPhotoBtn');
      let h = '<h3>View in space</h3><p>Pick how you want to see this ' + (isSkp() ? 'model' : 'drawing') + '</p>';
      if (isSkp()) h += arOk ? `<button class="opt main" data-go="#arBtn">${svg('space')}<span><b>Live AR</b><small>Place it with your camera</small></span></button>` : `<button class="opt" disabled style="opacity:.55">${svg('space')}<span><b>Live AR</b><small>Needs Chrome on an ARCore phone over https</small></span></button>`;
      h += `<button class="opt${isSkp() ? '' : ' main'}" data-go="${isSkp() ? '#photoBtn' : '#dwgPhotoBtn'}">${svg('cam')}<span><b>${isSkp() ? 'Place in a photo' : 'Project in a photo'}</b><small>${isSkp() ? 'Use a picture you take or pick' : 'Drag four corners onto any surface'}</small></span></button>`;
      sheet.innerHTML = h; sheet.classList.add('on'); scrim.classList.add('on');
    };
    sheet.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (!b) return; const s = b.dataset.go; closeAll(); click(s); });
    $('#mOpen').onclick = () => { closeAll(); click('#open'); };
    $('#mSel').onclick = () => { closeAll(); click('#t-select'); };
    $('#mMeas').onclick = () => { closeAll(); click('#t-measure'); };
    $('#mLay').onclick = () => { closeAll(); click('#layersBtn'); };
    const pn = $('#panel'); if (pn) { const cb = document.createElement('button'); cb.id = 'pClose'; cb.type = 'button'; cb.setAttribute('aria-label', 'Close details'); cb.textContent = '\u2715'; cb.onclick = () => { if (pn.classList.contains('open')) click('#layersBtn'); }; pn.insertBefore(cb, pn.firstChild); }
    $('#mSpace').onclick = openSpace;
    $('#mFs').onclick = () => click('#fsBtn');
    $('#mMore').onclick = () => { const on = !tools.classList.contains('sheet'); closeAll(); if (on) { tools.classList.add('sheet'); scrim.classList.add('on'); $('#mMore').setAttribute('aria-expanded', 'true'); } };
    const setP = (el, v) => { if (el && el.getAttribute('aria-pressed') !== String(v)) el.setAttribute('aria-pressed', v); };
    const sync = () => { const g = (s, a) => { const e = $(s); return e ? e.getAttribute(a) === 'true' : false; }; setP($('#mSel'), g('#t-select', 'aria-pressed')); setP($('#mMeas'), g('#t-measure', 'aria-pressed')); setP($('#mLay'), g('#layersBtn', 'aria-expanded')); };
    const mo = new MutationObserver(sync); ['#t-select', '#t-measure', '#layersBtn'].forEach((s) => { const e = $(s); if (e) mo.observe(e, { attributes: true, attributeFilter: ['aria-pressed', 'aria-expanded'] }); }); sync();
    if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('#mFs').style.display = 'none';
  }
  const run = () => { try { build(); } finally { document.documentElement.classList.add('m-ready'); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
