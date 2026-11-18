(() => {
const IMG = window.__HELP_IMG__ || {};
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const img = (i, alt, cls = '') => `<img class="hp-img ${cls}" alt="${alt}" src="data:image/jpeg;base64,${IMG[i]}">`;
const S = [
['start', 'Start', `
<p>S-CAD opens AutoCAD and SketchUp files, lets you look around, cut sections, measure and save a PNG. Your files are read on this device and never uploaded. It works fully offline.</p>
<h3>Open a file</h3>
<ol><li>Tap <b>Open file</b>.</li><li>Choose a <b>.dwg</b>, <b>.skp</b> or <b>.glb</b> file. S-CAD picks the right viewer.</li><li>Wait for “Reading file…” to clear. Big SketchUp models can take 15 to 60 seconds.</li></ol>
<table><tr><th>File</th><th>What you get</th></tr>
<tr><td>.dwg</td><td>2D drawing: layers, hatches, linetypes, lineweights, text, blocks and a scale bar.</td></tr>
<tr><td>.skp</td><td>3D model: orbit, section planes, saved scenes, outline, line thickness.</td></tr>
<tr><td>.ply .las .xyz .pts .txt .csv</td><td>3D scan (point cloud). Drag to orbit, pinch to zoom, two fingers to pan. <b>Measure</b> then tap two points for the distance. LAZ and E57 are not supported yet.</td></tr><tr><td>.glb</td><td>Light 3D copy made with <b>Mobile file</b>. The best choice for phones.</td></tr></table>
${NATIVE ? '<h3>Share the app with others</h3><p>Tap <b>Share web copy</b> in the toolbar to send the offline S-CAD web page as a single file (about 16 MB). The other person does not need to install anything: they save the file, open it in Chrome or any browser, and it works offline on a phone or computer. On iPhone, Safari may refuse a downloaded HTML file.</p>' : ''}
<p class="note"><b>Privacy.</b> Nothing leaves your device. No account, no upload.</p>
<p class="note"><b>Large SketchUp files.</b> A phone has far less memory than a computer. For models over about 40 MB, make a light copy on a computer first (see “Big models”).</p>`],
['dwg', 'Drawings', `
<h3>Look at a drawing (DWG)</h3>${img(0, 'DWG toolbar')}
<ol class="k"><li><b>Open file</b> pick a DWG, SKP or GLB.</li><li><b>Measure</b> tap two points to read a distance. <b>Select</b> goes back.</li><li><b>Fit − +</b> show everything, or zoom out and in.</li><li><b>Export PNG</b> save the picture.</li><li><b>Lineweights</b> turn printed line thickness on or off. Default 0.1 mm.</li><li><b>Hide panel</b> give the drawing the full width.</li><li><b>Drawing units</b> read from the file. Change it if the scale bar looks wrong.</li><li><b>Layers</b> untick to hide a layer. All and None switch every layer.</li><li><b>Tables</b> open each AutoCAD table from the list.</li></ol>
<p><b>Pan:</b> drag. <b>Zoom:</b> pinch or the − and + buttons. The scale bar at the bottom left follows the zoom, so a saved PNG always shows its scale.</p>
<p class="note">AutoCAD tables have no stored position in the file. They open one at a time from the Tables list. Saving the DWG in the AutoCAD 2007 format keeps table positions.</p>`],
['png', 'Save a PNG', `
<h3>Save a PNG</h3>${img(1, 'Export PNG dialog')}
<ol class="k"><li><b>Area</b> Current view saves what you see. Whole drawing saves everything.</li><li><b>Background</b> white, as shown on screen, or transparent.</li><li><b>Scale bar and units</b> keep this ticked so the picture shows its scale.</li><li><b>Resolution</b> 1× to 8×. The pixel size is shown below it.</li><li>${NATIVE ? '<b>Save PNG</b> opens the share sheet: choose Save to Files, Photos, WhatsApp, etc.' : '<b>Save PNG</b> saves the file to your Downloads.'} <b>Copy</b> puts it on the clipboard.</li></ol>
<p><b>Steps:</b> zoom to the part you want, tap Export PNG, choose options, tap Save PNG.</p>
<p class="note">For a sharp print use 4× or higher. On a phone, 8× of a large drawing may be too big, so use 2× or 3×. The same dialog works for 3D models. For a section picture, set up the section first, then export.</p>`],
['3d', '3D models', `
<h3>Look around a 3D model (SKP / GLB)</h3>${img(2, '3D toolbar')}
<ol class="k"><li><b>View…</b> Iso, Top, Front, Back, Left, Right.</li><li><b>Lines</b> off, thin, medium, thick or extra thick edges.</li><li><b>Scenes…</b> jump to views saved in SketchUp.</li><li><b>Section</b> cut the model.</li><li><b>Ortho</b> switch between perspective and flat projection.</li><li><b>Outline</b> expand the model tree, hide parts, tap a name to select it.</li><li><b>Mobile file</b> save a light copy for phones.</li></ol>
<p><b>Orbit:</b> drag. <b>Pan:</b> two fingers. <b>Zoom:</b> pinch. <b>Measure:</b> pick two points to read a distance in the model's units.</p>
<p>The Model panel shows size, triangles, objects and textures. <b>Tags</b> lists the SketchUp tags: untick one to hide everything on it.</p>
<h3>Cut a section</h3>${img(3, 'Section panel')}
<ol class="k"><li><b>Axis</b> X, Y or Z. Z is a floor plan cut.</li><li><b>Position</b> drag the slider to move the cut.</li><li><b>Flip side</b> keep the other half.</li><li><b>Show plane</b> hide the orange plane for a clean picture.</li></ol>
<p><b>Steps:</b> tap Section, choose the axis, drag the slider, use Flip side if needed, then Export PNG. Selecting and measuring ignore the cut-away part. Tap <b>Remove</b> in the Section plane box to go back to the full model.</p>`],
['phone', 'Big models', `
<h3>Big models on a phone</h3>
<p>A phone gives the app much less memory than a computer. A model that opens fine on a computer can fail on a phone with “Array buffer allocation failed”. The fix is a light copy made on a computer.</p>
<div class="ph">${img(4, 'Mobile file button', 'p')}${img(5, 'Mobile file result', 'p')}${img(6, 'Mobile panel', 'p')}</div>
<p><b>Mobile file</b> is in the toolbar. After tapping it a message shows the new size (for example 14.0 MB to 2.2 MB). The panel slides up from the bottom; scroll it for Section, Tags and more.</p>
<h3>Make the light copy</h3>
<ol><li>On a computer, open the .skp in S-CAD.</li><li>Click <b>Mobile file</b>. For the smallest file, leave <b>Include textures</b> off.</li><li>A <b>.mobile.glb</b> file is saved. Send it to your phone (Drive, cable, zipped in chat).</li><li>On the phone, tap Open file and choose the .glb. Scenes, sections and tags still work.</li></ol>
<p class="note">Very large models (over about 100 MB) may not open even on a computer with little memory. A model with millions of triangles can still be slow on a phone after conversion.</p>`],
['fix', 'Problems', `
<h3>If something goes wrong</h3>
<table><tr><th>You see</th><th>Try this</th></tr>
<tr><td>Array buffer allocation failed</td><td>File too big for this device. Make a light .glb on a computer.</td></tr>
<tr><td>memory access out of bounds (DWG)</td><td>Close and reopen the app, then open the DWG first. S-CAD retries once by itself.</td></tr>
<tr><td>no reader for class CCustomLineStyle</td><td>Old SketchUp file (before 2017). In SketchUp use Save As to a newer version, then open again.</td></tr>
<tr><td>Text or a table is missing in a DWG</td><td>Open the table from the Tables list. Saving the DWG as AutoCAD 2007 keeps table positions.</td></tr>
<tr><td>Scale bar shows the wrong unit</td><td>Change Drawing units in the panel.</td></tr>
<tr><td>File looks broken after sending in chat</td><td>Send it as a .zip or .rar. Raw files can be damaged on the way.</td></tr></table>
<h3>Quick reference</h3>
<table><tr><th>DWG</th><th>SketchUp</th></tr>
<tr><td>Drag: pan<br>Pinch: zoom<br>Fit: show everything<br>Layers: tick to show<br>Measure: two taps</td><td>Drag: orbit<br>Two fingers: pan<br>View… / Scenes…: preset views<br>Section: cut along X, Y or Z<br>Mobile file: light copy</td></tr></table>
<p class="note">S-CAD is a viewer. It does not edit drawings. For DWG it draws model space only, shows images as a frame, and cannot place tables in 2010 and newer DWG files.</p>`],
];
const css = `
#hp{position:fixed;inset:0;z-index:99999;display:none;flex-direction:column;background:var(--bg,#181e23);color:var(--fg,#dde3e7);font:15px/1.5 var(--font-ui,system-ui);padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
#hp.on{display:flex}
#hp header{display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--panel,#1d242a);border-bottom:1px solid var(--line,#2f3a43)}
#hp header b{font-size:17px;margin-right:auto}
#hp nav{display:flex;gap:6px;overflow-x:auto;padding:8px 16px;border-bottom:1px solid var(--line,#2f3a43);flex:none}
#hp nav button{white-space:nowrap}
#hp main{overflow-y:auto;padding:16px;max-width:760px;width:100%;margin:0 auto;box-sizing:border-box;-webkit-overflow-scrolling:touch}
#hp h3{margin:18px 0 8px;font-size:17px;color:var(--accent,#f0a23b)}
#hp table{border-collapse:collapse;width:100%;margin:10px 0}
#hp th,#hp td{border:1px solid var(--line,#2f3a43);padding:8px;text-align:left;vertical-align:top;font-size:14px}
#hp th{background:var(--raised,#263038)}
#hp .note{border-left:3px solid var(--accent,#f0a23b);padding:6px 12px;background:var(--panel,#1d242a);border-radius:0 4px 4px 0}
#hp .hp-img{width:100%;height:auto;border-radius:6px;border:1px solid var(--line,#2f3a43);margin:6px 0}
#hp .ph{display:flex;gap:8px}#hp .ph .p{width:calc(33.3% - 6px)}
#hp ol.k{padding-left:26px}#hp li{margin:5px 0}
#hpBtn{margin-left:8px}`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
const el = document.createElement('div'); el.id = 'hp'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'S-CAD user guide');
el.innerHTML = `<header><b>S-CAD user guide</b><button class="btn primary" id="hpClose" type="button">Close</button></header>
<nav>${S.map((s, i) => `<button class="btn" type="button" data-i="${i}" aria-pressed="${i === 0}">${s[1]}</button>`).join('')}</nav><main></main>`;
document.body.appendChild(el);
const main = el.querySelector('main');
const show = (i) => { main.innerHTML = S[i][2]; main.scrollTop = 0; el.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === i))); };
el.querySelector('nav').onclick = (e) => { const b = e.target.closest('button'); if (b) show(+b.dataset.i); };
const open = () => { show(0); el.classList.add('on'); };
const close = () => { el.classList.remove('on'); try { localStorage.setItem('dt-help-seen', '1'); } catch (e) {} };
el.querySelector('#hpClose').onclick = close;
const b = document.createElement('button'); b.className = 'btn'; b.id = 'hpBtn'; b.type = 'button'; b.textContent = 'Help'; b.onclick = open;
(document.querySelector('.tools') || document.querySelector('.bar') || document.body).appendChild(b);
let seen = false; try { seen = localStorage.getItem('dt-help-seen') === '1'; } catch (e) {}
if (!seen) setTimeout(open, 600);
})();
