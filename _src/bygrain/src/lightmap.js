import { sb, esc, toast, modal, ICON } from './lib.js';
import { loadGear, addGearModal, gearName, specLine, lensFocals, MOD_KINDS, FABRICS, CATALOG } from './gear.js';
import { makeHistory, bindUndoKeys } from './tablekit.js';

// Mapa de luz (planta vista de cima) para DF e gaffers.
// · As luzes, câmaras, objetivas e modificadores vêm da lista de Equipamento do projeto.
//   Se faz falta mais uma unidade, junta-se primeiro à lista (o mapa pergunta).
// · Cada luz tem intensidade, temperatura dentro do que o aparelho faz, gelatina (muda os K a sério, em mireds),
//   difusão, modificador (muda o feixe), altura, inclinação, canal DMX e se vai a bateria.
// · Contas de consumo: watts, amperes a 230 V, circuitos de 16 A e geradores/baterias da lista.
// · Luz natural (sol, janela, céu), pessoas e peças de décor não precisam de estar na lista.
// Tudo em metros; grelha de 1 m.

const uid = () => Math.random().toString(36).slice(2, 10);
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inten = (it) => (it.intensity == null || it.intensity === '' ? 100 : +it.intensity);
const SET = { parede: ['Parede', 4, 0.15], porta: ['Porta', 0.9, 0.1], janela: ['Janela', 1.2, 0.15], mesa: ['Mesa', 1.4, 0.8], sofa: ['Sofá', 2, 0.9], cama: ['Cama', 2, 1.6], cadeira: ['Cadeira', 0.5, 0.5], balcao: ['Balcão', 3, 0.7], carro: ['Carro', 4.5, 1.8], barco: ['Barco', 4, 1.5] };
const SENSORS = { 'Super 35': 24.89, 'Full frame': 36, 'APS-C': 23.5, 'Micro 4/3': 17.3, '65 mm': 54.12 };
// gelatinas: deslocação em mireds (CTO aquece, CTB arrefece), verde/magenta e ND (paragens de luz)
export const GELS = [['', 'Sem gelatina', 0, 0], ['Full CTO', 'Full CTO', 159, 0], ['3/4 CTO', '3/4 CTO', 124, 0], ['1/2 CTO', '1/2 CTO', 81, 0], ['1/4 CTO', '1/4 CTO', 42, 0], ['1/8 CTO', '1/8 CTO', 20, 0],
  ['Full CTB', 'Full CTB', -131, 0], ['1/2 CTB', '1/2 CTB', -68, 0], ['1/4 CTB', '1/4 CTB', -30, 0], ['1/8 CTB', '1/8 CTB', -12, 0],
  ['Plus Green', 'Plus Green', 0, 0], ['Minus Green', 'Minus Green', 0, 0], ['ND .3', 'ND 0.3 (−1 stop)', 0, 1], ['ND .6', 'ND 0.6 (−2 stops)', 0, 2], ['ND .9', 'ND 0.9 (−3 stops)', 0, 3]];
const NATURAL = { sol: 'Sol', janela: 'Luz de janela', ceu: 'Céu / ambiente' };
const ATTACH = ['softbox', 'lantern', 'dome', 'fresnel', 'grid']; // modificadores que vão montados na luz
const PLACE = ['frame', 'flag', 'bounce']; // modificadores que se põem no chão do mapa

// temperatura de cor -> cor no ecrã (aproximação de Tanner Helland)
function kColor(k) {
  const t = clamp(k || 5600, 1000, 20000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return `rgb(${[r, g, b].map((v) => Math.round(clamp(v, 0, 255))).join(',')})`;
}
const gelOf = (name) => GELS.find((g) => g[0] === (name || '')) || GELS[0];
export const effK = (k, gel) => { const s = gelOf(gel)[2]; return s ? Math.round((1e6 / (1e6 / k + s)) / 50) * 50 : k; };

export { newLightmapData } from './lmdata.js';

export function lightmapTool(main, p, tool, opts = {}) {
  const { characters = [], base = '' } = opts;
  const data = { items: [], ...(tool.data || {}) };
  const st = { sel: null, view: null, drag: null };
  let gear = [];
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(async () => { const { error } = await sb.from('boards').update({ data, updated_at: new Date().toISOString() }).eq('id', tool.id); if (error) toast(error.message); }, 500); };
  const G = (id) => gear.find((g) => g.id === id);
  const hist = makeHistory({ get: () => data.items, set: (v) => { data.items = v; if (!data.items.some((x) => x.id === st.sel)) st.sel = null; }, after: () => { draw(); save(); }, notify: (m) => toast(m) });

  if (data.limit == null) data.limit = true;
  const TOOLS = [['light', 'Luzes', ICON.bulb], ['camera', 'Câmaras', ICON.camera], ['mod', 'Modificadores', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h16M12 4v16" stroke-dasharray="2 2"/></svg>'], ['stand', 'Tripés', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8M12 11l-7 10M12 11l7 10M12 11v10"/><circle cx="12" cy="4" r="1.5"/></svg>']];
  const OTHER = [['person', 'Pessoa', ICON.team], ['natural', 'Luz natural', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>'], ['set', 'Décor', ICON.home]];
  main.innerHTML = `
    <div class="lm lm-full">
      <div class="lm-canvas" tabindex="0" aria-label="Mapa de luz"><svg data-svg xmlns="http://www.w3.org/2000/svg"></svg><div class="lm-scale"><i></i><span>1 m</span></div><div class="lm-hint" data-hint></div></div>
      <div class="lm-actions">
        ${data.shot_id || data.location_id ? '<span class="lm-links" data-links></span>' : ''}
        <label class="lm-limit" title="Ligado: só o que está na lista de equipamento. Desligado: também o catálogo geral, e o que juntares entra sozinho na lista."><input type="checkbox" data-limit ${data.limit ? 'checked' : ''}><span class="lm-sw"></span><span data-limitlabel>${data.limit ? 'Só a lista de equipamento' : 'Lista + catálogo geral'}</span></label>
        <button type="button" class="lm-ab" data-undo title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
        <button type="button" class="lm-ab" data-fit title="Ver tudo">${ICON.fit}</button>
        <button type="button" class="lm-ab" data-png title="Exportar imagem">PNG</button>
        <button type="button" class="lm-ab primary" data-pdf>${ICON.open} PDF</button>
        ${opts.onOptions ? `<button type="button" class="lm-ab" data-opt title="Opções" aria-label="Opções">${ICON.dots}</button>` : ''}
      </div>
      <div class="pv-tools lm-tools" role="toolbar" aria-label="Juntar ao mapa">
        ${TOOLS.map(([k, l, ic]) => `<button type="button" data-tool="${k}" title="${l}" aria-haspopup="dialog">${ic}<span>${l}</span></button>`).join('')}
        <hr>
        ${OTHER.map(([k, l, ic]) => `<button type="button" data-tool="${k}" title="${l}" aria-haspopup="dialog">${ic}<span>${l}</span></button>`).join('')}
        <hr>
        <button type="button" data-drawer-t title="Legenda, consumo e material">${ICON.list}<span>Legenda</span></button>
      </div>
      <div class="lm-pop" data-pop hidden role="dialog"></div>
      <aside class="lm-props" data-props hidden></aside>
      <div class="lm-drawer" data-drawer hidden><div class="lm-foot">
        <section class="lm-legend" data-legend></section>
        <section class="lm-power" data-power></section>
        <section class="lm-mat" data-mat></section>
      </div></div>
    </div>`;
  const svg = main.querySelector('[data-svg]');
  const canvas = main.querySelector('.lm-canvas');

  // ---------- contas ----------
  const used = () => { const m = new Map(); data.items.forEach((it) => [it.gear_id, it.lens_id, it.mod_id, it.stand_id].filter(Boolean).forEach((g) => m.set(g, (m.get(g) || 0) + 1))); return m; };
  const lightInfo = (it) => {
    const g = G(it.gear_id); const s = g?.specs || {};
    const cct = s.cct ? clamp(+it.cct || s.cct[1], s.cct[0], s.cct[1]) : (+it.cct || +it.temp || 5600);
    const k = effK(cct, it.gel);
    const mod = G(it.mod_id); const mk = mod?.specs?.mod;
    let beam = +s.beam || +it.beam || 50;
    if (mk === 'softbox') beam = 110; else if (mk === 'dome') beam = 90; else if (mk === 'lantern') beam = 360; else if (mk === 'grid') beam = 40; else if (mk === 'fresnel') beam = clamp(+it.spot || 25, 12, 50);
    if (it.diff) beam = Math.min(360, beam + (/grid cloth|216|opal|250/i.test(it.diff) ? 30 : 15));
    if (s.type === 'Prático' && !mk) beam = 360;
    const nd = gelOf(it.gel)[3];
    const level = clamp(inten(it), 0, 100) / 100 / Math.pow(2, nd);
    const watts = +s.watts || 0;
    const draw = watts * (['HMI'].includes(s.type) ? 1 : Math.max(0.08, clamp(inten(it), 0, 100) / 100));
    const color = s.color === 'rgb' && it.rgb ? it.rgb : kColor(k);
    return { g, s, cct, k, beam, level, watts, draw, color, mod };
  };
  const labels = () => { let l = 0, c = 0, n = 0; const m = {}; data.items.forEach((it) => { if (it.kind === 'light') m[it.id] = 'L' + ++l; if (it.kind === 'camera') m[it.id] = it.code || 'C' + ++c; if (it.kind === 'natural') m[it.id] = 'N' + ++n; }); return m; };

  function size() { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height, r }; }
  function fit() {
    const { w, h } = size();
    if (!data.items.length) { st.view = { x: w / 2, y: h / 2, k: 60 }; return draw(); }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    data.items.forEach((it) => { x1 = Math.min(x1, it.x); y1 = Math.min(y1, it.y); x2 = Math.max(x2, it.x); y2 = Math.max(y2, it.y); });
    const k = Math.max(20, Math.min(120, Math.min(w / (x2 - x1 + 7), h / (y2 - y1 + 7))));
    st.view = { k, x: w / 2 - ((x1 + x2) / 2) * k, y: h / 2 - ((y1 + y2) / 2) * k };
    draw();
  }

  // ---------- desenho ----------
  const T = (x, y, s, txt, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}" font-size="${s}" fill="${o.fill || '#F4F1E8'}" ${o.op ? `fill-opacity="${o.op}"` : ''} font-family="Instrument Sans, sans-serif" font-weight="${o.w || 600}" pointer-events="none">${esc(txt)}</text>`;
  function itemSvg(it, lab, selected, defs) {
    const sel = selected ? ' sel' : '';
    const wrap = (inner) => `<g class="lm-item${sel}" data-id="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})">${inner}</g>`;
    if (it.kind === 'light') {
      const L = lightInfo(it); const off = !L.g;
      const R = clamp(1 + 5 * Math.sqrt((L.watts || 300) / 600) * Math.sqrt(L.level), 0.8, 10);
      const gid = `lg-${tool.id}-${it.id}`;
      defs.push(`<radialGradient id="${gid}" cx="0" cy="0" r="${R}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${L.color}" stop-opacity="${0.15 + 0.4 * L.level}"/><stop offset="0.6" stop-color="${L.color}" stop-opacity="${0.06 + 0.15 * L.level}"/><stop offset="1" stop-color="${L.color}" stop-opacity="0"/></radialGradient>`);
      const a = rad(Math.min(L.beam, 359) / 2);
      const beam = L.beam >= 300 ? `<circle r="${R * 0.75}" fill="url(#${gid})" pointer-events="none"/>`
        : `<path d="M0 0 L${R * Math.cos(-a)} ${R * Math.sin(-a)} A${R} ${R} 0 ${L.beam > 180 ? 1 : 0} 1 ${R * Math.cos(a)} ${R * Math.sin(a)} Z" fill="url(#${gid})" stroke="${L.color}" stroke-opacity="0.35" stroke-width="0.015" pointer-events="none"/>`;
      const t = L.s.type || it.type || '';
      let body;
      const stroke = off ? '#FF6B5E' : '#0B0B14';
      if (t === 'Tubo LED') { const len = L.s.length_m || 1.2; body = `<rect x="-0.05" y="${-len / 2}" width="0.1" height="${len}" rx="0.05" fill="${L.color}" stroke="${stroke}" stroke-width="0.02"/>`; }
      else if (t === 'Painel LED' || t === 'Softlight') body = `<rect x="-0.14" y="-0.4" width="0.22" height="0.8" rx="0.04" fill="${L.color}" stroke="${stroke}" stroke-width="0.03"/>`;
      else if (t === 'Prático') body = `<circle r="0.15" fill="${L.color}" stroke="${stroke}" stroke-width="0.02"/>`;
      else if (t === 'HMI') body = `<rect x="-0.3" y="-0.22" width="0.42" height="0.44" rx="0.06" fill="#2a2a33" stroke="${off ? stroke : '#F4F1E8'}" stroke-width="0.025"/><circle cx="0.12" r="0.16" fill="${L.color}"/>`;
      else body = `<circle r="0.2" fill="${L.color}" stroke="${stroke}" stroke-width="0.03"/><rect x="0.13" y="-0.13" width="0.15" height="0.26" fill="#0B0B14" stroke="${L.color}" stroke-width="0.015"/>`;
      const mk = L.mod?.specs?.mod; const ms = L.mod?.specs?.size_m || 0.9;
      let modSvg = '';
      if (mk === 'softbox' || mk === 'dome') modSvg = `<path d="M0.25 -0.14 L0.65 ${-ms / 2} L0.65 ${ms / 2} L0.25 0.14 Z" fill="#F4F1E8" fill-opacity="0.85" stroke="#0B0B14" stroke-width="0.02"/>`;
      if (mk === 'lantern') modSvg = `<circle r="${ms / 2}" fill="#F4F1E8" fill-opacity="0.35" stroke="#F4F1E8" stroke-width="0.02"/>`;
      if (mk === 'grid') modSvg = `<path d="M0.62 ${-ms / 2} V${ms / 2}" stroke="#0B0B14" stroke-width="0.06"/><path d="M0.25 -0.14 L0.62 ${-ms / 2} L0.62 ${ms / 2} L0.25 0.14 Z" fill="#F4F1E8" fill-opacity="0.75"/>`;
      if (mk === 'fresnel') modSvg = '<rect x="0.26" y="-0.17" width="0.07" height="0.34" fill="#86B6FF" stroke="#0B0B14" stroke-width="0.015"/>';
      const tag = `${lab}${it.intensity != null ? ` · ${Math.round(+it.intensity)}%` : ''}`;
      return `${wrap(`${beam}<circle r="0.42" fill="#000" fill-opacity="0"/>${modSvg}${body}`)}${T(it.x, it.y - 0.5, 0.26, tag)}${st.view.k > 55 && L.g ? T(it.x, it.y + 0.62, 0.17, `${L.g.name}${L.k ? ` · ${L.k}K` : ''}`, { op: 0.75, w: 500 }) : ''}${off ? T(it.x, it.y + 0.62, 0.17, 'fora da lista', { fill: '#FF6B5E' }) : ''}`;
    }
    if (it.kind === 'camera') {
      const cam = G(it.gear_id); const lens = G(it.lens_id);
      const sw = cam?.specs?.sensor_w || SENSORS[it.sensor] || 24.89; const sq = lens?.specs?.squeeze || 1;
      const half = Math.atan((sw * sq) / (2 * (+it.focal || 35))); const Lr = 5;
      return `${wrap(`<path d="M0 0 L${Lr * Math.cos(-half)} ${Lr * Math.sin(-half)} M0 0 L${Lr * Math.cos(half)} ${Lr * Math.sin(half)}" stroke="#F4F1E8" stroke-width="0.025" stroke-dasharray="0.12 0.08" fill="none" pointer-events="none"/>
        <path d="M0 0 L${Lr * Math.cos(-half)} ${Lr * Math.sin(-half)} L${Lr * Math.cos(half)} ${Lr * Math.sin(half)} Z" fill="#F4F1E8" fill-opacity="0.05" pointer-events="none"/>
        <circle cx="-0.1" r="0.42" fill="#000" fill-opacity="0"/><rect x="-0.44" y="-0.19" width="0.44" height="0.38" rx="0.05" fill="#1E2AD4" stroke="${cam ? '#F4F1E8' : '#FF6B5E'}" stroke-width="0.03"/><path d="M0 -0.1 L0.2 -0.19 L0.2 0.19 L0 0.1 Z" fill="#1E2AD4" stroke="#F4F1E8" stroke-width="0.03"/>`)}
        ${T(it.x, it.y - 0.45, 0.27, `${lab} · ${it.focal || '?'}mm${sq > 1 ? ' ana' : ''}`, { w: 700 })}${st.view.k > 55 && cam ? T(it.x, it.y + 0.55, 0.17, cam.name, { op: 0.75, w: 500 }) : ''}`;
    }
    if (it.kind === 'mod') {
      const g = G(it.gear_id); const s = g?.specs || {}; const w = s.size_m || 1.2; const fab = it.fabric ?? s.fabric ?? '';
      const neg = s.mod === 'flag' || /negativo|duvetyne/i.test(fab); const bounce = s.mod === 'bounce' || /ultrabounce/i.test(fab);
      const fill = neg ? '#0B0B14' : bounce ? '#F4F1E8' : '#cfd3e0';
      const op = neg || bounce ? 1 : 0.55;
      return `${wrap(`<rect x="-0.05" y="${-w / 2}" width="0.1" height="${w}" fill="${fill}" fill-opacity="${op}" stroke="${g ? '#F4F1E8' : '#FF6B5E'}" stroke-width="0.02" ${!neg && !bounce ? 'stroke-dasharray="0.08 0.05"' : ''}/>`)}${T(it.x, it.y - w / 2 - 0.12, 0.18, g ? `${g.name}${fab && fab !== s.fabric ? ' · ' + fab : ''}` : 'fora da lista', { op: 0.85, w: 500, fill: g ? '#F4F1E8' : '#FF6B5E' })}`;
    }
    if (it.kind === 'stand') {
      const g = G(it.gear_id);
      return `${wrap(`<circle r="0.07" fill="#F4F1E8"/>${[0, 120, 240].map((a2) => `<line x1="0" y1="0" x2="${0.32 * Math.cos(rad(a2 - 90))}" y2="${0.32 * Math.sin(rad(a2 - 90))}" stroke="${g ? '#F4F1E8' : '#FF6B5E'}" stroke-width="0.035" stroke-linecap="round"/>`).join('')}`)}${T(it.x, it.y + 0.5, 0.17, g ? g.name : 'fora da lista', { op: 0.8, w: 500, fill: g ? '#F4F1E8' : '#FF6B5E' })}`;
    }
    if (it.kind === 'natural') {
      const col = kColor(+it.cct || 5600); const lev = clamp(inten(it), 0, 100) / 100;
      if (it.type === 'sol') return `${wrap(`<circle r="0.32" fill="${col}"/><g stroke="${col}" stroke-width="0.04">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="${0.42 * Math.cos(i * Math.PI / 4)}" y1="${0.42 * Math.sin(i * Math.PI / 4)}" x2="${0.58 * Math.cos(i * Math.PI / 4)}" y2="${0.58 * Math.sin(i * Math.PI / 4)}"/>`).join('')}</g>${[-0.6, 0, 0.6].map((y) => `<path d="M0.8 ${y} H3.4 M3.15 ${y - 0.16} L3.4 ${y} L3.15 ${y + 0.16}" stroke="${col}" stroke-opacity="${0.35 + 0.5 * lev}" stroke-width="0.05" fill="none" pointer-events="none"/>`).join('')}`)}${T(it.x, it.y - 0.75, 0.24, `${lab} · Sol`)}`;
      const w = it.type === 'janela' ? 1.4 : 2.5;
      return `${wrap(`<rect x="0" y="${-w / 2}" width="${3.5}" height="${w}" fill="${col}" fill-opacity="${0.06 + 0.16 * lev}" pointer-events="none"/><rect x="-0.25" y="${-w / 2}" width="0.5" height="${w}" fill="#000" fill-opacity="0"/><rect x="-0.08" y="${-w / 2}" width="0.16" height="${w}" fill="${col}" fill-opacity="0.9"/>`)}${T(it.x, it.y - w / 2 - 0.15, 0.22, `${lab} · ${NATURAL[it.type] || ''}`)}`;
    }
    if (it.kind === 'person') {
      return `${wrap(`<circle r="0.26" fill="#E5579B" stroke="#0B0B14" stroke-width="0.03"/><path d="M0.18 -0.1 L0.34 0 L0.18 0.1" fill="#E5579B"/>`)}${T(it.x, it.y + 0.55, 0.24, it.name || 'Pessoa', { w: 500 })}`;
    }
    const w = +it.w || 1, h = +it.h || 0.2;
    let extra = '';
    if (it.piece === 'porta') extra = `<path d="M${-w / 2} ${h / 2} A${w} ${w} 0 0 0 ${w / 2} ${h / 2 - w}" stroke="#F4F1E8" stroke-width="0.02" fill="none" stroke-dasharray="0.06 0.05"/>`;
    if (it.piece === 'janela') extra = `<path d="M${-w / 2} 0 H${w / 2}" stroke="#86B6FF" stroke-width="0.04"/>`;
    const fill = it.piece === 'parede' ? '#8A8A99' : it.piece === 'janela' ? '#1C1C26' : '#3A3A48';
    return `${wrap(`<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${fill}" stroke="#F4F1E8" stroke-opacity="0.5" stroke-width="0.02"/>${extra}`)}
      ${['parede', 'janela', 'porta'].includes(it.piece) ? '' : T(it.x, it.y + 0.09, 0.22, SET[it.piece]?.[0] || '', { op: 0.8, w: 500 })}`;
  }

  function draw() { drawSvg(); props(); kit(); }
  function drawSvg() {
    const { w, h } = size(); const v = st.view; if (!v) return; const lab = labels();
    const sel = data.items.find((x) => x.id === st.sel);
    const handle = sel ? `<g transform="translate(${sel.x} ${sel.y}) rotate(${sel.rot || 0})"><line x1="0" y1="0" x2="1.1" y2="0" stroke="#6F7BFF" stroke-width="0.02"/><circle class="lm-rot" cx="1.1" cy="0" r="0.13" fill="#6F7BFF" stroke="#fff" stroke-width="0.02"/></g><circle cx="${sel.x}" cy="${sel.y}" r="0.5" fill="none" stroke="#6F7BFF" stroke-width="0.03" stroke-dasharray="0.08 0.06" pointer-events="none"/>` : '';
    const order = ['set', 'natural', 'stand', 'light', 'mod', 'person', 'camera'];
    const items = [...data.items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const defs = [];
    const body = items.map((it) => itemSvg(it, lab[it.id], it.id === st.sel, defs)).join('');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<defs><pattern id="lmgrid-${tool.id}" width="${v.k}" height="${v.k}" patternUnits="userSpaceOnUse" x="${v.x}" y="${v.y}"><path d="M ${v.k} 0 L 0 0 0 ${v.k}" fill="none" stroke="rgba(244,241,232,0.08)" stroke-width="1"/></pattern>${defs.join('')}</defs>
      <rect width="${w}" height="${h}" fill="#101017"/><rect width="${w}" height="${h}" fill="url(#lmgrid-${tool.id})"/>
      <g transform="translate(${v.x} ${v.y}) scale(${v.k})" style="mix-blend-mode:normal">${body}${handle}</g>`;
    main.querySelector('.lm-scale i').style.width = v.k + 'px';
    foot(lab);
  }

  // ---------- ferramentas da direita: listas do equipamento (e do catálogo, se não estiver limitado) ----------
  const POP_CAT = { light: 'light', camera: 'camera', mod: 'modifier', stand: 'stand' };
  const placeable = (g) => g.category !== 'modifier' || PLACE.includes(g.specs?.mod);
  const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let popKind = null; let popQ = '';
  function closePop() { const pop = main.querySelector('[data-pop]'); pop.hidden = true; popKind = null; main.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('on')); }
  function openPop(kind, btn) {
    const pop = main.querySelector('[data-pop]');
    if (popKind === kind) return closePop();
    popKind = kind; popQ = '';
    main.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b === btn));
    const r = btn.getBoundingClientRect(); const host = main.querySelector('.lm-full').getBoundingClientRect();
    pop.style.top = `${Math.max(8, Math.min(r.top - host.top, host.height - 460))}px`;
    pop.hidden = false; drawPop();
  }
  function drawPop() {
    const pop = main.querySelector('[data-pop]'); const kind = popKind; if (!kind) return;
    if (kind === 'person' || kind === 'natural' || kind === 'set') {
      const list = kind === 'person' ? [...characters.map((c) => [c, c]), ['', 'Outra pessoa']] : kind === 'natural' ? Object.entries(NATURAL) : Object.entries(SET).map(([k, v2]) => [k, v2[0]]);
      pop.innerHTML = `<h4>${{ person: 'Pessoa', natural: 'Luz natural', set: 'Peça de décor' }[kind]}</h4><div class="lm-pl">${list.map(([k, l]) => `<button type="button" class="lm-pi" data-basic="${esc(k)}"><span>${esc(l)}</span></button>`).join('')}</div>`;
      pop.querySelectorAll('[data-basic]').forEach((b) => b.addEventListener('click', () => { closePop(); if (kind === 'person') addBasic('person', null, b.dataset.basic); else addBasic(kind, b.dataset.basic); }));
      return;
    }
    const cat = POP_CAT[kind]; const u = used(); const words = norm(popQ).split(/\s+/).filter(Boolean);
    const match = (g) => words.every((w) => norm(`${g.brand} ${g.name} ${specLine(g)}`).includes(w));
    const mine = gear.filter((g) => g.category === cat && placeable(g) && match(g));
    const inList = (c) => gear.some((g) => g.category === c.category && norm(g.name) === norm(c.name) && norm(g.brand) === norm(c.brand));
    const cat2 = data.limit ? [] : CATALOG.map((c, i) => ({ c, i })).filter(({ c }) => c.category === cat && placeable(c) && !inList(c) && match(c));
    const title = { light: 'Luzes', camera: 'Câmaras', mod: 'Frames, bandeiras, rebatedores', stand: 'Tripés e suportes' }[kind];
    pop.innerHTML = `<h4>${title}</h4><input type="search" class="lm-pq" data-pq placeholder="Procurar…" value="${esc(popQ)}" aria-label="Procurar">
      <div class="lm-pl">${mine.length ? `<span class="lm-plh">Equipamento do projeto</span>${mine.map((g) => { const n = u.get(g.id) || 0; return `<button type="button" class="lm-pi ${n >= g.qty ? 'full' : ''} ${n > g.qty ? 'over' : ''}" draggable="true" data-kit-g="${g.id}" title="${esc(specLine(g))}"><span class="lm-kit-n">${esc(g.name)}<small>${esc([g.brand, specLine(g)].filter(Boolean).join(' · '))}</small></span><span class="lm-kit-c">${n}/${g.qty}</span></button>`; }).join('')}` : `<p class="muted small">${words.length ? 'Nada na lista com isto.' : 'Ainda não há nada desta categoria no equipamento.'}</p>`}
      ${cat2.length ? `<span class="lm-plh">Catálogo geral <small>(entra sozinho na lista)</small></span>${cat2.slice(0, 40).map(({ c, i }) => `<button type="button" class="lm-pi cat" data-cat-i="${i}" title="${esc(specLine(c))}"><span class="lm-kit-n">${esc(c.name)}<small>${esc([c.brand, specLine(c)].filter(Boolean).join(' · '))}</small></span><span class="lm-kit-c">${ICON.plus}</span></button>`).join('')}` : ''}
      ${data.limit ? `<p class="muted small lm-limhint">Limitado à lista. Desliga “Só a lista de equipamento” em cima para ir buscar ao catálogo geral.</p>` : ''}</div>
      <button type="button" class="btn ghost sm" data-own>${ICON.plus} ${data.limit ? 'Juntar ao equipamento…' : 'Outro (escrever à mão)…'}</button>`;
    const q = pop.querySelector('[data-pq]'); q.addEventListener('input', () => { popQ = q.value; const pos = q.selectionStart; drawPop(); const q2 = pop.querySelector('[data-pq]'); q2.focus(); q2.setSelectionRange(pos, pos); });
    pop.querySelectorAll('[data-kit-g]').forEach((b) => {
      b.addEventListener('click', () => { closePop(); addGear(G(b.dataset.kitG)); });
      b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-gear', b.dataset.kitG); e.dataTransfer.effectAllowed = 'copy'; });
    });
    pop.querySelectorAll('[data-cat-i]').forEach((b) => b.addEventListener('click', async () => { const row = await fromCatalog(CATALOG[+b.dataset.catI]); if (row) { closePop(); addGear(row, null, true); } }));
    pop.querySelector('[data-own]').addEventListener('click', () => { closePop(); addGearModal(p, { cat, onDone: async (row) => { gear = await loadGear(p.id); draw(); if (row && !data.limit) addGear(G(row.id), null, true); } }); });
  }
  // junta uma peça do catálogo geral à lista de equipamento do projeto
  async function fromCatalog(c) {
    const { data: row, error } = await sb.from('gear').insert({ project_id: p.id, category: c.category, name: c.name, brand: c.brand || '', qty: 1, specs: JSON.parse(JSON.stringify(c.specs || {})), position: Date.now() / 1000 }).select().single();
    if (error) { toast(error.message); return null; }
    gear.push(row); toast(`${gearName(row)} juntado ao equipamento do projeto.`);
    return row;
  }
  function kit() { if (popKind) drawPop(); }

  // garante que há unidades na lista; se não houver, pergunta se junta mais uma ao equipamento
  async function ensureUnit(g, extra = 0, fresh = false) {
    const n = (used().get(g.id) || 0) + extra;
    if (n < g.qty || fresh) return true;
    if (!data.limit) {
      const { error } = await sb.from('gear').update({ qty: n + 1, updated_at: new Date().toISOString() }).eq('id', g.id);
      if (error) { toast(error.message); return false; }
      g.qty = n + 1; toast(`Equipamento atualizado: ${gearName(g)} passa a ${g.qty}.`); return true;
    }
    return new Promise((resolve) => {
      const m = modal(`<h2>Só há ${g.qty} na lista</h2><p>${esc(gearName(g))} já está ${n === 1 ? 'uma vez' : n + ' vezes'} neste mapa e o equipamento do projeto tem ${g.qty}. Para usar mais um, junta-o à lista (a quantidade passa para ${n + 1}).</p>
        <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-yes>Juntar mais um ao equipamento</button></div>`, { onClose: () => resolve(false) });
      m.el.querySelector('[data-yes]').addEventListener('click', async () => {
        const { error } = await sb.from('gear').update({ qty: n + 1, updated_at: new Date().toISOString() }).eq('id', g.id);
        if (error) { toast(error.message); return; }
        g.qty = n + 1; toast(`${gearName(g)}: agora são ${g.qty} no equipamento.`);
        m.el.querySelector('[data-yes]').disabled = true; resolve(true); setTimeout(() => m.close(), 0);
      });
    });
  }

  const center = () => { const { w, h } = size(); const v = st.view; return { x: Math.round(((w / 2 - v.x) / v.k) * 10) / 10, y: Math.round(((h / 2 - v.y) / v.k) * 10) / 10 }; };
  async function addGear(g, at, fresh = false) {
    if (!g) return;
    if (!(await ensureUnit(g, 0, fresh))) return;
    const pos = at || center();
    const b = { id: uid(), x: pos.x, y: pos.y, rot: 0, gear_id: g.id };
    let it;
    if (g.category === 'light') { const s = g.specs || {}; it = { ...b, kind: 'light', intensity: 70, cct: s.cct ? (s.color === 'tungsten' ? s.cct[0] : s.cct[1] >= 5600 && s.cct[0] <= 5600 ? 5600 : s.cct[1]) : 5600, gel: '', diff: '', mod_id: null, height: 2.2, tilt: -15, dmx: '', notes: '' }; }
    else if (g.category === 'camera') { const lens = gear.find((x) => x.category === 'lens'); const f = lens ? (lensFocals(lens)?.[2] || lensFocals(lens)?.[0] || lens.specs?.zoom?.[0] || 35) : 35; it = { ...b, kind: 'camera', rot: -90, code: '', lens_id: lens?.id || null, focal: f, height: 1.5, tilt: 0 }; }
    else if (g.category === 'modifier') it = { ...b, kind: 'mod', fabric: g.specs?.fabric ?? '' };
    else if (g.category === 'stand') it = { ...b, kind: 'stand', height: g.specs?.max_h ? Math.min(2.2, g.specs.max_h) : null };
    else return toast('Só luzes, câmaras, modificadores e tripés vão para o mapa.');
    hist.push('juntar'); data.items.push(it); st.sel = it.id; draw(); save();
  }
  function addBasic(kind, sub, name) {
    const pos = center(); const b = { id: uid(), kind, x: pos.x, y: pos.y, rot: 0 };
    const it = kind === 'person' ? { ...b, name: name ?? characters[0] ?? '' }
      : kind === 'natural' ? { ...b, type: sub, cct: sub === 'ceu' ? 7000 : sub === 'sol' ? 5600 : 6000, intensity: 100, notes: '' }
      : { ...b, piece: sub, w: SET[sub][1], h: SET[sub][2] };
    hist.push('juntar'); data.items.push(it); st.sel = it.id; draw(); save();
  }

  // ---------- propriedades ----------
  const fld = (k, label, val, type = 'text', extra = '') => `<label class="mini">${label}<input data-k="${k}" type="${type}" value="${esc(val ?? '')}" ${extra}></label>`;
  const standSel = (it, use) => { const list = gear.filter((g) => g.category === 'stand'); const pref = list.filter((g) => (g.specs?.stand || 'light') === use); const rest = list.filter((g) => !pref.includes(g)); return list.length ? `<label class="mini">Tripé / suporte<select data-k="stand_id"><option value="">—</option>${[...pref, ...rest].map((g) => `<option value="${g.id}" ${g.id === it.stand_id ? 'selected' : ''}>${esc(gearName(g))}</option>`).join('')}</select></label>` : ''; };
  const opt = (list, cur, none) => `${none != null ? `<option value="">${none}</option>` : ''}${list.map((g) => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${esc(gearName(g))}</option>`).join('')}`;
  function props() {
    const it = data.items.find((x) => x.id === st.sel); const box = main.querySelector('[data-props]');
    box.hidden = !it;
    if (!it) { box.innerHTML = `<h3 class="h3">Como funciona</h3><ul class="lm-help"><li>Junta luzes, câmaras e frames a partir do <b>Equipamento</b> à esquerda.</li><li>Arrasta para mover; a bolinha azul roda (Shift = livre).</li><li>Setas movem 10 cm (Shift: 50 cm).</li><li><kbd>Delete</kbd> apaga · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplica · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz.</li><li>Roda do rato aproxima; arrastar o fundo move o mapa.</li></ul>`; return; }
    let f = ''; let head = '';
    if (it.kind === 'light') {
      const L = lightInfo(it); const s = L.s; const fixed = s.cct && s.cct[0] === s.cct[1];
      const mods = gear.filter((g) => g.category === 'modifier' && ATTACH.includes(g.specs?.mod));
      head = L.g ? `<p class="lm-gear"><b>${esc(gearName(L.g))}</b><small>${esc(specLine(L.g))}</small></p>` : `<p class="lm-warn">Esta luz não está no equipamento do projeto. Escolhe uma da lista:</p>`;
      f = `<label class="mini">Aparelho<select data-k="gear_id">${opt(gear.filter((g) => g.category === 'light'), it.gear_id, L.g ? null : '— escolher —')}</select></label>
        <label class="mini lm-range">Intensidade <b data-out="intensity">${Math.round(+it.intensity || 0)}%</b><input data-k="intensity" type="range" min="0" max="100" step="1" value="${+it.intensity || 0}"></label>
        ${s.color === 'rgb' ? `<div class="lm-pair"><label class="mini">Cor RGB<input data-k="rgb" type="color" value="${esc(it.rgb || '#ffffff')}"></label><button type="button" class="btn ghost sm" data-norgb ${it.rgb ? '' : 'hidden'}>Usar temperatura</button></div>` : ''}
        ${fixed ? `<p class="small muted">Temperatura fixa: ${s.cct[0]}K</p>` : `<label class="mini lm-range">Temperatura <b data-out="cct">${L.cct}K</b><input data-k="cct" type="range" min="${s.cct?.[0] || 2000}" max="${s.cct?.[1] || 10000}" step="50" value="${L.cct}"></label>`}
        <label class="mini">Gelatina<select data-k="gel">${GELS.map(([k, l]) => `<option value="${esc(k)}" ${k === (it.gel || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="mini">Difusão<select data-k="diff">${FABRICS.filter((x) => !/negativo|ultrabounce/i.test(x)).map((x) => `<option value="${esc(x)}" ${x === (it.diff || '') ? 'selected' : ''}>${x || 'Sem difusão'}</option>`).join('')}</select></label>
        <label class="mini">Modificador<select data-k="mod_id">${opt(mods, it.mod_id, mods.length ? 'Sem modificador' : 'Nenhum no equipamento')}</select></label>
        ${L.mod?.specs?.mod === 'fresnel' ? `<label class="mini lm-range">Spot / flood <b data-out="spot">${clamp(+it.spot || 25, 12, 50)}°</b><input data-k="spot" type="range" min="12" max="50" step="1" value="${clamp(+it.spot || 25, 12, 50)}"></label>` : ''}
        ${standSel(it, 'light')}
        <div class="lm-pair">${fld('height', 'Altura (m)', it.height, 'number', 'step="0.1" min="0"')}${fld('tilt', 'Inclinação (°)', it.tilt, 'number', 'step="5" min="-90" max="90"')}</div>
        <div class="lm-pair">${fld('dmx', 'Canal DMX', it.dmx, 'text', 'placeholder="ex: U1 / 101"')}${s.battery ? `<label class="check mini-check"><input type="checkbox" data-k="battery" ${it.battery ? 'checked' : ''}> A bateria</label>` : ''}</div>
        ${fld('notes', 'Notas', it.notes)}
        <p class="lm-read" data-read></p>`;
    }
    if (it.kind === 'camera') {
      const cam = G(it.gear_id); const lens = G(it.lens_id); const focals = lens ? lensFocals(lens) : null;
      head = cam ? `<p class="lm-gear"><b>${esc(gearName(cam))}</b><small>${esc(specLine(cam))}</small></p>` : '<p class="lm-warn">Esta câmara não está no equipamento. Escolhe uma da lista:</p>';
      const lenses = gear.filter((g) => g.category === 'lens');
      f = `<label class="mini">Câmara<select data-k="gear_id">${opt(gear.filter((g) => g.category === 'camera'), it.gear_id, cam ? null : '— escolher —')}</select></label>
        ${fld('code', 'Plano / câmara', it.code, 'text', 'placeholder="ex: 5A ou A-cam"')}
        <label class="mini">Objetiva<select data-k="lens_id">${opt(lenses, it.lens_id, lenses.length ? '— escolher —' : 'Nenhuma no equipamento')}</select></label>
        ${focals && focals.length ? `<label class="mini">Focal<select data-k="focal">${focals.map((x) => `<option value="${x}" ${+x === +it.focal ? 'selected' : ''}>${x} mm</option>`).join('')}</select></label>`
          : fld('focal', `Focal (mm)${lens?.specs?.zoom ? ` · ${lens.specs.zoom[0]}–${lens.specs.zoom[1]}` : ''}`, it.focal, 'number', `min="${lens?.specs?.zoom?.[0] || 4}" max="${lens?.specs?.zoom?.[1] || 1200}"`)}
        ${standSel(it, 'camera')}
        <div class="lm-pair">${fld('height', 'Altura (m)', it.height, 'number', 'step="0.1" min="0"')}${fld('tilt', 'Inclinação (°)', it.tilt, 'number', 'step="5" min="-90" max="90"')}</div>
        <p class="lm-read" data-read></p>`;
    }
    if (it.kind === 'stand') {
      const g = G(it.gear_id);
      head = g ? `<p class="lm-gear"><b>${esc(gearName(g))}</b><small>${esc(specLine(g))}</small></p>` : '<p class="lm-warn">Não está no equipamento.</p>';
      f = `<label class="mini">Tripé / suporte<select data-k="gear_id">${opt(gear.filter((x) => x.category === 'stand'), it.gear_id, g ? null : '— escolher —')}</select></label>${fld('height', 'Altura (m)', it.height, 'number', 'step="0.1" min="0"')}${fld('notes', 'Notas (ex: com bandeira 24x36)', it.notes)}`;
    }
    if (it.kind === 'mod') {
      const g = G(it.gear_id);
      head = g ? `<p class="lm-gear"><b>${esc(gearName(g))}</b><small>${esc(specLine(g))}</small></p>` : '<p class="lm-warn">Não está no equipamento.</p>';
      f = `<label class="mini">Peça<select data-k="gear_id">${opt(gear.filter((x) => x.category === 'modifier' && PLACE.includes(x.specs?.mod)), it.gear_id, g ? null : '— escolher —')}</select></label>
        ${standSel(it, 'light')}
        <label class="mini">Tela<select data-k="fabric">${FABRICS.map((x) => `<option value="${esc(x)}" ${x === (it.fabric ?? '') ? 'selected' : ''}>${x || '—'}</option>`).join('')}</select></label>${fld('notes', 'Notas', it.notes)}`;
    }
    if (it.kind === 'natural') f = `<label class="mini">Tipo<select data-k="type">${Object.entries(NATURAL).map(([k, v]) => `<option value="${k}" ${k === it.type ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="mini lm-range">Temperatura <b data-out="cct">${+it.cct || 5600}K</b><input data-k="cct" type="range" min="2000" max="12000" step="100" value="${+it.cct || 5600}"></label>
      <label class="mini lm-range">Força <b data-out="intensity">${Math.round(+it.intensity || 0)}%</b><input data-k="intensity" type="range" min="0" max="100" value="${+it.intensity || 0}"></label>${fld('notes', 'Notas (hora, direção…)', it.notes)}`;
    if (it.kind === 'person') f = `<label class="mini">Nome<input data-k="name" list="lm-chars" value="${esc(it.name || '')}"><datalist id="lm-chars">${characters.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>`;
    if (it.kind === 'set') f = `<label class="mini">Peça<select data-k="piece">${Object.entries(SET).map(([k, v]) => `<option value="${k}" ${k === it.piece ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label><div class="lm-pair">${fld('w', 'Largura (m)', it.w, 'number', 'step="0.1" min="0.1"')}${fld('h', 'Profundidade (m)', it.h, 'number', 'step="0.05" min="0.05"')}</div>`;
    const title = { light: 'Luz', camera: 'Câmara', person: 'Pessoa', set: 'Décor', mod: 'Modificador', natural: 'Luz natural', stand: 'Tripé / suporte' }[it.kind];
    box.innerHTML = `<h3 class="h3">${title} <span class="muted">${esc(labels()[it.id] || '')}</span></h3>${head}${f}${fld('rot', 'Rotação (°)', Math.round(it.rot || 0), 'number', 'step="5"')}
      <div class="row"><button type="button" class="btn ghost" data-dup>Duplicar</button><button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button></div>`;
    const readout = () => {
      const r = box.querySelector('[data-read]'); if (!r) return;
      if (it.kind === 'light') { const L = lightInfo(it); r.innerHTML = `<span><b>${L.s.color === 'rgb' && it.rgb ? 'RGB' : `${L.k}K`}</b> efetivos${it.gel && gelOf(it.gel)[2] ? ` (com ${esc(it.gel)})` : ''}</span><span>Feixe <b>${L.beam >= 300 ? '360°' : Math.round(L.beam) + '°'}</b></span><span>Consumo <b>${Math.round(L.draw)} W</b>${L.watts ? ` de ${L.watts}` : ''}${it.battery ? ' · bateria' : ''}</span>${gelOf(it.gel)[3] ? `<span>−${gelOf(it.gel)[3]} stop${gelOf(it.gel)[3] > 1 ? 's' : ''} (ND)</span>` : ''}`; }
      if (it.kind === 'camera') { const cam = G(it.gear_id); const lens = G(it.lens_id); const sw = cam?.specs?.sensor_w || 24.89; const sq = lens?.specs?.squeeze || 1; const hf = (2 * Math.atan((sw * sq) / (2 * (+it.focal || 35))) * 180) / Math.PI; r.innerHTML = `<span>Campo horizontal <b>${hf.toFixed(1)}°</b></span><span>Sensor <b>${sw} mm</b>${sq > 1 ? ` · anamórfica ${sq}x` : ''}</span>`; }
    };
    readout();
    box.querySelectorAll('[data-k]').forEach((inp) => {
      inp.addEventListener('focus', () => hist.push('alterar'), { once: true });
      if (inp.type === 'range' || inp.type === 'color') inp.addEventListener('pointerdown', () => hist.push('alterar'), { once: true });
      const ev = inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input';
      inp.addEventListener(ev, async () => {
        const k = inp.dataset.k;
        let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' || inp.type === 'range' ? Number(inp.value) : inp.value;
        if (['gear_id', 'mod_id', 'lens_id', 'stand_id'].includes(k)) {
          v = v || null;
          if (v && v !== it[k]) { const g = G(v); if (!(await ensureUnit(g))) { inp.value = it[k] || ''; return; } }
        }
        if (k === 'focal') v = Number(inp.value);
        it[k] = v;
        if (k === 'piece') { it.w = SET[it.piece][1]; it.h = SET[it.piece][2]; }
        if (k === 'gear_id' && it.kind === 'light') { const s = G(v)?.specs; if (s?.cct) it.cct = clamp(+it.cct || s.cct[1], s.cct[0], s.cct[1]); delete it.type; delete it.temp; delete it.model; delete it.beam; }
        if (k === 'lens_id') { const fs = lensFocals(G(v)); if (fs?.length && !fs.includes(+it.focal)) it.focal = fs[Math.min(2, fs.length - 1)]; }
        const out = box.querySelector(`[data-out="${k}"]`); if (out) out.textContent = k === 'cct' ? `${v}K` : k === 'spot' ? `${v}°` : `${Math.round(v)}%`;
        if (k === 'rgb') box.querySelector('[data-norgb]')?.removeAttribute('hidden');
        if (['gear_id', 'mod_id', 'lens_id', 'stand_id', 'piece', 'type'].includes(k) || inp.tagName === 'SELECT') draw(); else { drawSvg(); readout(); }
        save();
      });
    });
    box.querySelector('[data-norgb]')?.addEventListener('click', () => { hist.push('alterar'); delete it.rgb; draw(); save(); });
    box.querySelector('[data-dup]').addEventListener('click', duplicate);
    box.querySelector('[data-del]').addEventListener('click', remove);
  }
  async function duplicate() {
    const it = data.items.find((x) => x.id === st.sel); if (!it) return;
    for (const k of ['gear_id', 'mod_id', 'lens_id', 'stand_id']) { const g = it[k] && G(it[k]); if (g && !(await ensureUnit(g))) return; }
    hist.push('duplicar');
    const c = { ...JSON.parse(JSON.stringify(it)), id: uid(), x: it.x + 0.6, y: it.y + 0.6 }; if (c.kind === 'camera') c.code = '';
    data.items.push(c); st.sel = c.id; draw(); save();
  }
  function remove() { hist.push('apagar'); data.items = data.items.filter((x) => x.id !== st.sel); st.sel = null; draw(); save(); }

  // ---------- legenda, consumo e material ----------
  function legendRows(lab) {
    const lights = data.items.filter((x) => x.kind === 'light'); const cams = data.items.filter((x) => x.kind === 'camera'); const nat = data.items.filter((x) => x.kind === 'natural'); const mods = data.items.filter((x) => x.kind === 'mod');
    return [
      ...cams.map((c) => { const cam = G(c.gear_id); const lens = G(c.lens_id); return { lab: lab[c.id], color: '#1E2AD4', what: cam ? gearName(cam) : 'Câmara (fora da lista)', how: [lens ? gearName(lens) : '', c.focal ? `${c.focal}mm` : '', c.height ? `altura ${c.height} m` : '', c.tilt ? `tilt ${c.tilt}°` : '', G(c.stand_id) ? gearName(G(c.stand_id)) : ''].filter(Boolean).join(' · '), notes: '' }; }),
      ...lights.map((l) => { const L = lightInfo(l); return { lab: lab[l.id], color: L.color, what: L.g ? gearName(L.g) : `${l.type || 'Luz'} (fora da lista)`, how: [`${Math.round(+l.intensity || 0)}%`, L.s.color === 'rgb' && l.rgb ? 'RGB ' + l.rgb : `${L.k}K`, l.gel, l.diff, L.mod ? gearName(L.mod) : '', L.beam >= 300 ? '360°' : Math.round(L.beam) + '°', l.height ? `h ${l.height} m` : '', l.tilt ? `tilt ${l.tilt}°` : '', l.dmx ? `DMX ${l.dmx}` : '', l.battery ? 'bateria' : '', G(l.stand_id) ? gearName(G(l.stand_id)) : ''].filter(Boolean).join(' · '), notes: l.notes || '' }; }),
      ...nat.map((n) => ({ lab: lab[n.id], color: kColor(+n.cct || 5600), what: NATURAL[n.type] || 'Luz natural', how: `${n.cct || 5600}K · ${Math.round(+n.intensity || 0)}%`, notes: n.notes || '' })),
      ...mods.map((m) => { const g = G(m.gear_id); return { lab: '', color: '#cfd3e0', what: g ? gearName(g) : 'Frame (fora da lista)', how: m.fabric || g?.specs?.fabric || '', notes: m.notes || '' }; }),
    ];
  }
  function powerInfo() {
    const lights = data.items.filter((x) => x.kind === 'light').map(lightInfo);
    const items = data.items.filter((x) => x.kind === 'light');
    const mains = lights.filter((L, i) => !items[i].battery);
    const now = mains.reduce((a, L) => a + L.draw, 0); const max = mains.reduce((a, L) => a + L.watts, 0);
    const bat = lights.length - mains.length;
    const cap = gear.filter((g) => g.category === 'power' && g.specs?.capacity_w).reduce((a, g) => a + g.specs.capacity_w * (g.qty || 1), 0);
    return { now, max, amps: max / 230, circuits: Math.max(1, Math.ceil(max / 3680)), bat, cap };
  }
  function material() {
    const u = used();
    return [...u.entries()].map(([id, n]) => ({ g: G(id), n })).filter((x) => x.g).sort((a, b) => a.g.category.localeCompare(b.g.category) || gearName(a.g).localeCompare(gearName(b.g)));
  }
  function foot(lab) {
    const rows = legendRows(lab);
    main.querySelector('[data-legend]').innerHTML = `<h3 class="h3">Legenda</h3>${rows.length ? `<ul>${rows.map((r) => `<li><i style="background:${r.color}"></i>${r.lab ? `<strong>${esc(r.lab)}</strong>` : ''}<span><b>${esc(r.what)}</b> ${esc(r.how)}${r.notes ? ` <span class="muted">— ${esc(r.notes)}</span>` : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">Junta luzes e câmaras do equipamento.</p>'}`;
    const P = powerInfo(); const pct = P.cap ? Math.min(100, (P.max / P.cap) * 100) : 0;
    main.querySelector('[data-power]').innerHTML = `<h3 class="h3">Consumo</h3>
      <div class="lm-kw"><b>${(P.max / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} kW</b><span>tudo a 100%</span></div>
      <div class="lm-kw"><b>${(P.now / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} kW</b><span>com as intensidades do mapa</span></div>
      <p class="small">${P.amps.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} A a 230 V · ${P.circuits} circuito${P.circuits > 1 ? 's' : ''} de 16 A${P.bat ? ` · ${P.bat} luz${P.bat > 1 ? 'es' : ''} a bateria (fora da conta)` : ''}</p>
      ${P.cap ? `<div class="lm-cap ${P.max > P.cap ? 'over' : P.max > P.cap * 0.8 ? 'near' : ''}"><i style="width:${pct}%"></i></div><p class="small ${P.max > P.cap ? 'danger-text' : 'muted'}">${P.max > P.cap ? `Passa ${((P.max - P.cap) / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} kW do que os geradores/baterias da lista dão (${(P.cap / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} kW).` : `Geradores/baterias da lista: ${(P.cap / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} kW.`}</p>` : '<p class="small muted">Sem gerador nem bateria no equipamento.</p>'}`;
    const mat = material();
    main.querySelector('[data-mat]').innerHTML = `<h3 class="h3">Material deste mapa</h3>${mat.length ? `<ul>${mat.map(({ g, n }) => `<li class="${n > g.qty ? 'over' : ''}"><span>${n}×</span> ${esc(gearName(g))}${n > g.qty ? ` <small class="danger-text">só há ${g.qty}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Nada ainda.</p>'}`;
    const off = data.items.filter((x) => (x.kind === 'light' || x.kind === 'camera' || x.kind === 'mod' || x.kind === 'stand') && !G(x.gear_id)).length;
    main.querySelector('[data-hint]').innerHTML = off ? `<span>${off} peça${off > 1 ? 's' : ''} fora do equipamento — seleciona e escolhe da lista</span>` : '';
  }

  // ---------- rato e teclado ----------
  const toM = (e) => { const { r } = size(); return { x: (e.clientX - r.left - st.view.x) / st.view.k, y: (e.clientY - r.top - st.view.y) / st.view.k }; };
  svg.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    if (e.target.classList.contains('lm-rot')) { hist.push('rodar'); st.drag = { mode: 'rot' }; e.preventDefault(); return; }
    const g = e.target.closest('[data-id]');
    if (g) { const it = data.items.find((x) => x.id === g.dataset.id); const changed = st.sel !== it.id; st.sel = it.id; const m = toM(e); st.drag = { mode: 'move', dx: it.x - m.x, dy: it.y - m.y, snap: JSON.stringify(data.items) }; if (changed) draw(); else drawSvg(); }
    else { const had = st.sel; st.sel = null; st.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y }; if (had) draw(); }
    e.preventDefault();
  });
  const move = (e) => {
    const d = st.drag; if (!d) return;
    if (d.mode === 'pan') { st.view.x = d.vx + e.clientX - d.sx; st.view.y = d.vy + e.clientY - d.sy; drawSvg(); return; }
    const it = data.items.find((x) => x.id === st.sel); if (!it) return;
    const m = toM(e);
    if (d.mode === 'move') { if (!d.moved && d.snap) hist.push('mover', d.snap); it.x = Math.round((m.x + d.dx) * 20) / 20; it.y = Math.round((m.y + d.dy) * 20) / 20; }
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
  canvas.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/x-gear')) { e.preventDefault(); canvas.classList.add('drop'); } });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('drop'));
  canvas.addEventListener('drop', (e) => { const id = e.dataTransfer.getData('text/x-gear'); canvas.classList.remove('drop'); if (!id) return; e.preventDefault(); const m = toM(e); addGear(G(id), { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 }); });
  let nudgeT;
  canvas.addEventListener('keydown', (e) => {
    if (!st.sel) return;
    const it = data.items.find((x) => x.id === st.sel);
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
    if (e.key === 'Escape') { st.sel = null; draw(); }
    if (it && e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); if (!nudgeT) hist.push('mover');
      const s = e.shiftKey ? 0.5 : 0.1;
      if (e.key === 'ArrowLeft') it.x -= s; if (e.key === 'ArrowRight') it.x += s; if (e.key === 'ArrowUp') it.y -= s; if (e.key === 'ArrowDown') it.y += s;
      it.x = Math.round(it.x * 100) / 100; it.y = Math.round(it.y * 100) / 100; drawSvg(); save();
      clearTimeout(nudgeT); nudgeT = setTimeout(() => { nudgeT = null; }, 700);
    }
  });
  bindUndoKeys(main, hist);

  main.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => openPop(b.dataset.tool, b)));
  main.querySelector('[data-limit]').addEventListener('change', (e) => { data.limit = e.target.checked; main.querySelector('[data-limitlabel]').textContent = data.limit ? 'Só a lista de equipamento' : 'Lista + catálogo geral'; save(); if (popKind) drawPop(); });
  main.querySelector('[data-drawer-t]').addEventListener('click', (e) => { const d2 = main.querySelector('[data-drawer]'); d2.hidden = !d2.hidden; e.currentTarget.classList.toggle('on', !d2.hidden); });
  main.querySelector('[data-opt]')?.addEventListener('click', () => opts.onOptions());
  const popOut = (e) => { if (popKind && !e.target.closest('[data-pop], [data-tool], #modal')) closePop(); };
  document.addEventListener('pointerdown', popOut, true);
  main.querySelector('[data-undo]').addEventListener('click', () => hist.undo());
  main.querySelector('[data-fit]').addEventListener('click', fit);
  main.querySelector('[data-png]').addEventListener('click', () => exportPng(svg, tool.title));
  main.querySelector('[data-pdf]').addEventListener('click', async () => {
    const url = await svgPng(svg, 2);
    const lab = labels();
    exportMapPdf({ title: tool.title, project: p, img: url, legend: legendRows(lab), material: material(), power: powerInfo(), notes: data.notes || '' });
  });

  // ligações ao plano e ao décor
  (async () => {
    const box = main.querySelector('[data-links]'); if (!box) return;
    const [{ data: shot }, { data: loc }] = await Promise.all([
      data.shot_id ? sb.from('shots').select('id, code, description').eq('id', data.shot_id).maybeSingle() : { data: null },
      data.location_id ? sb.from('locations').select('id, name').eq('id', data.location_id).maybeSingle() : { data: null },
    ]);
    box.innerHTML = [shot ? `<a class="chip" href="${base}/plano/${shot.id}">${ICON.camera} Plano ${esc(shot.code || '')} ${esc(shot.description || '')}</a>` : '', loc ? `<a class="chip" href="${base}/decors/${loc.id}">${ICON.home} ${esc(loc.name)}</a>` : ''].join('');
  })();

  // equipamento: carrega e volta a ler quando se regressa à janela (alguém pode ter mudado a lista)
  const refresh = async () => { gear = await loadGear(p.id); if (st.view) draw(); };
  const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
  document.addEventListener('visibilitychange', onVis);
  refresh().then(() => requestAnimationFrame(fit));
  const ro = new ResizeObserver(() => st.view && drawSvg()); ro.observe(canvas);
  return { destroy() { ro.disconnect(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.removeEventListener('visibilitychange', onVis); document.removeEventListener('pointerdown', popOut, true); } };
}

async function svgPng(svg, scale = 2) {
  const r = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true); clone.setAttribute('width', r.width); clone.setAttribute('height', r.height);
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = r.width * scale; cv.height = r.height * scale;
  const ctx = cv.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
  return cv.toDataURL('image/png');
}
async function exportPng(svg, title) {
  const url = await svgPng(svg, 2);
  const a = document.createElement('a'); a.href = url; a.download = `${(title || 'mapa-de-luz').replace(/[^\w\-]+/g, '-')}.png`; a.click();
}

// PDF: o mapa, a legenda das luzes e câmaras, o material e o consumo — pronto para mandar ao gaffer
function exportMapPdf({ title, project, img, legend, material, power }) {
  const kw = (w) => (w / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 2 }) + ' kW';
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4 landscape; margin: 10mm; } * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font: 9.5px/1.35 'Helvetica Neue', Arial, sans-serif; color: #111; margin: 0; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
    h1 { font-size: 17px; margin: 0; } .sub { color: #555; font-size: 10px; } .brand { font-weight: 800; font-size: 12px; }
    .wrap { display: grid; grid-template-columns: 1.55fr 1fr; gap: 10px; align-items: start; }
    .map { width: 100%; border-radius: 6px; display: block; }
    h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; } td { padding: 3px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
    td.l { width: 28px; font-weight: 800; white-space: nowrap; } td.l i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; border: 1px solid #0003; }
    .muted { color: #666; } .pw { display: flex; gap: 14px; flex-wrap: wrap; } .pw b { font-size: 12px; display: block; } .over { color: #c0392b; font-weight: 700; }
  </style></head><body>
  <header><div><h1>${esc(title)}</h1><div class="sub">${esc(project.name)}${project.client ? ' · ' + esc(project.client) : ''}</div></div><div class="brand">byGrain</div></header>
  <div class="wrap"><img class="map" src="${img}" alt="">
    <div>
      <h2>Legenda</h2><table>${legend.map((r) => `<tr><td class="l"><i style="background:${r.color}"></i>${esc(r.lab || '')}</td><td><b>${esc(r.what)}</b><br>${esc(r.how)}${r.notes ? `<br><span class="muted">${esc(r.notes)}</span>` : ''}</td></tr>`).join('')}</table>
      <h2>Material</h2><table>${material.map(({ g, n }) => `<tr><td class="l">${n}×</td><td>${esc(gearName(g))}${n > g.qty ? ` <span class="over">(só há ${g.qty})</span>` : ''}<br><span class="muted">${esc(specLine(g))}</span></td></tr>`).join('')}</table>
      <h2>Consumo</h2><div class="pw"><span><b>${kw(power.max)}</b>tudo a 100%</span><span><b>${kw(power.now)}</b>com as intensidades</span><span><b>${power.amps.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} A</b>a 230 V</span><span><b>${power.circuits}</b>circuitos de 16 A</span>${power.cap ? `<span class="${power.max > power.cap ? 'over' : ''}"><b>${kw(power.cap)}</b>geradores/baterias</span>` : ''}</div>
    </div></div></body></html>`;
  const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(fr); const d = fr.contentWindow.document; d.open(); d.write(html); d.close();
  setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 60000); }, 400);
}

export { MOD_KINDS };
