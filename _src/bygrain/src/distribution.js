import { sb, esc, toast, ICON, confirmBox, modal } from './lib.js';
import { COUNTRIES, CONTINENTS, findCountry } from './countries.js';

// Tabela Distribuição: onde está o filme (links: trailer, filme, …) e a lista de festivais/mostras com
// deadline, tipo, fee, submissão, data, estado, país, continente, nomeação e prémio.
// Fica tudo em boards.data = { links: [{ id, label, url }], rows: [{ … }] }.

const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const TYPES = ['Festival', 'Mostra', 'Prémio', 'Cineclube', 'Cinema', 'Plataforma', 'Outro'];
export const SUBMISSION = [['todo', 'Por fazer', '#8A8A99'], ['doing', 'Em curso', '#E3B341'], ['done', 'Efetuada', '#2FB67C']];
export const STATUS = [['todo', 'Por fazer', '#8A8A99'], ['waiting', 'A aguardar', '#2B7FFF'], ['accepted', 'Aceite', '#2FB67C'], ['rejected', 'Recusada', '#E5484D']];
const of = (list, k) => list.find((x) => x[0] === k) || list[0];
export const newDistribution = () => ({ links: [{ id: uid(), label: 'Trailer', url: '' }, { id: uid(), label: 'Filme', url: '' }], rows: [] });
const newRow = () => ({ id: uid(), name: '', url: '', deadline: '', type: 'Festival', fee: '', submission: 'todo', submitted_at: '', status: 'todo', country: '', continent: '', nomination: '', award: '' });
const fmtFee = (v) => { const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return String(v ?? '').trim() && Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : (v || ''); };
const fmtD = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function distributionTool(main, p, tool) {
  const data = { ...newDistribution(), ...(tool.data || {}) };
  data.links ||= []; data.rows ||= [];
  const st = { sort: 'deadline', q: '', filter: 'all' };
  const save = debounce(async () => { const { error } = await sb.from('boards').update({ data, updated_at: new Date().toISOString() }).eq('id', tool.id); if (error) toast('Não foi possível guardar: ' + error.message); else tool.data = data; });

  const draw = () => {
    const rows = data.rows.filter((r) => (st.filter === 'all' || r.status === st.filter || (st.filter === 'open' && r.submission !== 'done')) && (!st.q || norm(`${r.name} ${r.country} ${r.continent} ${r.type}`).includes(norm(st.q))));
    const sorted = [...rows].sort((a, b) => (st.sort === 'deadline' ? (a.deadline || '9999').localeCompare(b.deadline || '9999') : st.sort === 'name' ? a.name.localeCompare(b.name, 'pt') : st.sort === 'country' ? (a.country || '').localeCompare(b.country || '', 'pt') : 0));
    const total = data.rows.reduce((a, r) => a + (Number(String(r.fee).replace(',', '.')) || 0), 0);
    const spent = data.rows.filter((r) => r.submission === 'done').reduce((a, r) => a + (Number(String(r.fee).replace(',', '.')) || 0), 0);
    const cnt = (k) => data.rows.filter((r) => r.status === k).length;
    const today = new Date().toISOString().slice(0, 10);
    const next = data.rows.filter((r) => r.deadline && r.deadline >= today && r.submission !== 'done').sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
    main.innerHTML = `
      <section class="panel dist-links"><div class="row between wrap-gap"><h2 class="h3">Dados do filme</h2><button type="button" class="btn ghost sm" data-addlink>${ICON.plus} Linha</button></div>
        <table class="table dist-lt"><tbody>${data.links.map((l, i) => `<tr data-link="${l.id}"><td class="dl-l"><input data-lk="label" value="${esc(l.label)}" placeholder="ex: Trailer, Filme, Press kit" aria-label="Nome do link"></td><td><input data-lk="url" value="${esc(l.url)}" placeholder="https://… (Vimeo, Drive, …)" aria-label="Link"></td>
          <td class="dl-a">${l.url ? `<a class="icon-btn sm" href="${esc(/^https?:/i.test(l.url) ? l.url : 'https://' + l.url)}" target="_blank" rel="noopener" title="Abrir">${ICON.open}</a><button type="button" class="icon-btn sm" data-copy="${i}" title="Copiar o link">${ICON.copy}</button>` : ''}<button type="button" class="icon-btn sm" data-rmlink="${l.id}" aria-label="Tirar">${ICON.close}</button></td></tr>`).join('')}</tbody></table></section>
      <div class="dist-sum">
        <span><b>${data.rows.length}</b> ${data.rows.length === 1 ? 'festival' : 'festivais'}</span>
        <span><b>${data.rows.filter((r) => r.submission === 'done').length}</b> submetidos</span>
        <span class="ok"><b>${cnt('accepted')}</b> aceites</span><span class="no"><b>${cnt('rejected')}</b> recusados</span><span><b>${cnt('waiting')}</b> a aguardar</span>
        <span>Fees: <b>${eur.format(spent)}</b> pagos de ${eur.format(total)}</span>
        ${next ? `<span class="nx">Próximo deadline: <b>${esc(next.name || 'sem nome')}</b> · ${fmtD(next.deadline)}</span>` : ''}
      </div>
      <div class="row between wrap-gap dist-bar">
        <div class="row wrap-gap"><input type="search" data-q value="${esc(st.q)}" placeholder="Procurar festival, país…" aria-label="Procurar">
          <select data-filter aria-label="Mostrar"><option value="all">Todos</option><option value="open">Por submeter</option>${STATUS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <select data-sort aria-label="Ordenar"><option value="deadline">Por deadline</option><option value="name">Por nome</option><option value="country">Por país</option><option value="none">Pela ordem</option></select></div>
        <div class="row wrap-gap"><button type="button" class="btn ghost" data-xlsx>${ICON.copy} Exportar Excel</button><button type="button" class="btn primary" data-addrow>${ICON.plus} Festival</button></div>
      </div>
      <div class="panel table-wrap dist-tw"><table class="table dist-t"><thead><tr><th>Nome</th><th>Deadline</th><th>Tipo</th><th class="num">Fee</th><th>Submissão</th><th>Data de submissão</th><th>Estado da submissão</th><th>País</th><th>Continente</th><th>Nomeação</th><th>Prémio</th><th></th></tr></thead>
        <tbody>${sorted.map((r) => { const sb0 = of(SUBMISSION, r.submission); const s0 = of(STATUS, r.status); const late = r.deadline && r.deadline < today && r.submission !== 'done'; return `<tr data-row="${r.id}">
          <td class="dt-name"><div class="row"><input data-k="name" value="${esc(r.name)}" placeholder="Nome do festival" aria-label="Nome">${r.url ? `<a class="icon-btn sm" href="${esc(/^https?:/i.test(r.url) ? r.url : 'https://' + r.url)}" target="_blank" rel="noopener" title="Abrir o site">${ICON.open}</a>` : ''}<button type="button" class="icon-btn sm dt-url" data-url title="${r.url ? 'Mudar o site' : 'Juntar o site do festival'}">${ICON.link}</button></div></td>
          <td><input type="date" data-k="deadline" value="${esc(r.deadline)}" class="${late ? 'late' : ''}" aria-label="Deadline"></td>
          <td><select data-k="type" aria-label="Tipo">${TYPES.map((t) => `<option ${t === r.type ? 'selected' : ''}>${t}</option>`).join('')}${r.type && !TYPES.includes(r.type) ? `<option selected>${esc(r.type)}</option>` : ''}</select></td>
          <td class="num"><input data-k="fee" value="${esc(fmtFee(r.fee))}" inputmode="decimal" placeholder="0,00 €" aria-label="Fee"></td>
          <td><select data-k="submission" class="pill" style="--c:${sb0[2]}" aria-label="Submissão">${SUBMISSION.map(([k, l]) => `<option value="${k}" ${k === r.submission ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td><input type="date" data-k="submitted_at" value="${esc(r.submitted_at)}" aria-label="Data de submissão"></td>
          <td><select data-k="status" class="pill" style="--c:${s0[2]}" aria-label="Estado da submissão">${STATUS.map(([k, l]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td><button type="button" class="dt-pick" data-pick="country">${r.country ? esc(r.country) : '<span class="muted">País</span>'}</button></td>
          <td><button type="button" class="dt-pick" data-pick="continent">${r.continent ? esc(r.continent) : '<span class="muted">Continente</span>'}</button></td>
          <td><input data-k="nomination" value="${esc(r.nomination)}" placeholder="—" aria-label="Nomeação"></td>
          <td><input data-k="award" value="${esc(r.award)}" placeholder="—" aria-label="Prémio"></td>
          <td><button type="button" class="icon-btn sm" data-rmrow aria-label="Apagar">${ICON.trash}</button></td></tr>`; }).join('') || `<tr><td colspan="12" class="muted small">${data.rows.length ? 'Nada com estes filtros.' : 'Ainda não há festivais. Carrega em "+ Festival".'}</td></tr>`}</tbody></table></div>`;
    bind();
  };
  const rowOf = (el) => data.rows.find((r) => r.id === el.closest('[data-row]').dataset.row);
  const bind = () => {
    main.querySelector('[data-q]').addEventListener('input', (e) => { st.q = e.target.value; const pos = e.target.selectionStart; draw(); const n = main.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); });
    const fs = main.querySelector('[data-filter]'); fs.value = st.filter; fs.addEventListener('change', () => { st.filter = fs.value; draw(); });
    const ss = main.querySelector('[data-sort]'); ss.value = st.sort; ss.addEventListener('change', () => { st.sort = ss.value; draw(); });
    main.querySelector('[data-addrow]').addEventListener('click', () => { const r = newRow(); data.rows.push(r); st.q = ''; st.filter = 'all'; save(); draw(); main.querySelector(`[data-row="${r.id}"] [data-k="name"]`)?.focus(); });
    main.querySelector('[data-addlink]').addEventListener('click', () => { data.links.push({ id: uid(), label: '', url: '' }); save(); draw(); const ls = main.querySelectorAll('[data-lk="label"]'); ls[ls.length - 1]?.focus(); });
    main.querySelectorAll('[data-lk]').forEach((el) => el.addEventListener('input', () => { const l = data.links.find((x) => x.id === el.closest('[data-link]').dataset.link); l[el.dataset.lk] = el.value; save(); }));
    main.querySelectorAll('[data-lk="url"]').forEach((el) => el.addEventListener('change', draw));
    main.querySelectorAll('[data-rmlink]').forEach((b) => b.addEventListener('click', () => { data.links = data.links.filter((x) => x.id !== b.dataset.rmlink); save(); draw(); }));
    main.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(data.links[+b.dataset.copy].url); toast('Link copiado.'); } catch { toast('Não deu para copiar.'); } }));
    main.querySelectorAll('[data-k]').forEach((el) => {
      const ev = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const r = rowOf(el); const k = el.dataset.k; r[k] = el.value;
        if (k === 'submission' && el.value === 'done') { if (!r.submitted_at) r.submitted_at = new Date().toISOString().slice(0, 10); if (r.status === 'todo') r.status = 'waiting'; }
        save();
        if (ev === 'change') draw();
      });
    });
    main.querySelectorAll('[data-k="fee"]').forEach((el) => el.addEventListener('blur', () => { const v = Number(String(el.value).replace(/[^\d,.-]/g, '').replace(',', '.')); if (el.value.trim() && Number.isFinite(v)) { el.value = v.toFixed(2).replace('.', ','); rowOf(el).fee = el.value; save(); draw(); } }));
    main.querySelectorAll('[data-rmrow]').forEach((b) => b.addEventListener('click', async () => { const r = rowOf(b); if (r.name && !(await confirmBox(`Tirar "${r.name}" da lista?`, 'Tirar'))) return; data.rows = data.rows.filter((x) => x !== r); save(); draw(); }));
    main.querySelectorAll('[data-url]').forEach((b) => b.addEventListener('click', () => {
      const r = rowOf(b);
      const m = modal(`<h2>Site do festival</h2><form class="stack"><div class="field"><label for="fu">Link</label><input id="fu" value="${esc(r.url || '')}" placeholder="https://…"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
      m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); r.url = m.el.querySelector('#fu').value.trim(); m.close(); save(); draw(); });
    }));
    main.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      const r = rowOf(b); const k = b.dataset.pick;
      const items = k === 'country' ? COUNTRIES.map((c) => ({ id: c.name, label: c.name, sub: c.cont })) : CONTINENTS.map((c) => ({ id: c, label: c, sub: '' }));
      pick(b, { items, placeholder: k === 'country' ? 'Procurar país…' : 'Procurar continente…', allowFree: true, onPick: (v) => {
        if (k === 'country') { r.country = v; const c = findCountry(v) || COUNTRIES.find((x) => x.name === v); if (c && (!r.continent || r.continent !== c.cont)) r.continent = c.cont; }
        else r.continent = v;
        save(); draw();
      } });
    }));
    main.querySelector('[data-xlsx]').addEventListener('click', () => exportXlsx(p, tool, data));
  };
  draw();
}

// menu pequeno com pesquisa
function pick(anchor, { items, placeholder, onPick, allowFree }) {
  document.querySelector('.pk')?.remove();
  const box = document.createElement('div'); box.className = 'pk';
  box.innerHTML = `<input type="search" placeholder="${esc(placeholder)}" autocomplete="off"><div class="pk-l" data-l></div>`;
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - 300))}px`; box.style.top = `${r.bottom + window.scrollY + 4}px`;
  const inp = box.querySelector('input'); const list = box.querySelector('[data-l]'); let sel = 0; let shown = [];
  const close = () => { box.remove(); document.removeEventListener('mousedown', out, true); };
  const out = (e) => { if (!box.contains(e.target) && e.target !== anchor) close(); };
  document.addEventListener('mousedown', out, true);
  const draw = () => {
    const q = norm(inp.value);
    shown = items.filter((x) => !q || norm(`${x.label} ${x.sub}`).includes(q)).sort((a, b) => (norm(a.label).startsWith(q) ? 0 : 1) - (norm(b.label).startsWith(q) ? 0 : 1)).slice(0, 60);
    const alias = q && findCountry(inp.value); if (alias && !shown.some((x) => x.id === alias.name)) shown.unshift({ id: alias.name, label: alias.name, sub: alias.cont });
    if (allowFree && inp.value.trim() && !shown.some((x) => norm(x.label) === q)) shown.push({ id: inp.value.trim(), label: inp.value.trim(), sub: 'escrever assim', free: true });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.map((x, i) => `<button type="button" class="pk-i ${i === sel ? 'on' : ''} ${x.free ? 'new' : ''}" data-i="${i}"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('') || '<p class="muted small">Nada encontrado.</p>';
    list.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); const x = shown[+b.dataset.i]; close(); onPick(x.id); }));
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); const x = shown[sel]; close(); onPick(x.id); }
    else if (e.key === 'Escape') close();
  });
  draw(); setTimeout(() => inp.focus(), 20);
}

async function exportXlsx(p, tool, data) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Distribuição');
  ws.addRow([tool.title || 'Tabela Distribuição', p.name]).font = { bold: true, size: 14 };
  data.links.filter((l) => l.url).forEach((l) => { const r = ws.addRow([l.label, l.url]); r.getCell(2).value = { text: l.url, hyperlink: /^https?:/i.test(l.url) ? l.url : 'https://' + l.url }; });
  ws.addRow([]);
  const head = ws.addRow(['Nome', 'Deadline', 'Tipo', 'Fee', 'Submissão', 'Data de submissão', 'Estado da submissão', 'País', 'Continente', 'Nomeação', 'Prémio']);
  head.font = { bold: true }; head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5EA' } }; });
  const fillOf = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex.replace('#', '') } });
  [...data.rows].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).forEach((r) => {
    const fee = Number(String(r.fee).replace(',', '.'));
    const row = ws.addRow([r.name, r.deadline ? new Date(r.deadline + 'T00:00:00') : '', r.type, Number.isFinite(fee) && String(r.fee).trim() ? fee : '', of(SUBMISSION, r.submission)[1], r.submitted_at ? new Date(r.submitted_at + 'T00:00:00') : '', of(STATUS, r.status)[1], r.country, r.continent, r.nomination, r.award]);
    if (r.url) row.getCell(1).value = { text: r.name || r.url, hyperlink: /^https?:/i.test(r.url) ? r.url : 'https://' + r.url };
    row.getCell(2).numFmt = 'd mmm yyyy'; row.getCell(6).numFmt = 'd mmm yyyy'; row.getCell(4).numFmt = '#,##0.00 €';
    row.getCell(5).fill = fillOf(of(SUBMISSION, r.submission)[2]); row.getCell(7).fill = fillOf(of(STATUS, r.status)[2]);
    [5, 7].forEach((i) => { row.getCell(i).font = { color: { argb: 'FFFFFFFF' }, bold: true }; });
  });
  ws.columns.forEach((c, i) => { c.width = [34, 14, 12, 10, 12, 16, 18, 16, 18, 22, 22][i] || 12; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = `${tool.title || 'Distribuição'} — ${p.name}.xlsx`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
