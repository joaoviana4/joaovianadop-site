import { bindTimes } from './timepick.js';
import { sb, esc, toast, modal, confirmBox, ICON } from './lib.js';
import { projectContacts, phoneFor } from './contacts.js';

// Mapa de transportes (ferramenta de produção).
// Por dia: secções (ex.: Elenco, Realização e produção, Equipa) com viagens.
// Cada viagem: hora de recolha, viatura e lugares, condutor e telefone, passageiros, de, para, chegada e notas.
// Sugere pessoas do elenco e da equipa, décors (com morada → link do mapa) e viaturas já usadas.
// Traz o elenco de uma folha de serviço (recolha 30 min antes do call). Exporta para PDF em dois modelos e para Excel.

const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const COLORS = ['#C8382D', '#1E2AD4', '#2FB67C', '#F08A24', '#7C5CFF', '#2AA8C9', '#E5579B', '#8A8A99'];
const v = (x) => (x == null ? '' : String(x));
const has = (x) => v(x).trim() !== '';
const longDate = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); const s = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const shortDay = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); };
const nextDay = (iso) => { const d = new Date((iso || new Date().toISOString().slice(0, 10)) + 'T00:00:00'); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const minus = (hhmm, min) => { const m = /^(\d{1,2})[:h](\d{2})$/.exec(v(hhmm).trim()); if (!m) return ''; let t = +m[1] * 60 + +m[2] - min; t = (t + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const tkey = (x) => { const m = /^(\d{1,2})[:h](\d{2})/.exec(v(x)); return m ? +m[1] * 60 + +m[2] : 9999; };

export function newTransport(p) {
  return { model: 'sections', accent: '#C8382D', sheets: [blankDay(p)] };
}
function blankDay(p, date = '') {
  const secs = [['Elenco', COLORS[0]], ['Realização e produção', COLORS[1]], ['Equipa', COLORS[2]]].map(([title, color]) => ({ id: uid(), title, color }));
  return { id: uid(), title: (p.name || '').toUpperCase(), date, notes: '', sections: secs, trips: [] };
}
const newTrip = (sec, o = {}) => ({ id: uid(), sec, time: '', vehicle: '', seats: 4, driver: '', phone: '', pax: [], from: '', to: '', arrival: '', notes: '', ...o });

export async function transportTool(main, p, tool) {
  const all = tool.data?.sheets?.length ? tool.data : newTransport(p);
  all.sheets.forEach((s) => { s.sections = s.sections || []; s.trips = s.trips || []; });
  const key = `bg-tr-day:${tool.id}`;
  let cur = 0; try { cur = Math.min(all.sheets.length - 1, Math.max(0, Number(localStorage.getItem(key)) || 0)); } catch { /* nada */ }
  let d = all.sheets[cur];
  const save = debounce(async () => { const { error } = await sb.from('boards').update({ data: all, updated_at: new Date().toISOString() }).eq('id', tool.id); if (error) toast('Não foi possível guardar: ' + error.message); else tool.data = all; });

  // sugestões: elenco, equipa, décors
  const [{ data: chars }, { data: locs }, { data: team }] = await Promise.all([
    sb.from('characters').select('name, actor, info').eq('project_id', p.id).order('position'),
    sb.from('locations').select('name, info').eq('project_id', p.id).order('position'),
    sb.from('profiles').select('display_name').order('display_name'),
  ]);
  const contacts = await projectContacts(p);
  const people = [...new Set([...(chars || []).map((c) => (c.actor ? `${c.actor}` : c.name)), ...contacts.map((c) => c.name), ...(team || []).map((t) => t.display_name).filter(Boolean)])];
  const places = (locs || []).map((l) => ({ name: l.name, address: l.info?.address || l.info?.morada || '' }));
  const placeAddr = (txt) => { const pl = places.find((x) => x.name.toLowerCase() === v(txt).trim().toLowerCase()); return pl?.address || txt; };

  const go = (i) => { cur = Math.max(0, Math.min(all.sheets.length - 1, i)); d = all.sheets[cur]; try { localStorage.setItem(key, cur); } catch { /* nada */ } draw(); };

  const draw = () => {
    const vehicles = [...new Set(all.sheets.flatMap((s) => s.trips.map((t) => t.vehicle)).filter(has))];
    const drivers = [...new Set([...all.sheets.flatMap((s) => s.trips.map((t) => t.driver)).filter(has), ...contacts.filter((c) => c.kind === 'crew').map((c) => c.name)])];
    const sorted = (sec) => d.trips.filter((t) => t.sec === sec.id);
    const paxCount = d.trips.reduce((a, t) => a + t.pax.filter(has).length, 0);
    main.innerHTML = `
      <div class="cs-days" role="tablist" aria-label="Dias">
        <button type="button" class="cs-dnav" data-go="-1" aria-label="Dia anterior" ${cur === 0 ? 'disabled' : ''}>${ICON.back}</button>
        <div class="cs-dtabs">${all.sheets.map((s, i) => `<button type="button" role="tab" class="cs-dtab ${i === cur ? 'on' : ''}" aria-selected="${i === cur}" data-day="${i}" style="--acc:${esc(all.accent)}"><b>${s.date ? esc(shortDay(s.date)) : `Dia ${i + 1}`}</b><small class="muted">${s.trips.length} viage${s.trips.length === 1 ? 'm' : 'ns'}</small></button>`).join('')}</div>
        <button type="button" class="cs-dnav" data-go="1" aria-label="Dia seguinte" ${cur === all.sheets.length - 1 ? 'disabled' : ''}>${ICON.chev}</button>
        <button type="button" class="btn ghost" data-addday title="Copia secções e viagens para o dia seguinte">${ICON.plus} Dia</button>
        <button type="button" class="btn ghost" data-addblank>${ICON.plus} Dia em branco</button>
        ${all.sheets.length > 1 ? `<button type="button" class="btn ghost danger-text" data-rmday aria-label="Apagar este dia">${ICON.trash}</button>` : ''}
      </div>
      <div class="row between wrap-gap cs-bar">
        <div class="row wrap-gap"><label class="cs-acc" title="Cor"><input type="color" data-acc value="${esc(all.accent)}"><span>Cor</span></label>
          <button type="button" class="btn ghost" data-fromcs>${ICON.calendar} Trazer elenco da folha de serviço</button>
          <button type="button" class="btn ghost" data-addsec>${ICON.plus} Secção</button></div>
        <button type="button" class="btn primary" data-export>${ICON.open} Exportar</button></div>
      <div class="tr-layout"><div class="tr-main">
        <section class="cst-card tr-head"><div class="tr-hgrid">
          <label><span>Título</span><input class="cst-in tr-title" data-d="title" value="${esc(d.title)}" placeholder="Nome do projeto"></label>
          <label><span>Data</span><input class="cst-in" type="date" data-d="date" value="${esc(d.date)}" style="color-scheme:dark"></label>
          <label class="tr-wide"><span>Notas do dia</span><input class="cst-in" data-d="notes" value="${esc(d.notes)}" placeholder="ex: todas as recolhas confirmadas por SMS na véspera"></label></div></section>
        ${d.sections.map((sec) => `<section class="cst-card tr-sec" style="--sc:${esc(sec.color)}" data-sec="${sec.id}">
          <div class="tr-sech"><label class="tr-sw" title="Cor da secção"><input type="color" data-scolor value="${esc(sec.color)}"></label><input class="cst-in tr-secname" data-stitle value="${esc(sec.title)}" placeholder="Secção">
            <span class="muted small">${sorted(sec).length} viage${sorted(sec).length === 1 ? 'm' : 'ns'}</span><span class="tr-sp"></span>
            <button type="button" class="cst-add" data-sort>Ordenar por hora</button><button type="button" class="cst-x" data-rmsec aria-label="Apagar secção">×</button></div>
          ${sorted(sec).length ? `<div class="cst-tw"><table class="cst-t tr-t"><thead><tr><th>Recolha</th><th>Viatura</th><th>Condutor</th><th>Passageiros</th><th>De</th><th>Para</th><th>Chegada</th><th>Notas</th><th></th></tr></thead><tbody>
          ${sorted(sec).map((t) => { const n = t.pax.filter(has).length; const over = n > (+t.seats || 0); return `<tr data-trip="${t.id}">
            <td class="tr-time"><input class="cst-in" data-t="time" value="${esc(t.time)}" placeholder="07:30" aria-label="Hora de recolha"></td>
            <td><input class="cst-in" data-t="vehicle" list="tr-veh" value="${esc(t.vehicle)}" placeholder="Carrinha 1" aria-label="Viatura"><span class="tr-seats ${over ? 'over' : ''}"><input class="cst-in" data-t="seats" inputmode="numeric" value="${esc(t.seats)}" aria-label="Lugares"> lugares · ${n} ocupado${n === 1 ? '' : 's'}</span></td>
            <td><input class="cst-in" data-t="driver" list="tr-drv" value="${esc(t.driver)}" placeholder="Condutor" aria-label="Condutor"><input class="cst-in tr-phone" data-t="phone" value="${esc(t.phone)}" placeholder="Telefone" aria-label="Telefone"></td>
            <td class="tr-pax"><div class="tr-chips">${t.pax.map((x, i) => `<span class="tr-chip">${esc(x)}<button type="button" data-rmpax="${i}" aria-label="Tirar ${esc(x)}">×</button></span>`).join('')}</div><input class="cst-in" data-addpax list="tr-ppl" placeholder="+ passageiro (Enter)" aria-label="Juntar passageiro"></td>
            <td><input class="cst-in" data-t="from" list="tr-plc" value="${esc(t.from)}" placeholder="Hotel, base…" aria-label="De"></td>
            <td><input class="cst-in" data-t="to" list="tr-plc" value="${esc(t.to)}" placeholder="Décor" aria-label="Para"></td>
            <td class="tr-time"><input class="cst-in" data-t="arrival" value="${esc(t.arrival)}" placeholder="08:00" aria-label="Chegada"></td>
            <td><input class="cst-in" data-t="notes" value="${esc(t.notes)}" aria-label="Notas"></td>
            <td class="cst-ctl"><button type="button" class="cst-mv" data-dup title="Duplicar">⧉</button><button type="button" class="cst-x" data-rmtrip aria-label="Apagar viagem">×</button></td></tr>`; }).join('')}
          </tbody></table></div>` : '<p class="muted small">Sem viagens nesta secção.</p>'}
          <button type="button" class="cst-add" data-addtrip>${ICON.plus}<span>Viagem</span></button>
        </section>`).join('')}
      </div>
      <aside class="tr-side">
        <section class="cst-card"><h3>Resumo do dia</h3><p class="small">${d.trips.length} viagens · ${paxCount} passageiros · ${new Set(d.trips.map((t) => t.vehicle).filter(has)).size} viaturas</p></section>
        <section class="cst-card"><h3>Por condutor</h3>${(() => { const by = {}; d.trips.forEach((t) => { const k = t.driver || '— sem condutor'; (by[k] = by[k] || []).push(t); }); const ks = Object.keys(by); return ks.length ? ks.map((k) => `<div class="tr-drv"><b>${esc(k)}</b>${by[k].sort((a, b) => tkey(a.time) - tkey(b.time)).map((t) => `<span>${esc(t.time || '--:--')} ${esc(t.from || '?')} → ${esc(t.to || '?')}</span>`).join('')}</div>`).join('') : '<p class="muted small">—</p>'; })()}</section>
      </aside></div>
      <datalist id="tr-ppl">${people.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <datalist id="tr-plc">${places.map((x) => `<option value="${esc(x.name)}">${esc(x.address)}</option>`).join('')}</datalist>
      <datalist id="tr-veh">${vehicles.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <datalist id="tr-drv">${drivers.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;

    const trip = (el) => d.trips.find((t) => t.id === el.closest('[data-trip]').dataset.trip);
    const secOf = (el) => d.sections.find((s) => s.id === el.closest('[data-sec]').dataset.sec);
    main.querySelectorAll('[data-d]').forEach((el) => el.addEventListener('input', () => { d[el.dataset.d] = el.value; save(); if (el.dataset.d === 'date') { const tb = main.querySelector(`[data-day="${cur}"] b`); if (tb) tb.textContent = el.value ? shortDay(el.value) : `Dia ${cur + 1}`; } }));
    main.querySelectorAll('[data-t]').forEach((el) => el.addEventListener('input', () => {
      const t = trip(el); const k = el.dataset.t; t[k] = k === 'seats' ? Math.max(0, parseInt(el.value, 10) || 0) : el.value; save();
      if (k === 'seats') { const n = t.pax.filter(has).length; const sp = el.closest('.tr-seats'); sp.classList.toggle('over', n > t.seats); }
    }));
    main.querySelectorAll('[data-t="seats"]').forEach((el) => el.addEventListener('change', draw));
    bindTimes([...main.querySelectorAll('[data-t="time"], [data-t="arrival"]')]);
    // condutor da equipa: o telefone vem sozinho (se ainda não estiver escrito)
    main.querySelectorAll('[data-t="driver"]').forEach((el) => el.addEventListener('change', () => {
      const t = trip(el); const ph = phoneFor(contacts, el.value);
      if (ph && !has(t.phone)) { t.phone = ph; const pi = el.parentElement.querySelector('[data-t="phone"]'); if (pi) pi.value = ph; save(); }
    }));
    main.querySelectorAll('[data-addpax]').forEach((el) => {
      const add = () => { const val = el.value.trim(); if (!val) return; const t = trip(el); t.pax.push(val); el.value = ''; save(); draw(); main.querySelector(`[data-trip="${t.id}"] [data-addpax]`)?.focus(); };
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      el.addEventListener('change', () => { if (el.value.trim()) add(); });
    });
    main.querySelectorAll('[data-rmpax]').forEach((b) => b.addEventListener('click', () => { const t = trip(b); t.pax.splice(+b.dataset.rmpax, 1); save(); draw(); }));
    main.querySelectorAll('[data-rmtrip]').forEach((b) => b.addEventListener('click', async () => { const t = trip(b); if (has(t.time) || t.pax.length) { if (!(await confirmBox('Apagar esta viagem?', 'Apagar'))) return; } d.trips = d.trips.filter((x) => x !== t); save(); draw(); }));
    main.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', () => { const t = trip(b); const i = d.trips.indexOf(t); d.trips.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(t)), id: uid(), pax: [] }); save(); draw(); }));
    main.querySelectorAll('[data-addtrip]').forEach((b) => b.addEventListener('click', () => { const s = secOf(b); const last = [...d.trips].reverse().find((t) => t.sec === s.id); d.trips.push(newTrip(s.id, last ? { vehicle: last.vehicle, seats: last.seats, driver: last.driver, phone: last.phone, to: last.to } : {})); save(); draw(); }));
    main.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { const s = secOf(b); const mine = d.trips.filter((t) => t.sec === s.id).sort((a, c) => tkey(a.time) - tkey(c.time)); const rest = d.trips.filter((t) => t.sec !== s.id); d.trips = [...rest, ...mine]; save(); draw(); }));
    main.querySelectorAll('[data-stitle]').forEach((el) => el.addEventListener('input', () => { secOf(el).title = el.value; save(); }));
    main.querySelectorAll('[data-scolor]').forEach((el) => el.addEventListener('input', () => { secOf(el).color = el.value; el.closest('[data-sec]').style.setProperty('--sc', el.value); save(); }));
    main.querySelectorAll('[data-rmsec]').forEach((b) => b.addEventListener('click', async () => { const s = secOf(b); const n = d.trips.filter((t) => t.sec === s.id).length; if (!(await confirmBox(n ? `Apagar a secção "${s.title}" e as ${n} viagens?` : `Apagar a secção "${s.title}"?`, 'Apagar'))) return; d.sections = d.sections.filter((x) => x !== s); d.trips = d.trips.filter((t) => t.sec !== s.id); save(); draw(); }));
    main.querySelector('[data-addsec]').addEventListener('click', () => { d.sections.push({ id: uid(), title: '', color: COLORS[d.sections.length % COLORS.length] }); save(); draw(); main.querySelector('.tr-sec:last-of-type [data-stitle]')?.focus(); });
    main.querySelector('[data-acc]').addEventListener('input', (e) => { all.accent = e.target.value; save(); });
    main.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.day)));
    main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(cur + +b.dataset.go)));
    main.querySelector('[data-addday]').addEventListener('click', () => { const c = JSON.parse(JSON.stringify(d)); c.id = uid(); c.date = d.date ? nextDay(all.sheets[all.sheets.length - 1].date || d.date) : ''; c.trips.forEach((t) => { t.id = uid(); }); all.sheets.push(c); save(); go(all.sheets.length - 1); toast('Dia novo com as mesmas secções e viagens. Ajusta o que muda.'); });
    main.querySelector('[data-addblank]').addEventListener('click', () => { const last = all.sheets[all.sheets.length - 1]; all.sheets.push(blankDay(p, last.date ? nextDay(last.date) : '')); save(); go(all.sheets.length - 1); });
    main.querySelector('[data-rmday]')?.addEventListener('click', async () => { if (!(await confirmBox('Apagar este dia e todas as viagens?', 'Apagar dia'))) return; all.sheets.splice(cur, 1); save(); go(Math.min(cur, all.sheets.length - 1)); });
    main.querySelector('[data-fromcs]').addEventListener('click', () => fromCallsheet());
    main.querySelector('[data-export]').addEventListener('click', () => exportDialog());
  };

  // trazer o elenco de um dia de uma folha de serviço: uma viagem por pessoa, recolha 30 min antes do call
  async function fromCallsheet() {
    const { data: tools } = await sb.from('boards').select('id, title, data').eq('project_id', p.id).eq('kind', 'callsheet');
    const days = (tools || []).flatMap((b) => (b.data?.sheets || (b.data?.rows ? [b.data] : [])).map((s, i) => ({ b, s, i }))).filter((x) => (x.s.cast || []).length);
    if (!days.length) return toast('Nenhuma folha de serviço tem elenco ainda.');
    const m = modal(`<h2>Trazer elenco da folha de serviço</h2><p class="muted small">Cria uma viagem por pessoa na secção Elenco: chegada à hora de call, recolha 30 minutos antes, destino no décor do dia. Depois juntas viaturas e condutores.</p>
      <div class="stack">${days.map((x, k) => `<label class="cs-opt"><input type="radio" name="d" value="${k}" ${k === 0 ? 'checked' : ''}><span><b>${esc(x.b.title)} · Dia ${esc(x.s.day || x.i + 1)}</b><small>${esc(longDate(x.s.date))}${x.s.place ? ' · ' + esc(x.s.place) : ''} · ${x.s.cast.length} pessoa${x.s.cast.length === 1 ? '' : 's'}</small></span></label>`).join('')}</div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>Trazer</button></div>`);
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      const x = days[+m.el.querySelector('[name=d]:checked').value];
      let sec = d.sections.find((s) => /elenco|cast/i.test(s.title));
      if (!sec) { sec = { id: uid(), title: 'Elenco', color: COLORS[0] }; d.sections.unshift(sec); }
      x.s.cast.forEach((c) => d.trips.push(newTrip(sec.id, { pax: [c.name].filter(has), arrival: c.call || x.s.call || '', time: minus(c.call || x.s.call, 30), to: x.s.place || '', notes: c.role ? `${c.role}` : '' })));
      if (!d.date && x.s.date) d.date = x.s.date;
      m.close(); save(); draw(); toast(`${x.s.cast.length} viagens criadas. Junta viaturas e condutores.`);
    });
  }

  // ---------- exportar ----------
  function exportDialog() {
    let pref = {}; try { pref = JSON.parse(localStorage.getItem('bg-tr-export') || '{}'); } catch { /* nada */ }
    const radio = (name, val, on, title, sub) => `<label class="cs-opt"><input type="radio" name="${name}" value="${val}" ${on ? 'checked' : ''}><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;
    const m = modal(`<h2>Exportar mapa de transportes</h2><form class="stack" data-f>
      <fieldset class="cs-opts"><legend>Formato</legend>${radio('fmt', 'pdf', (pref.fmt || 'pdf') === 'pdf', 'PDF', 'Para enviar aos condutores e à equipa')}${radio('fmt', 'xlsx', pref.fmt === 'xlsx', 'Excel (.xlsx)', 'Uma linha por viagem')}</fieldset>
      <fieldset class="cs-opts"><legend>Modelo</legend>${radio('model', 'sections', (all.model || 'sections') === 'sections', 'Por secções', 'Vertical, com as viagens agrupadas por secção e o condutor ao lado dos passageiros')}${radio('model', 'vehicle', all.model === 'vehicle', 'Por viatura', 'Horizontal, um bloco por viagem com os lugares numerados')}</fieldset>
      <div class="cs-colors"><div class="stack"><span class="cs-leg">Cor</span><label class="cs-col" style="max-width:120px"><input type="color" name="accent" value="${esc(all.accent)}"><span>Principal</span></label></div><div class="cs-prev" aria-hidden="true"><iframe data-prev title="Pré-visualização" tabindex="-1"></iframe></div></div>
      ${all.sheets.length > 1 ? `<fieldset class="cs-opts"><legend>Dias</legend>${radio('days', 'one', true, 'Só este dia')}${radio('days', 'all', false, `Todos os dias (${all.sheets.length})`, 'Um dia por página / folha')}</fieldset>` : ''}
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Exportar</button></div></form>`, { wide: true });
    const f = m.el.querySelector('[data-f]'); const fr = m.el.querySelector('[data-prev]');
    const paint = () => { const model = f.elements.model.value; fr.style.width = model === 'vehicle' ? '1123px' : '794px'; fr.style.height = model === 'vehicle' ? '794px' : '1123px'; fr.style.transform = `scale(${model === 'vehicle' ? 0.267 : 0.378})`; fr.srcdoc = trDoc([d], model, f.elements.accent.value, places); };
    f.querySelectorAll('input').forEach((i) => i.addEventListener('input', paint)); paint();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const val = Object.fromEntries(new FormData(f));
      all.model = val.model; all.accent = val.accent; save();
      try { localStorage.setItem('bg-tr-export', JSON.stringify({ fmt: val.fmt })); } catch { /* nada */ }
      const list = val.days === 'all' ? all.sheets : [d];
      m.close();
      if (val.fmt === 'xlsx') await trXlsx(list, val.accent, placeAddr); else trPrint(trDoc(list, val.model, val.accent, places));
      draw();
    });
  }

  draw();
}

const ink = (hex) => { const h = v(hex).replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff'; };
const mapLink = (txt, places) => { if (!has(txt)) return ''; const pl = places.find((x) => x.name.toLowerCase() === v(txt).trim().toLowerCase()); const q = pl?.address || txt; const url = /^https?:/.test(q) ? q : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`; return `<a href="${esc(url)}">${esc(txt)}</a>${pl?.address && pl.address !== txt ? `<small>${esc(pl.address)}</small>` : ''}`; };

function trDoc(list, model, acc, places) {
  const A = acc || '#C8382D';
  const page = (d) => {
    const secs = d.sections.map((s) => ({ s, trips: d.trips.filter((t) => t.sec === s.id) })).filter((x) => x.trips.length);
    if (model === 'vehicle') {
      return `<div class="tv"><div class="tv-h"><span>Mapa de transportes${d.title ? ' · ' + esc(d.title) : ''}</span><span>${esc(longDate(d.date))}</span></div>
        <table><thead><tr><th style="width:9%">Horas</th><th style="width:17%">Condutor</th><th style="width:11%">Viatura</th><th style="width:3%"></th><th style="width:20%">Passageiros</th><th style="width:16%">De</th><th style="width:16%">Para</th><th style="width:8%">Chegada</th></tr></thead></table>
        ${secs.map(({ s, trips }) => `${secs.length > 1 ? `<div class="tv-sec" style="background:${esc(s.color)};color:${ink(s.color)}">${esc(s.title)}</div>` : ''}${trips.map((t) => { const n = Math.max(+t.seats || 0, t.pax.length, 1); return `<table class="tv-b"><tbody>${Array.from({ length: n }, (_, i) => `<tr>${i === 0 ? `<td rowspan="${n}" class="big" style="width:9%">${esc(t.time)}</td><td rowspan="${n}" style="width:17%"><b>${esc(t.driver)}</b><br>${esc(t.phone)}</td><td rowspan="${n}" style="width:11%"><span class="veh">${esc([t.vehicle, t.seats ? `${t.seats} lug.` : ''].filter(has).join(' · '))}</span></td>` : ''}<td class="seat" style="width:3%">${i + 1}</td><td style="width:20%">${esc(t.pax[i] || '')}</td>${i === 0 ? `<td rowspan="${n}" class="lk" style="width:16%">${mapLink(t.from, places)}</td><td rowspan="${n}" class="lk" style="width:16%">${mapLink(t.to, places)}</td><td rowspan="${n}" class="big" style="width:8%">${esc(t.arrival)}</td>` : ''}</tr>`).join('')}${has(t.notes) ? `<tr><td colspan="8" class="nt">${esc(t.notes)}</td></tr>` : ''}</tbody></table>`; }).join('')}`).join('')}
        ${has(d.notes) ? `<p class="dn">${esc(d.notes)}</p>` : ''}</div>`;
    }
    return `<div class="ts"><div class="ts-t">${esc(d.title)}</div><div class="ts-d" style="background:${A};color:${ink(A)}">${esc(longDate(d.date))}</div>
      ${has(d.notes) ? `<p class="dn">${esc(d.notes)}</p>` : ''}
      ${secs.map(({ s, trips }) => `<div class="ts-sec" style="background:${esc(s.color)};color:${ink(s.color)}">${esc(s.title)}</div>
        <table><thead><tr><th style="width:9%">Recolha</th><th style="width:19%">Condutor</th><th style="width:22%">Passageiros</th><th style="width:17%">De</th><th style="width:17%">Para</th><th style="width:8%">Chegada</th><th style="width:8%">Notas</th></tr></thead><tbody>
        ${trips.map((t) => `<tr><td class="c"><b>${esc(t.time)}</b></td><td class="c"><b>${esc(t.vehicle)}</b><br>${esc(t.driver)}<br>${esc(t.phone)}</td><td>${t.pax.map(esc).join('<br>')}</td><td class="c lk">${mapLink(t.from, places)}</td><td class="c lk">${mapLink(t.to, places)}</td><td class="c"><b>${esc(t.arrival)}</b></td><td>${esc(t.notes)}</td></tr>`).join('')}</tbody></table>`).join('')}</div>`;
  };
  const css = model === 'vehicle' ? `
    @page { size: A4 landscape; margin: 9mm; }
    .tv { font: 9px/1.3 Arial, Helvetica, sans-serif; color: #111; }
    .tv-h { display: flex; justify-content: space-between; background: #D9D9D9; border: 1px solid #333; padding: 4px 6px; font-weight: 800; font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }
    .tv table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .tv th { border: 1px solid #333; padding: 4px; font-size: 10px; text-transform: uppercase; background: ${A}; color: ${ink(A)}; }
    .tv-b { margin-top: 8px; page-break-inside: avoid; } .tv-b td { border: 1px solid #555; padding: 2px 4px; vertical-align: middle; }
    .tv-b td.big { text-align: center; font-weight: 800; font-size: 12px; } .tv-b td.seat { text-align: center; color: #888; font-size: 8px; }
    .tv-b .veh { background: #D9D9D9; padding: 1px 4px; display: inline-block; } .tv-b td.lk { text-align: center; } .tv-b td.nt { font-style: italic; color: #555; }
    .tv-sec { margin-top: 10px; padding: 3px 6px; font-weight: 800; text-transform: uppercase; }
    a { color: #1155cc; } small { display: block; color: #555; font-size: 7.5px; } .dn { font-style: italic; }` : `
    @page { size: A4 portrait; margin: 9mm; }
    .ts { font: 8.8px/1.3 Arial, Helvetica, sans-serif; color: #111; }
    .ts-t { text-align: center; font-size: 22px; font-weight: 400; letter-spacing: .04em; padding: 4px 0 6px; text-transform: uppercase; }
    .ts-d { text-align: center; font-weight: 700; padding: 3px; font-size: 10px; }
    .ts-sec { text-align: center; font-weight: 800; text-transform: uppercase; padding: 3px; margin-top: 10px; letter-spacing: .05em; }
    .ts table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .ts th { background: #f2f2f2; border: 1px solid #999; padding: 3px; font-size: 8px; text-transform: uppercase; }
    .ts td { border: 1px solid #bbb; padding: 3px 4px; vertical-align: middle; } .ts td.c { text-align: center; }
    .ts tr { page-break-inside: avoid; }
    a { color: #1155cc; } small { display: block; color: #555; font-size: 7.5px; } .dn { text-align: center; font-style: italic; margin: 6px 0 0; }`;
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Mapa de transportes</title><style>* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { margin: 0; background: #fff; } ${css}</style></head><body>${list.map((d, i) => `<div style="${i ? 'break-before: page;' : ''}">${page(d)}</div>`).join('')}</body></html>`;
}
function trPrint(html) {
  const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(fr); const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 60000); }, 300);
}
async function trXlsx(list, acc, placeAddr) {
  toast('A preparar o Excel…');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'byGrain Studio';
  const A = 'FF' + v(acc || '#C8382D').replace('#', '').toUpperCase();
  list.forEach((d, i) => {
    const ws = wb.addWorksheet((d.date ? shortDay(d.date) : `Dia ${i + 1}`).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || `Dia ${i + 1}`, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ header: 'Secção', width: 18 }, { header: 'Recolha', width: 9 }, { header: 'Viatura', width: 16 }, { header: 'Lugares', width: 8 }, { header: 'Condutor', width: 18 }, { header: 'Telefone', width: 15 }, { header: 'Passageiros', width: 34 }, { header: 'De', width: 26 }, { header: 'Para', width: 26 }, { header: 'Chegada', width: 9 }, { header: 'Notas', width: 24 }];
    ws.spliceRows(1, 0, [`${d.title || 'Mapa de transportes'} — ${longDate(d.date)}`], []);
    ws.mergeCells(1, 1, 1, 11); ws.getCell(1, 1).font = { bold: true, size: 13 };
    const hdr = ws.getRow(3); hdr.font = { bold: true, color: { argb: ink(acc) === '#fff' ? 'FFFFFFFF' : 'FF111111' } }; hdr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: A } }; });
    d.sections.forEach((s) => d.trips.filter((t) => t.sec === s.id).forEach((t) => {
      const row = ws.addRow([s.title, t.time, t.vehicle, +t.seats || '', t.driver, t.phone, t.pax.filter(has).join(', '), t.from, t.to, t.arrival, t.notes]);
      [8, 9].forEach((ci) => { const txt = row.getCell(ci).value; if (has(txt)) { const q = placeAddr(txt); row.getCell(ci).value = { text: txt, hyperlink: /^https?:/.test(q) ? q : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` }; row.getCell(ci).font = { color: { argb: 'FF1155CC' }, underline: true }; } });
      row.alignment = { vertical: 'top', wrapText: true };
    }));
    ws.views = [{ state: 'frozen', ySplit: 3 }];
  });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `Mapa de transportes${list.length === 1 && list[0].date ? ' ' + list[0].date : ''}.xlsx`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('Excel exportado.');
}
