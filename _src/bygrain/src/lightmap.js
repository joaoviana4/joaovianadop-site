import { sb, esc, toast, ICON } from './lib.js';

// Mapa de luz (planta vista de cima), como no Studio: luzes com feixe, câmaras com enquadramento pela lente,
// pessoas e peças de décor. Tudo em metros; grelha de 1 m.

export const LIGHT_TYPES = ['Fresnel', 'Painel LED', 'Softbox', 'Tubo LED', 'Open face', 'HMI', 'Prático', 'Sol ou céu', 'Rebatedor', 'Bandeira'];
const SENSORS = { 'Super 35': 24.89, 'Full frame': 36, 'APS-C': 23.5, 'Micro 4/3': 17.3, '65 mm': 54.12 };
const SET = { parede: ['Parede', 4, 0.15], porta: ['Porta', 0.9, 0.1], janela: ['Janela', 1.2, 0.15], mesa: ['Mesa', 1.4, 0.8], sofa: ['Sofá', 2, 0.9], cama: ['Cama', 2, 1.6], cadeira: ['Cadeira', 0.5, 0.5] };
const uid = () => Math.random().toString(36).slice(2, 10);
const rad = (d) => (d * Math.PI) / 180;
const tempColor = (k) => (!k ? '#FFF1D6' : k <= 4000 ? '#FFB054' : k >= 5000 ? '#86B6FF' : '#FFF1D6');

export function newLightmapData({ cameraCode = '', people = [] } = {}) {
  const items = [];
  if (cameraCode) items.push({ id: uid(), kind: 'camera', x: 0, y: 3, rot: -90, code: cameraCode, focal: 35, sensor: 'Super 35' });
  people.slice(0, 4).forEach((n, i) => items.push({ id: uid(), kind: 'person', x: -0.8 + i * 0.8, y: 0, rot: 0, name: n }));
  items.push({ id: uid(), kind: 'light', x: -2.2, y: 1.6, rot: -35, type: 'Fresnel', model: '', temp: 5600, intensity: 80, gel: '', beam: 40, notes: '' });
  return { items };
}

export function lightmapTool(main, p, tool, { characters = [] } = {}) {
  const data = { items: [], ...(tool.data || {}) };
  const st = { sel: null, view: null, drag: null };
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(async () => { const { error } = await sb.from('boards').update({ data, updated_at: new Date().toISOString() }).eq('id', tool.id); if (error) toast(error.message); }, 600); };

  main.innerHTML = `
    <div class="lm">
      <div class="lm-bar" role="toolbar" aria-label="Juntar ao mapa">
        <button type="button" class="btn ghost" data-add="light">${ICON.bulb} Luz</button>
        <button type="button" class="btn ghost" data-add="camera">${ICON.camera} Câmara</button>
        <button type="button" class="btn ghost" data-add="person">${ICON.team} Pessoa</button>
        <label class="sel"><span class="vh">Peça de décor</span><select data-addset><option value="">+ Décor…</option>${Object.entries(SET).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
        <span class="lm-sp"></span>
        <button type="button" class="btn ghost" data-fit>${ICON.fit} Ver tudo</button>
        <button type="button" class="btn ghost" data-png>${ICON.image} Exportar imagem</button>
      </div>
      <div class="lm-body">
        <div class="lm-canvas" tabindex="0" aria-label="Mapa de luz"><svg data-svg xmlns="http://www.w3.org/2000/svg"></svg><div class="lm-scale"><i></i><span>1 m</span></div></div>
        <aside class="lm-props" data-props></aside>
      </div>
      <div class="lm-legend" data-legend></div>
    </div>`;
  const svg = main.querySelector('[data-svg]');
  const canvas = main.querySelector('.lm-canvas');

  function size() { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height, r }; }
  function fit() {
    const { w, h } = size();
    if (!data.items.length) { st.view = { x: w / 2, y: h / 2, k: 60 }; return draw(); }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    data.items.forEach((it) => { x1 = Math.min(x1, it.x); y1 = Math.min(y1, it.y); x2 = Math.max(x2, it.x); y2 = Math.max(y2, it.y); });
    const k = Math.max(20, Math.min(120, Math.min(w / (x2 - x1 + 6), h / (y2 - y1 + 6))));
    st.view = { k, x: w / 2 - ((x1 + x2) / 2) * k, y: h / 2 - ((y1 + y2) / 2) * k };
    draw();
  }
  const labels = () => { let l = 0, c = 0; const m = {}; data.items.forEach((it) => { if (it.kind === 'light') m[it.id] = 'L' + ++l; if (it.kind === 'camera') m[it.id] = it.code || 'C' + ++c; }); return m; };

  function itemSvg(it, lab, selected) {
    const sel = selected ? ' sel' : '';
    if (it.kind === 'light') {
      const col = tempColor(+it.temp);
      const noBeam = ['Rebatedor', 'Bandeira', 'Prático', 'Sol ou céu'].includes(it.type);
      const a = rad((+it.beam || 40) / 2), R = 2.6;
      const beam = noBeam ? '' : `<path d="M0 0 L${R * Math.cos(-a)} ${R * Math.sin(-a)} A${R} ${R} 0 0 1 ${R * Math.cos(a)} ${R * Math.sin(a)} Z" fill="${col}" fill-opacity="0.22" stroke="${col}" stroke-opacity="0.6" stroke-width="0.02"/>`;
      let body;
      if (it.type === 'Rebatedor') body = '<rect x="-0.06" y="-0.6" width="0.12" height="1.2" fill="#F4F1E8"/>';
      else if (it.type === 'Bandeira') body = '<rect x="-0.06" y="-0.5" width="0.12" height="1" fill="#0B0B14" stroke="#F4F1E8" stroke-width="0.02"/>';
      else if (it.type === 'Prático') body = `<circle r="0.9" fill="${col}" fill-opacity="0.16"/><circle r="0.16" fill="${col}"/>`;
      else if (it.type === 'Sol ou céu') body = `<circle r="0.35" fill="${col}"/><path d="M0.4 0 H1.6 M1.3 -0.25 L1.6 0 L1.3 0.25" stroke="${col}" stroke-width="0.06" fill="none"/>`;
      else if (it.type === 'Softbox' || it.type === 'Painel LED') body = `<rect x="-0.12" y="-0.38" width="0.24" height="0.76" rx="0.04" fill="${col}" stroke="#0B0B14" stroke-width="0.03"/>`;
      else if (it.type === 'Tubo LED') body = `<rect x="-0.05" y="-0.6" width="0.1" height="1.2" rx="0.05" fill="${col}"/>`;
      else body = `<circle r="0.22" fill="${col}" stroke="#0B0B14" stroke-width="0.03"/><rect x="0.14" y="-0.14" width="0.14" height="0.28" fill="#0B0B14"/>`;
      return `<g class="lm-item${sel}" data-id="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})">${beam}${body}</g><text class="lm-lab" x="${it.x}" y="${it.y - 0.45}" text-anchor="middle" font-size="0.28" fill="#F4F1E8" font-family="Instrument Sans, sans-serif" font-weight="600">${esc(lab)}</text>`;
    }
    if (it.kind === 'camera') {
      const w = SENSORS[it.sensor] || 24.89; const half = Math.atan(w / (2 * (+it.focal || 35))); const L = 4.5;
      return `<g class="lm-item${sel}" data-id="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})">
        <path d="M0 0 L${L * Math.cos(-half)} ${L * Math.sin(-half)} M0 0 L${L * Math.cos(half)} ${L * Math.sin(half)}" stroke="#F4F1E8" stroke-width="0.025" stroke-dasharray="0.12 0.08" fill="none"/>
        <path d="M0 0 L${L * Math.cos(-half)} ${L * Math.sin(-half)} L${L * Math.cos(half)} ${L * Math.sin(half)} Z" fill="#F4F1E8" fill-opacity="0.05"/>
        <rect x="-0.42" y="-0.18" width="0.42" height="0.36" rx="0.04" fill="#1E2AD4" stroke="#F4F1E8" stroke-width="0.03"/><path d="M0 -0.1 L0.18 -0.18 L0.18 0.18 L0 0.1 Z" fill="#1E2AD4" stroke="#F4F1E8" stroke-width="0.03"/></g>
        <text x="${it.x}" y="${it.y - 0.42}" text-anchor="middle" font-size="0.28" fill="#F4F1E8" font-family="Instrument Sans, sans-serif" font-weight="700">${esc(lab)} · ${esc(it.focal)}mm</text>`;
    }
    if (it.kind === 'person') {
      return `<g class="lm-item${sel}" data-id="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})"><circle r="0.26" fill="#E5579B" stroke="#0B0B14" stroke-width="0.03"/><path d="M0.18 -0.1 L0.34 0 L0.18 0.1" fill="#E5579B"/></g>
        <text x="${it.x}" y="${it.y + 0.55}" text-anchor="middle" font-size="0.24" fill="#F4F1E8" font-family="Instrument Sans, sans-serif">${esc(it.name || 'Pessoa')}</text>`;
    }
    const w = +it.w || 1, h = +it.h || 0.2;
    let extra = '';
    if (it.piece === 'porta') extra = `<path d="M${-w / 2} ${h / 2} A${w} ${w} 0 0 0 ${w / 2} ${h / 2 - w}" stroke="#F4F1E8" stroke-width="0.02" fill="none" stroke-dasharray="0.06 0.05"/>`;
    if (it.piece === 'janela') extra = `<path d="M${-w / 2} 0 H${w / 2}" stroke="#86B6FF" stroke-width="0.04"/>`;
    const fill = it.piece === 'parede' ? '#8A8A99' : it.piece === 'janela' ? '#1C1C26' : '#3A3A48';
    return `<g class="lm-item${sel}" data-id="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${fill}" stroke="#F4F1E8" stroke-opacity="0.5" stroke-width="0.02"/>${extra}</g>
      ${['parede', 'janela', 'porta'].includes(it.piece) ? '' : `<text x="${it.x}" y="${it.y + 0.09}" text-anchor="middle" font-size="0.22" fill="#F4F1E8" fill-opacity="0.8" font-family="Instrument Sans, sans-serif">${esc(SET[it.piece]?.[0] || '')}</text>`}`;
  }

  function draw() { drawSvg(); props(); }
  function drawSvg() {
    const { w, h } = size(); const v = st.view; const lab = labels();
    const sel = data.items.find((x) => x.id === st.sel);
    const handle = sel ? `<g transform="translate(${sel.x} ${sel.y}) rotate(${sel.rot || 0})"><line x1="0" y1="0" x2="1.1" y2="0" stroke="#6F7BFF" stroke-width="0.02"/><circle class="lm-rot" cx="1.1" cy="0" r="0.13" fill="#6F7BFF" stroke="#fff" stroke-width="0.02"/></g><circle cx="${sel.x}" cy="${sel.y}" r="0.5" fill="none" stroke="#6F7BFF" stroke-width="0.03" stroke-dasharray="0.08 0.06" pointer-events="none"/>` : '';
    const order = ['set', 'light', 'person', 'camera'];
    const items = [...data.items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<defs><pattern id="lmgrid-${tool.id}" width="${v.k}" height="${v.k}" patternUnits="userSpaceOnUse" x="${v.x}" y="${v.y}"><path d="M ${v.k} 0 L 0 0 0 ${v.k}" fill="none" stroke="rgba(244,241,232,0.08)" stroke-width="1"/></pattern></defs>
      <rect width="${w}" height="${h}" fill="#101017"/><rect width="${w}" height="${h}" fill="url(#lmgrid-${tool.id})"/>
      <g transform="translate(${v.x} ${v.y}) scale(${v.k})">${items.map((it) => itemSvg(it, lab[it.id], it.id === st.sel)).join('')}${handle}</g>`;
    main.querySelector('.lm-scale i').style.width = v.k + 'px';
    legend(lab);
  }

  function legend(lab) {
    const lights = data.items.filter((x) => x.kind === 'light'); const cams = data.items.filter((x) => x.kind === 'camera');
    main.querySelector('[data-legend]').innerHTML = (lights.length || cams.length) ? `<h3 class="h3">Legenda</h3><ul>${[
      ...cams.map((c) => `<li><strong>${esc(lab[c.id])}</strong> Câmara · ${esc(c.focal)}mm · ${esc(c.sensor)}</li>`),
      ...lights.map((l) => `<li><i style="background:${tempColor(+l.temp)}"></i><strong>${esc(lab[l.id])}</strong> ${esc([l.type, l.model, l.temp ? l.temp + 'K' : '', l.intensity ? l.intensity + '%' : '', l.gel, l.beam && !['Rebatedor', 'Bandeira', 'Prático', 'Sol ou céu'].includes(l.type) ? l.beam + '°' : ''].filter(Boolean).join(' · '))}${l.notes ? ` <span class="muted">— ${esc(l.notes)}</span>` : ''}</li>`),
    ].join('')}</ul>` : '';
  }

  function field(k, label, val, type = 'text', extra = '') { return `<label class="mini">${label}<input data-k="${k}" type="${type}" value="${esc(val ?? '')}" ${extra}></label>`; }
  function props() {
    const it = data.items.find((x) => x.id === st.sel); const box = main.querySelector('[data-props]');
    if (!it) { box.innerHTML = '<p class="muted small">Seleciona uma peça para a editar. Arrasta para mover; a bolinha azul roda. Delete apaga, Ctrl + D duplica.</p>'; return; }
    let f = '';
    if (it.kind === 'light') f = `<label class="mini">Tipo<select data-k="type">${LIGHT_TYPES.map((t) => `<option ${t === it.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${field('model', 'Modelo', it.model)}${field('temp', 'Temperatura (K)', it.temp, 'number', 'step="100"')}${field('intensity', 'Intensidade (%)', it.intensity, 'number', 'min="0" max="100"')}${field('gel', 'Gelatina', it.gel)}${field('beam', 'Abertura do feixe (°)', it.beam, 'number', 'min="5" max="180"')}${field('notes', 'Notas', it.notes)}`;
    if (it.kind === 'camera') f = `${field('code', 'Código do plano', it.code)}${field('focal', 'Distância focal (mm)', it.focal, 'number', 'min="8" max="600"')}<label class="mini">Sensor<select data-k="sensor">${Object.keys(SENSORS).map((s) => `<option ${s === it.sensor ? 'selected' : ''}>${s}</option>`).join('')}</select></label>`;
    if (it.kind === 'person') f = `<label class="mini">Nome<input data-k="name" list="lm-chars" value="${esc(it.name || '')}"><datalist id="lm-chars">${characters.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>`;
    if (it.kind === 'set') f = `<label class="mini">Peça<select data-k="piece">${Object.entries(SET).map(([k, v]) => `<option value="${k}" ${k === it.piece ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>${field('w', 'Largura (m)', it.w, 'number', 'step="0.1" min="0.1"')}${field('h', 'Profundidade (m)', it.h, 'number', 'step="0.05" min="0.05"')}`;
    box.innerHTML = `<h3 class="h3">${{ light: 'Luz', camera: 'Câmara', person: 'Pessoa', set: 'Décor' }[it.kind]}</h3>${f}${field('rot', 'Rotação (°)', Math.round(it.rot || 0), 'number', 'step="5"')}
      <div class="row"><button type="button" class="btn ghost" data-dup>Duplicar</button><button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button></div>`;
    box.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k; it[k] = inp.type === 'number' ? Number(inp.value) : inp.value;
      if (k === 'piece') { it.w = SET[it.piece][1]; it.h = SET[it.piece][2]; }
      if (k === 'piece') { draw(); } else drawSvg();
      save();
    }));
    box.querySelector('[data-dup]').addEventListener('click', duplicate);
    box.querySelector('[data-del]').addEventListener('click', remove);
  }
  function duplicate() { const it = data.items.find((x) => x.id === st.sel); if (!it) return; const c = { ...JSON.parse(JSON.stringify(it)), id: uid(), x: it.x + 0.6, y: it.y + 0.6 }; data.items.push(c); st.sel = c.id; draw(); save(); }
  function remove() { data.items = data.items.filter((x) => x.id !== st.sel); st.sel = null; draw(); save(); }

  function add(kind, piece) {
    const { w, h } = size(); const v = st.view;
    const cx = (w / 2 - v.x) / v.k, cy = (h / 2 - v.y) / v.k;
    const base = { id: uid(), kind, x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10, rot: 0 };
    const it = kind === 'light' ? { ...base, type: 'Fresnel', model: '', temp: 5600, intensity: 80, gel: '', beam: 40, notes: '' }
      : kind === 'camera' ? { ...base, rot: -90, code: '', focal: 35, sensor: 'Super 35' }
      : kind === 'person' ? { ...base, name: characters[0] || '' }
      : { ...base, piece, w: SET[piece][1], h: SET[piece][2] };
    data.items.push(it); st.sel = it.id; draw(); save();
  }

  // rato
  const toM = (e) => { const { r } = size(); return { x: (e.clientX - r.left - st.view.x) / st.view.k, y: (e.clientY - r.top - st.view.y) / st.view.k }; };
  svg.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    if (e.target.classList.contains('lm-rot')) { st.drag = { mode: 'rot' }; e.preventDefault(); return; }
    const g = e.target.closest('[data-id]');
    if (g) { const it = data.items.find((x) => x.id === g.dataset.id); st.sel = it.id; const m = toM(e); st.drag = { mode: 'move', dx: it.x - m.x, dy: it.y - m.y }; draw(); }
    else { st.sel = null; st.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y }; draw(); }
    e.preventDefault();
  });
  const move = (e) => {
    const d = st.drag; if (!d) return;
    if (d.mode === 'pan') { st.view.x = d.vx + e.clientX - d.sx; st.view.y = d.vy + e.clientY - d.sy; drawSvg(); return; }
    const it = data.items.find((x) => x.id === st.sel); if (!it) return;
    const m = toM(e);
    if (d.mode === 'move') { it.x = Math.round((m.x + d.dx) * 20) / 20; it.y = Math.round((m.y + d.dy) * 20) / 20; }
    else { let a = (Math.atan2(m.y - it.y, m.x - it.x) * 180) / Math.PI; if (!e.shiftKey) a = Math.round(a / 5) * 5; it.rot = a; }
    d.moved = true; drawSvg();
  };
  const up = () => { if (st.drag?.moved) { save(); props(); } st.drag = null; };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault(); const { r } = size(); const px = e.clientX - r.left, py = e.clientY - r.top;
    const k2 = Math.max(12, Math.min(300, st.view.k * Math.exp(-e.deltaY * 0.002)));
    st.view.x = px - (px - st.view.x) * (k2 / st.view.k); st.view.y = py - (py - st.view.y) * (k2 / st.view.k); st.view.k = k2; drawSvg();
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    if (!st.sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
    if (e.key === 'Escape') { st.sel = null; draw(); }
  });

  main.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => add(b.dataset.add)));
  main.querySelector('[data-addset]').addEventListener('change', (e) => { if (e.target.value) { add('set', e.target.value); e.target.value = ''; } });
  main.querySelector('[data-fit]').addEventListener('click', fit);
  main.querySelector('[data-png]').addEventListener('click', () => exportPng(svg, tool.title));

  requestAnimationFrame(fit);
  const ro = new ResizeObserver(() => st.view && drawSvg()); ro.observe(canvas);
  return { destroy() { ro.disconnect(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } };
}

async function exportPng(svg, title) {
  const r = svg.getBoundingClientRect(); const scale = 2;
  const clone = svg.cloneNode(true); clone.setAttribute('width', r.width); clone.setAttribute('height', r.height);
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = r.width * scale; cv.height = r.height * scale;
  const ctx = cv.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
  cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${(title || 'mapa-de-luz').replace(/[^\w\-]+/g, '-')}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
}
