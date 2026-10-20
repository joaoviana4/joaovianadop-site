import { sb, esc, toast, modal, confirmBox, ICON, fmtDate, callFn, isStaff } from './lib.js';
import { FLAVOR } from './flavor.js';

// Estatísticas do marketing (Studio): o link de cada publicação e as redes do artista, com os números ao longo do
// tempo. YouTube, TikTok e Spotify: os números públicos são lidos sozinhos (ao juntar, todos os dias e em "Atualizar"),
// sem chaves nem contas. Instagram: à mão, ou sozinho com a ligação (opcional) da Meta. Links próprios contam os clicks.
// Tabelas: mk_accounts, mk_posts, mk_stats, mk_links, mk_clicks (função studio.mk_overview junta tudo num pedido).

export const PL = { youtube: ['YouTube', '#E5484D'], tiktok: ['TikTok', '#2AA8C9'], instagram: ['Instagram', '#E5579B'], spotify: ['Spotify', '#2FB67C'], facebook: ['Facebook', '#5B7CFF'], x: ['X', '#8A8A99'], outro: ['Outro', '#8A8A99'] };
const plName = (k) => (PL[k] || PL.outro)[0];
const plColor = (k) => (PL[k] || PL.outro)[1];
const SHORT = FLAVOR.short;
const nf = new Intl.NumberFormat('pt-PT');
const cf = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 });
const big = (v) => (v == null ? '—' : v >= 10000 ? cf.format(v) : nf.format(v));
const pad = (n) => String(n).padStart(2, '0');
const isoD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoD(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoD(d); };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slugify = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'link';
// lê-se sozinho? (YouTube, TikTok e Spotify sempre; Instagram só com a ligação da Meta; no Spotify, faixas e artistas)
const auto = (pl, st, url = '') => ['youtube', 'tiktok'].includes(pl) || (pl === 'spotify' && !/\/(album|playlist|episode)\//.test(url)) || (pl === 'instagram' && !!st.instagram);
// número principal de uma rede: seguidores (no Spotify, os ouvintes mensais, que é o que se vê na página)
const mainCol = (a) => (a.platform === 'spotify' && (a.series || []).some((r) => r[2] != null) ? 2 : 1);
const mainLabel = (a) => (a.platform === 'youtube' ? 'subscritores' : mainCol(a) === 2 ? 'ouvintes mensais' : 'seguidores');
// pede ao servidor os números de agora (só destas publicações / redes, se forem dadas)
const readNow = (ids, only = {}) => callFn('mk-stats', { action: 'refresh', project_ids: ids, force: true, ...only });
// último valor (não vazio) de uma coluna da série, e o valor de há N dias (para a diferença)
const lastOf = (series, col) => { for (let i = series.length - 1; i >= 0; i--) if (series[i][col] != null) return series[i]; return null; };
const before = (series, col, day) => { for (let i = series.length - 1; i >= 0; i--) if (series[i][0] <= day && series[i][col] != null) return series[i][col]; return null; };
// a leitura mais recente de cada coluna (uma leitura à mão pode trazer só as views, por exemplo)
const latest = (series) => { if (!series?.length) return null; const out = [...series[series.length - 1]]; for (let c = 1; c < out.length - 1; c++) if (out[c] == null) out[c] = lastOf(series, c)?.[c] ?? null; return out; };
const delta = (series, col, n) => { const l = lastOf(series, col); if (!l) return null; const b = before(series, col, daysAgo(n)); return b == null || l[0] <= daysAgo(n) ? null : l[col] - b; };
const sign = (v) => (v == null ? '' : `<span class="mks-d ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${big(Math.abs(v))}</span>`);

async function load(ids) {
  const { data, error } = await sb.rpc('mk_overview', { p: ids });
  if (error) { toast('Não foi possível ler as estatísticas: ' + error.message); return { accounts: [], posts: [], links: [] }; }
  return data || { accounts: [], posts: [], links: [] };
}
let stCache = null;
async function status() { if (stCache) return stCache; try { stCache = await callFn('mk-stats', { action: 'status' }); } catch { stCache = { public: true, youtube: false, instagram: false }; } return stCache; }

// ---------- gráficos (SVG, uma escala só; passar o rato mostra o dia e o valor) ----------
function spark(series, col, color) {
  const pts = series.filter((r) => r[col] != null); if (pts.length < 2) return '';
  const vs = pts.map((r) => r[col]); const lo = Math.min(...vs), hi = Math.max(...vs); const W = 96, H = 28;
  const t0 = new Date(pts[0][0]).getTime(), t1 = new Date(pts[pts.length - 1][0]).getTime() || t0 + 1;
  const xy = pts.map((r) => [((new Date(r[0]).getTime() - t0) / Math.max(1, t1 - t0)) * W, H - 3 - ((r[col] - lo) / Math.max(1, hi - lo)) * (H - 6)]);
  return `<svg class="mks-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="M${xy.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join('L')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function lineChart(el, { series, col, color, label, markers = [] }) {
  const pts = series.filter((r) => r[col] != null).map((r) => ({ d: r[0], v: r[col] }));
  if (!pts.length) { el.innerHTML = '<p class="muted small">Ainda não há números. Carrega em Atualizar (ou mete-os à mão).</p>'; return; }
  const W = Math.max(320, el.clientWidth || 640), H = 220, L = 52, R = 12, T = 14, B = 26;
  const t = (d) => new Date(d + 'T12:00:00').getTime();
  let t0 = t(pts[0].d), t1 = t(pts[pts.length - 1].d); if (t1 - t0 < 86400e3 * 6) { t0 -= 86400e3 * 3; t1 += 86400e3 * 3; }
  const vs = pts.map((p) => p.v); let lo = Math.min(...vs), hi = Math.max(...vs); if (hi === lo) { lo = Math.max(0, lo - 1); hi += 1; } const padv = (hi - lo) * 0.12; lo = Math.max(0, lo - padv); hi += padv;
  const X = (d) => L + ((t(d) - t0) / (t1 - t0)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const nice = (v) => { if (!v) return 0; const m = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1); return Math.round(v / m) * m; };
  const ticks = [lo, (lo + hi) / 2, hi].map(nice);
  const marks = markers.filter((m) => m.date && t(m.date) >= t0 && t(m.date) <= t1);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('');
  const months = []; { const d = new Date(t0); d.setDate(1); d.setMonth(d.getMonth() + 1); for (; d.getTime() <= t1; d.setMonth(d.getMonth() + 1)) months.push(isoD(d)); }
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  el.innerHTML = `<div class="mks-chart"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(label)}">
      ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="mks-grid"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" class="mks-ax">${big(Math.round(v))}</text>`).join('')}
      ${(months.length > 8 ? months.filter((_, i) => i % Math.ceil(months.length / 8) === 0) : months).map((d) => `<text x="${X(d)}" y="${H - 6}" text-anchor="middle" class="mks-ax">${MES[+d.slice(5, 7) - 1]}</text>`).join('')}
      ${marks.map((m) => `<line x1="${X(m.date)}" x2="${X(m.date)}" y1="${T}" y2="${H - B}" class="mks-mark" style="stroke:${m.color}"/><circle cx="${X(m.date)}" cy="${T + 3}" r="3.5" fill="${m.color}"/>`).join('')}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.length === 1 ? `<circle cx="${X(pts[0].d)}" cy="${Y(pts[0].v)}" r="4" fill="${color}"/>` : ''}
      <line class="mks-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" hidden/><circle class="mks-dot" r="4.5" fill="${color}" stroke="var(--panel)" stroke-width="2" hidden/>
    </svg><div class="mks-tip" hidden></div></div>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('.mks-tip'), cross = el.querySelector('.mks-cross'), dot = el.querySelector('.mks-dot');
  const show = (e) => {
    const r = svg.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W;
    let best = pts[0]; pts.forEach((p) => { if (Math.abs(X(p.d) - x) < Math.abs(X(best.d) - x)) best = p; });
    const near = marks.filter((m) => Math.abs(X(m.date) - x) < 8);
    cross.hidden = false; dot.hidden = false; cross.setAttribute('x1', X(best.d)); cross.setAttribute('x2', X(best.d)); dot.setAttribute('cx', X(best.d)); dot.setAttribute('cy', Y(best.v));
    tip.hidden = false; tip.innerHTML = `<b>${nf.format(best.v)}</b> ${esc(label.toLowerCase())}<br><span class="muted">${fmtDate(best.d)}</span>${near.map((m) => `<div class="mks-tipm"><i style="background:${m.color}"></i>${esc(m.label)} · ${fmtDate(m.date)}</div>`).join('')}`;
    const px = (X(best.d) / W) * r.width; tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, Math.max(4, px + 12))}px`; tip.style.top = `${(Y(best.v) / H) * r.height - 10}px`;
  };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.hidden = true; dot.hidden = true; });
}

// ---------- página Estatísticas (no Marketing) ----------
// D = dados do Marketing (items, kids…); base = endereço do projeto
export async function statsView(box, p, D, base) {
  const ids = [p.id, ...(D.kids || []).map((k) => k.id)];
  const ui = { pl: '', acc: null };
  box.innerHTML = '<p class="muted">A carregar as estatísticas…</p>';
  let [S, st] = await Promise.all([load(ids), status()]);
  const itemOf = (id) => D.items.find((x) => x.id === id);
  const markers = D.items.filter((i) => i.date).map((i) => ({ date: i.date, label: i.title, color: { lancamento: '#E5484D', videoclipe: '#7C5CFF', visualizer: '#9B6CFF', teaser: '#F08A24' }[i.kind] || '#8A8A99' }));
  const reload = async () => { S = await load(ids); draw(); };
  // leitura ao abrir (no máximo uma vez a cada 3 horas por publicação, o servidor decide)
  callFn('mk-stats', { action: 'refresh', project_ids: ids }).then((r) => { if (r?.updated) reload(); }).catch(() => {});

  const draw = () => {
    const staff = isStaff();
    const posts = S.posts.filter((x) => !ui.pl || x.platform === ui.pl);
    const views = (x) => lastOf(x.series, 1)?.[1] ?? null;
    posts.sort((a, b) => (views(b) ?? -1) - (views(a) ?? -1));
    const clicksOfItem = (iid) => S.links.filter((l) => l.item_id && l.item_id === iid).reduce((s, l) => s + (l.clicks || 0), 0);
    const tot = (col) => S.posts.reduce((s, x) => s + (lastOf(x.series, col)?.[col] || 0), 0);
    const totClicks = S.links.reduce((s, l) => s + (l.clicks || 0), 0);
    const plats = [...new Set(S.posts.map((x) => x.platform))];
    if (!ui.acc || !S.accounts.some((a) => a.id === ui.acc)) ui.acc = S.accounts[0]?.id || null;
    const acc = S.accounts.find((a) => a.id === ui.acc);
    box.innerHTML = `<div class="mks">
      ${staff ? `<form class="mks-paste" data-paste><span class="mks-pi">${ICON.link || ICON.plus}</span><input name="u" type="url" placeholder="Cola o link de uma publicação ou de uma rede do artista (YouTube, TikTok, Instagram, Spotify)" aria-label="Link" required><button class="btn primary">Juntar</button></form>` : ''}
      <div class="mks-bar"><span class="muted small">YouTube, TikTok e Spotify: números públicos, lidos sozinhos todos os dias e sempre que carregas em Atualizar. Instagram: ${st.instagram ? 'também, pela ligação da Meta.' : 'à mão em "Números" (o Instagram não deixa ler sem conta).'}</span>
        <span class="row">${staff ? `<button type="button" class="btn ghost sm" data-cfg>${ICON.settings || ICON.dots} Ligações</button>` : ''}<button type="button" class="btn primary sm" data-now>${ICON.refresh || '↻'} Atualizar</button></span></div>
      <div class="mks-kpis">
        <div class="mks-kpi"><span>Views</span><strong>${big(tot(1))}</strong><small>todas as publicações</small></div>
        <div class="mks-kpi"><span>Likes</span><strong>${big(tot(2))}</strong><small>${big(tot(3))} comentários</small></div>
        <div class="mks-kpi"><span>Clicks</span><strong>${big(totClicks)}</strong><small>nos links próprios</small></div>
        <div class="mks-kpi"><span>Publicações</span><strong>${S.posts.length}</strong><small>${plats.map(plName).join(' · ') || 'nenhuma ainda'}</small></div>
      </div>
      <section class="panel mks-sec"><div class="row between wrap-gap"><h2 class="h3">Redes do artista</h2>${staff ? `<button type="button" class="link-btn small" data-addacc>${ICON.plus} Juntar rede</button>` : ''}</div>
        ${S.accounts.length ? `<div class="mks-accs">${S.accounts.map((a) => { const c = mainCol(a); const l = lastOf(a.series, c); const d7 = delta(a.series, c, 7), d30 = delta(a.series, c, 30); return `<button type="button" class="mks-acc ${a.id === ui.acc ? 'on' : ''}" data-acc="${a.id}" style="--pl:${plColor(a.platform)}">
            <span class="mks-plb">${esc(plName(a.platform))}</span><span class="mks-h">${esc(a.title || a.handle)}</span>
            <strong>${l ? big(l[c]) : '—'}</strong><small>${mainLabel(a)}${l ? ` · ${fmtDate(l[0])}` : ''}</small>
            <span class="mks-dd">${d7 != null ? `${sign(d7)} 7 dias` : ''}${d30 != null ? ` ${sign(d30)} 30 dias` : ''}</span>${spark(a.series, c, plColor(a.platform))}</button>`; }).join('')}</div>
          ${acc ? `<div class="mks-accd"><div class="row between wrap-gap"><strong>${esc(acc.title || acc.handle)} <span class="muted small">${esc(plName(acc.platform))}${acc.url ? ` · <a href="${esc(acc.url)}" target="_blank" rel="noopener">abrir</a>` : ''}</span></strong>
            <span class="row">${staff ? `${auto(acc.platform, st, acc.url) ? `<button type="button" class="btn ghost sm" data-accnow="${acc.id}">${ICON.refresh || '↻'} Atualizar</button><button type="button" class="link-btn small" data-accnum="${acc.id}">Meter à mão</button>` : `<button type="button" class="btn ghost sm" data-accnum="${acc.id}">Meter números</button>`}<button type="button" class="icon-btn sm" data-accrm="${acc.id}" title="Tirar esta rede" aria-label="Tirar esta rede">${ICON.trash}</button>` : ''}</span></div>
            <div data-chart></div><p class="muted small mks-leg">As linhas verticais são os lançamentos do calendário (passa o rato para ver).</p></div>` : ''}`
          : '<p class="muted small">Junta as redes do artista (cola o link do canal de YouTube, do TikTok, do Instagram ou do Spotify) para ver como crescem.</p>'}
      </section>
      <section class="panel mks-sec"><div class="row between wrap-gap"><h2 class="h3">Publicações</h2>
          ${plats.length > 1 ? `<div class="seg" role="tablist">${[['', 'Todas'], ...plats.map((k) => [k, plName(k)])].map(([k, l]) => `<button type="button" role="tab" aria-selected="${ui.pl === k}" data-pl="${k}">${esc(l)}</button>`).join('')}</div>` : ''}</div>
        ${posts.length ? `<div class="table-wrap"><table class="table mks-t"><thead><tr><th>Publicação</th><th>Peça</th><th class="num">Views</th><th class="num">Likes</th><th class="num">Coment.</th><th class="num">Partilhas</th><th class="num">Clicks</th><th>Atualizado</th><th><span class="vh">Ações</span></th></tr></thead><tbody>
          ${posts.map((x, i) => { const l = latest(x.series); const it = itemOf(x.item_id); const d7 = delta(x.series, 1, 7); const ck = x.item_id ? clicksOfItem(x.item_id) : 0;
            return `<tr><td><div class="mks-post"><span class="mks-rank">${i + 1}</span>${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="mks-noimg" style="--pl:${plColor(x.platform)}">${esc(plName(x.platform)[0])}</span>`}<span><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</a><small class="muted"><i class="mks-pdot" style="background:${plColor(x.platform)}"></i>${esc(plName(x.platform))}${x.published_on ? ` · ${fmtDate(x.published_on)}` : ''}</small></span></div></td>
              <td>${it ? `<a href="${it.linked_project_id ? `#/p/${it.linked_project_id}` : `${base}/marketing/${it.id}`}">${esc(it.title)}</a>` : '<span class="muted">—</span>'}</td>
              <td class="num"><b>${big(l?.[1])}</b>${d7 ? `<br>${sign(d7)} <small class="muted">7 d</small>` : ''}</td><td class="num">${big(l?.[2])}</td><td class="num">${big(l?.[3])}</td><td class="num">${big(l?.[4])}</td><td class="num">${ck ? big(ck) : '—'}</td>
              <td><small class="muted">${l ? `${fmtDate(l[0])}${l[5] === 'auto' ? ' · auto' : ''}` : 'sem números'}</small></td>
              <td class="mks-acts">${staff ? `<button type="button" class="btn ghost sm" data-pnum="${x.id}">Números</button><button type="button" class="icon-btn sm" data-prm="${x.id}" title="Tirar" aria-label="Tirar esta publicação">${ICON.trash}</button>` : ''}</td></tr>`; }).join('')}
          </tbody></table></div>` : '<p class="muted small">Cola em cima o link de cada videoclipe, TikTok, reel ou faixa quando for publicado. Os números vão ficando guardados dia a dia.</p>'}
      </section>
      <section class="panel mks-sec"><div class="row between wrap-gap"><h2 class="h3">Links com contagem de clicks</h2>${staff ? `<button type="button" class="link-btn small" data-addlink>${ICON.plus} Novo link</button>` : ''}</div>
        <p class="muted small">Põe estes links na bio, nas stories ou nos posts: cada click fica contado e sabes que peça trouxe mais gente.</p>
        ${S.links.length ? `<ul class="mks-links">${S.links.map((l) => { const d7 = (l.series || []).filter((r) => r[0] > daysAgo(7)).reduce((s, r) => s + r[1], 0); const it = itemOf(l.item_id); return `<li>
            <span class="mks-ll"><b>${esc(l.label || l.slug)}</b><small class="muted">${esc(SHORT + l.slug)} → ${esc(l.target.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50))}${it ? ` · ${esc(it.title)}` : ''}</small></span>
            ${spark((l.series || []).map((r) => [r[0], r[1]]), 1, 'var(--blue)')}
            <span class="mks-lc"><b>${big(l.clicks || 0)}</b><small class="muted">${d7 ? `+${d7} esta semana` : 'clicks'}</small></span>
            <span class="row"><button type="button" class="btn ghost sm" data-lcopy="${esc(l.slug)}">${ICON.copy} Copiar</button>${staff ? `<button type="button" class="icon-btn sm" data-lrm="${l.id}" aria-label="Apagar o link">${ICON.trash}</button>` : ''}</span></li>`; }).join('')}</ul>` : ''}
      </section></div>`;
    if (acc) { const lb = mainLabel(acc); lineChart(box.querySelector('[data-chart]'), { series: acc.series, col: mainCol(acc), color: plColor(acc.platform), label: lb.charAt(0).toUpperCase() + lb.slice(1), markers }); }
    bind();
  };

  const bind = () => {
    box.querySelector('[data-paste]')?.addEventListener('submit', async (e) => { e.preventDefault(); const inp = e.target.u; const ok = await addLink(p, D, inp.value, null, st); if (ok) { inp.value = ''; reload(); } });
    box.querySelector('[data-cfg]')?.addEventListener('click', () => connections(async (s2) => { st = s2; stCache = s2; await readNow(ids).catch(() => {}); reload(); }));
    box.querySelector('[data-now]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.classList.add('busy'); toast('A ler os números de agora…', 8000);
      try { const r = await readNow(ids); toast(readMsg(r), 6000); } catch (er) { toast(er.message || String(er)); }
      reload();
    });
    box.querySelector('[data-accnow]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.classList.add('busy');
      try { const r = await readNow(ids, { account_ids: [b.dataset.accnow], post_ids: [] }); toast(readMsg(r), 6000); } catch (er) { toast(er.message || String(er)); }
      reload();
    });
    box.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => { ui.acc = b.dataset.acc; draw(); }));
    box.querySelectorAll('[data-pl]').forEach((b) => b.addEventListener('click', () => { ui.pl = b.dataset.pl; draw(); }));
    box.querySelector('[data-addacc]')?.addEventListener('click', () => addAccount(p, reload));
    box.querySelector('[data-accnum]')?.addEventListener('click', (e) => numbers(S.accounts.find((a) => a.id === e.currentTarget.dataset.accnum), 'account', reload));
    box.querySelector('[data-accrm]')?.addEventListener('click', async (e) => { const a = S.accounts.find((x) => x.id === e.currentTarget.dataset.accrm); if (!(await confirmBox(`Tirar ${a.title || a.handle} (${plName(a.platform)})? Os números guardados desta rede também saem.`, 'Tirar'))) return; const { error } = await sb.from('mk_accounts').delete().eq('id', a.id); if (error) return toast(error.message); reload(); });
    box.querySelectorAll('[data-pnum]').forEach((b) => b.addEventListener('click', () => numbers(S.posts.find((x) => x.id === b.dataset.pnum), 'post', reload)));
    box.querySelectorAll('[data-prm]').forEach((b) => b.addEventListener('click', async () => { const x = S.posts.find((y) => y.id === b.dataset.prm); if (!(await confirmBox(`Tirar "${x.title || x.url}" das estatísticas? Os números guardados dela também saem.`, 'Tirar'))) return; const { error } = await sb.from('mk_posts').delete().eq('id', x.id); if (error) return toast(error.message); reload(); }));
    box.querySelector('[data-addlink]')?.addEventListener('click', () => newLink(p, D, null, reload));
    box.querySelectorAll('[data-lcopy]').forEach((b) => b.addEventListener('click', () => copyLink(b.dataset.lcopy)));
    box.querySelectorAll('[data-lrm]').forEach((b) => b.addEventListener('click', async () => { const l = S.links.find((x) => x.id === b.dataset.lrm); if (!(await confirmBox(`Apagar o link ${SHORT}${l.slug}? Deixa de funcionar onde estiver posto e os clicks contados saem.`, 'Apagar'))) return; const { error } = await sb.from('mk_links').delete().eq('id', l.id); if (error) return toast(error.message); reload(); }));
  };
  draw();
}

// ---------- secção na página de uma peça (TikTok, teaser…): as publicações e os links dela ----------
export async function itemStats(box, p, it, base) {
  const [S, st] = await Promise.all([load([it.project_id]), status()]);
  const posts = S.posts.filter((x) => x.item_id === it.id), links = S.links.filter((l) => l.item_id === it.id);
  const D = { items: [it], kids: [] };
  const staff = isStaff();
  box.innerHTML = `<div class="row between wrap-gap"><h2 class="h3">Publicações e números</h2><a class="small" href="${base}/marketing/?stats">Todas as estatísticas</a></div>
    ${staff ? `<form class="mks-paste sm" data-paste><input name="u" type="url" placeholder="Cola aqui o link quando for publicado" aria-label="Link" required><button class="btn ghost sm">Juntar</button></form>` : ''}
    ${posts.length ? `<ul class="mks-ipl">${posts.map((x) => { const l = latest(x.series); return `<li><i class="mks-pdot" style="background:${plColor(x.platform)}"></i><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || plName(x.platform))}</a>
      <span class="mks-ipn"><b>${big(l?.[1])}</b> views · ${big(l?.[2])} likes${l ? ` <small class="muted">${fmtDate(l[0])}</small>` : ''}</span>${spark(x.series, 1, plColor(x.platform))}${staff ? `<button type="button" class="btn ghost sm" data-pnum="${x.id}">Números</button>` : ''}</li>`; }).join('')}</ul>` : '<p class="muted small">Quando for publicado, cola o link: os números vão ficando guardados.</p>'}
    ${links.length ? `<ul class="mks-links sm">${links.map((l) => `<li><span class="mks-ll"><b>${esc(l.label || l.slug)}</b><small class="muted">${esc(SHORT + l.slug)}</small></span><span class="mks-lc"><b>${big(l.clicks || 0)}</b><small class="muted">clicks</small></span><button type="button" class="btn ghost sm" data-lcopy="${esc(l.slug)}">${ICON.copy} Copiar</button></li>`).join('')}</ul>` : ''}
    ${staff ? `<button type="button" class="link-btn small" data-addlink>${ICON.plus} Link com contagem de clicks para esta peça</button>` : ''}`;
  const again = () => itemStats(box, p, it, base);
  box.querySelector('[data-paste]')?.addEventListener('submit', async (e) => { e.preventDefault(); if (await addLink(p, D, e.target.u.value, it.id, st)) again(); });
  box.querySelectorAll('[data-pnum]').forEach((b) => b.addEventListener('click', () => numbers(posts.find((x) => x.id === b.dataset.pnum), 'post', again)));
  box.querySelectorAll('[data-lcopy]').forEach((b) => b.addEventListener('click', () => copyLink(b.dataset.lcopy)));
  box.querySelector('[data-addlink]')?.addEventListener('click', () => newLink(p, D, it.id, again));
}

// ---------- juntar um link (publicação ou rede) ----------
// resumo de uma leitura, para o aviso
function readMsg(r) {
  if (!r) return 'Sem resposta.';
  const parts = [r.updated ? `${r.updated} ${r.updated === 1 ? 'número atualizado' : 'números atualizados'}` : 'Nada para atualizar'];
  if (r.missed) parts.push(`${r.missed} não ${r.missed === 1 ? 'deixou' : 'deixaram'} ler agora (tenta daqui a pouco ou mete à mão)`);
  if (r.errors?.length) parts.push(r.errors.join(' · '));
  return parts.join(' · ') + '.';
}
async function addLink(p, D, raw, itemId, st) {
  const url = String(raw || '').trim(); if (!url) return false;
  let m;
  try { m = await callFn('mk-stats', { action: 'meta', url }); } catch (e) { toast(e.message || String(e)); return false; }
  if (m.kind === 'account') return addAccountRow(p, m);
  return new Promise((resolve) => {
    const isAuto = auto(m.platform, st, m.url);
    const dlg = modal(`<h2>Juntar publicação</h2>
      <div class="mks-prev">${m.thumb ? `<img src="${esc(m.thumb)}" alt="" referrerpolicy="no-referrer">` : ''}<div><span class="mks-plb" style="--pl:${plColor(m.platform)}">${esc(plName(m.platform))}</span><b>${esc(m.title || m.url)}</b>${m.author ? `<small class="muted">${esc(m.author)}</small>` : ''}</div></div>
      <form class="stack" data-f>
        <div class="grid2"><div class="field"><label for="mkp-i">Peça do calendário</label><select id="mkp-i" name="item"><option value="">— nenhuma —</option>${D.items.map((i) => `<option value="${i.id}" ${i.id === itemId ? 'selected' : ''}>${esc(i.title)}${i.date ? ` · ${fmtDate(i.date)}` : ''}</option>`).join('')}</select></div>
          <div class="field"><label for="mkp-d">Publicado a</label><input id="mkp-d" type="date" name="pub" value="${esc(m.published_on || today())}"></div></div>
        ${isAuto ? '<p class="muted small">Os números públicos desta publicação são lidos já ao juntar, e depois todos os dias e sempre que carregas em Atualizar.</p>' : `<fieldset class="mks-nums"><legend>Números de hoje (opcional)</legend>${[['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comentários'], ['shares', 'Partilhas']].map(([k, l]) => `<label class="field"><span class="label">${l}</span><input type="number" min="0" inputmode="numeric" name="${k}"></label>`).join('')}</fieldset><p class="muted small">${m.platform === 'instagram' ? 'O Instagram não deixa ler os números sem conta: copia-os da app' : `${esc(plName(m.platform))} não mostra estes números publicamente: vai-os metendo aqui`} (por exemplo, uma vez por semana).</p>`}
        <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div></form>`, { onClose: () => resolve(done) });
    let done = false;
    dlg.el.querySelector('[data-f]').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const item = D.items.find((i) => i.id === f.get('item'));
      const { data: post, error } = await sb.from('mk_posts').insert({ project_id: item?.project_id || p.id, item_id: item?.id || null, platform: m.platform, url: m.url, ext_id: m.ext_id || null, title: m.title, thumb: m.thumb, author: m.author || m.handle || null, published_on: f.get('pub') || null }).select().single();
      if (error) return toast(error.message);
      const nums = Object.fromEntries(['views', 'likes', 'comments', 'shares'].map((k) => [k, f.get(k) === '' || f.get(k) == null ? null : Number(f.get(k))]));
      if (Object.values(nums).some((v) => v != null)) await sb.from('mk_stats').insert({ project_id: post.project_id, post_id: post.id, ...nums, source: 'manual' });
      let msg = 'Publicação juntada.';
      if (isAuto) {
        e.submitter && (e.submitter.disabled = true); toast('A ler os números…', 8000);
        const r = await readNow([post.project_id], { post_ids: [post.id], account_ids: [] }).catch(() => null);
        const g = r?.got?.[post.id];
        msg = g ? `Publicação juntada: ${g.views != null ? `${big(g.views)} views` : ''}${g.views != null && g.likes != null ? ' · ' : ''}${g.likes != null ? `${big(g.likes)} likes` : ''}.` : 'Publicação juntada. Os números não vieram agora: tenta Atualizar daqui a pouco.';
      }
      done = true; toast(msg, 6000); dlg.close();
    });
  });
}
async function addAccountRow(p, m) {
  const { data: acc, error } = await sb.from('mk_accounts').insert({ project_id: p.id, platform: m.platform, handle: m.handle || m.ext_id || m.url, url: m.url, ext_id: (m.platform === 'youtube' && /^UC/.test(m.ext_id || '')) || m.platform === 'spotify' ? m.ext_id || null : null }).select().single();
  if (error) { toast(error.message); return false; }
  const st = await status();
  if (!auto(m.platform, st, m.url)) { toast(`${plName(m.platform)} do artista juntado. ${m.platform === 'instagram' ? 'O Instagram não deixa ler sem conta: mete' : 'Mete'} os seguidores de hoje em "Meter números".`, 6000); return true; }
  // lê já os números de hoje, para aparecerem logo
  toast(`A ler os números de ${plName(m.platform)}…`, 8000);
  const r = await readNow([p.id], { account_ids: [acc.id], post_ids: [] }).catch(() => null);
  const g = r?.got?.[acc.id];
  const v = g ? (m.platform === 'spotify' && g.views != null ? `${big(g.views)} ouvintes mensais` : g.followers != null ? `${big(g.followers)} ${m.platform === 'youtube' ? 'subscritores' : 'seguidores'}` : null) : null;
  toast(v ? `${plName(m.platform)} do artista juntado: ${v}.` : `${plName(m.platform)} do artista juntado. Os números não vieram agora: tenta Atualizar daqui a pouco.`, 6000);
  return true;
}
function addAccount(p, after) {
  const dlg = modal(`<h2>Juntar rede do artista</h2><form class="stack" data-f>
      <div class="field"><label for="mka-u">Link do perfil ou do canal</label><input id="mka-u" name="u" type="url" required placeholder="https://www.tiktok.com/@artista · https://youtube.com/@artista · https://instagram.com/artista"></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div></form>`);
  dlg.el.querySelector('[data-f]').addEventListener('submit', async (e) => {
    e.preventDefault();
    let m; try { m = await callFn('mk-stats', { action: 'meta', url: e.target.u.value }); } catch (er) { return toast(er.message || String(er)); }
    if (m.kind !== 'account') return toast('Isso é o link de uma publicação. Aqui vai o link do perfil (ex.: tiktok.com/@artista).');
    if (await addAccountRow(p, m)) { dlg.close(); after(); }
  });
}

// ---------- números à mão ----------
function numbers(x, kind, after) {
  if (!x) return;
  const fields = kind === 'account' ? [['followers', x.platform === 'youtube' ? 'Subscritores' : 'Seguidores'], ['views', x.platform === 'spotify' ? 'Ouvintes mensais' : 'Views totais (opcional)']] : [['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comentários'], ['shares', 'Partilhas'], ['saves', 'Guardados']];
  const last = (col) => lastOf(x.series || [], col)?.[col];
  const colOf = { followers: 1, views: kind === 'account' ? 2 : 1, likes: 2, comments: 3, shares: 4 };
  const dlg = modal(`<h2>Números de ${esc(x.title || x.handle || plName(x.platform))}</h2><p class="muted small">Copia-os da app (${esc(plName(x.platform))}). Fica guardado com a data, para o gráfico.</p>
    <form class="stack" data-f><div class="grid2">${fields.map(([k, l]) => `<label class="field"><span class="label">${l}</span><input type="number" min="0" inputmode="numeric" name="${k}" placeholder="${last(colOf[k]) != null ? nf.format(last(colOf[k])) : ''}"></label>`).join('')}
      <label class="field"><span class="label">Dia</span><input type="date" name="day" value="${today()}" max="${today()}"></label></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  dlg.el.querySelector('[data-f]').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const row = { project_id: x.project_id, [kind === 'account' ? 'account_id' : 'post_id']: x.id, source: 'manual' };
    fields.forEach(([k]) => { const v = f.get(k); if (v !== '' && v != null) row[k] = Number(v); });
    if (Object.keys(row).length <= 3) return toast('Mete pelo menos um número.');
    const day = f.get('day'); if (day && day !== today()) row.taken_at = `${day}T20:00:00Z`;
    const { error } = await sb.from('mk_stats').insert(row); if (error) return toast(error.message);
    dlg.close(); toast('Guardado.'); after();
  });
}

// ---------- links próprios ----------
function copyLink(slug) {
  const u = `https://${SHORT}${slug}`;
  navigator.clipboard?.writeText(u).then(() => toast(`Copiado: ${u}`), () => toast(u, 8000));
}
function newLink(p, D, itemId, after) {
  const dlg = modal(`<h2>Novo link com contagem de clicks</h2><form class="stack" data-f>
      <div class="field"><label for="mkl-t">Para onde vai</label><input id="mkl-t" name="target" type="url" required placeholder="https://open.spotify.com/… ou o link do videoclipe, da pré-save…"></div>
      <div class="grid2"><div class="field"><label for="mkl-l">Nome (para ti)</label><input id="mkl-l" name="label" placeholder="Ex.: Bio do Instagram — single"></div>
        <div class="field"><label for="mkl-s">Link curto</label><div class="mks-slug"><span class="muted small">${SHORT}</span><input id="mkl-s" name="slug" required pattern="[a-z0-9][a-z0-9\\-]{1,39}" placeholder="single-bio"></div></div></div>
      <div class="field"><label for="mkl-i">Peça do calendário</label><select id="mkl-i" name="item"><option value="">— nenhuma —</option>${D.items.map((i) => `<option value="${i.id}" ${i.id === itemId ? 'selected' : ''}>${esc(i.title)}</option>`).join('')}</select></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar e copiar</button></div></form>`);
  const f = dlg.el.querySelector('[data-f]'); let touched = false;
  f.slug.addEventListener('input', () => { touched = true; });
  f.label.addEventListener('input', () => { if (!touched) f.slug.value = slugify(f.label.value); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const v = Object.fromEntries(new FormData(f));
    let slug = slugify(v.slug); const item = D.items.find((i) => i.id === v.item);
    for (let n = 0; n < 5; n++) {
      const { error } = await sb.from('mk_links').insert({ project_id: item?.project_id || p.id, item_id: item?.id || null, slug, target: v.target.trim(), label: v.label.trim() || null });
      if (!error) { dlg.close(); copyLink(slug); after(); return; }
      if (!/duplicate|unique/i.test(error.message)) return toast(error.message);
      slug = `${slugify(v.slug).slice(0, 32)}-${Math.random().toString(36).slice(2, 5)}`; // esse nome já existe: junta um bocadinho
    }
    toast('Não foi possível criar o link. Experimenta outro nome curto.');
  });
}

// ---------- ligações (opcionais) ----------
function connections(after) {
  status().then((s) => {
    const dlg = modal(`<h2>Ligações</h2>
      <section class="mks-con"><div class="row between"><h3 class="h3">YouTube, TikTok e Spotify</h3><span class="tag ok">Sozinho</span></div>
        <p class="muted small">Não é preciso nada: os números públicos (subscritores e seguidores, views, likes, comentários, partilhas, ouvintes mensais, reproduções das faixas) são lidos das próprias páginas, como qualquer pessoa os vê. As plataformas arredondam alguns (ex.: 46,5 mil subscritores).</p></section>
      <section class="mks-con"><div class="row between"><h3 class="h3">Instagram</h3><span class="tag ${s.instagram ? 'ok' : ''}">${s.instagram ? 'Ligado' : 'À mão'}</span></div>
        <p class="muted small">O Instagram não deixa ler nada sem uma conta com sessão iniciada, por isso os números vão à mão ("Números" em cada publicação, "Meter números" na rede). Se quiseres que também seja automático, dá para ligar uma conta profissional <b>da vossa equipa</b> (não é preciso nada do artista): a Meta deixa essa conta ver os números públicos de outras contas profissionais. Quando quiseres, pede-me e eu guio-te.</p>
        <details><summary class="small">Já tenho os dados da app da Meta</summary><form class="stack" data-ig><input name="uid" placeholder="ID da conta de Instagram da equipa" aria-label="ID da conta de Instagram"><input name="tok" type="password" autocomplete="off" placeholder="Chave de acesso (token)" aria-label="Chave de acesso"><button class="btn ghost sm">Guardar</button></form></details></section>
      <details class="mks-con"><summary class="small">YouTube pela API oficial (opcional)</summary>
        <p class="muted small">Só se as leituras do YouTube começarem a falhar. É uma chave gratuita da própria ferramenta (feita uma vez, numa conta Google vossa), não do artista. Em <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a>: cria um projeto, ativa a "YouTube Data API v3" e cria uma "Chave de API".</p>
        <form class="row" data-yt><input name="k" type="password" autocomplete="off" placeholder="${s.youtube ? 'Chave guardada (cola outra para trocar)' : 'Chave da API'}" aria-label="Chave da API do YouTube"><button class="btn ghost sm">Guardar</button></form>
        ${s.youtube ? '<button type="button" class="link-btn small danger-text" data-ytoff>Tirar a chave</button>' : ''}</details>
      <div class="row end"><button type="button" class="btn ghost" data-close>Fechar</button></div>`, { wide: true });
    const save = async (body) => { try { const r = await callFn('mk-stats', { action: 'config', ...body }); toast('Guardado.'); dlg.close(); after({ public: true, youtube: r.youtube, instagram: r.instagram }); } catch (e) { toast(e.message || String(e), 7000); } };
    dlg.el.querySelector('[data-yt]').addEventListener('submit', (e) => { e.preventDefault(); const k = e.target.k.value.trim(); if (!k) return toast('Cola a chave.'); save({ youtube_key: k }); });
    dlg.el.querySelector('[data-ytoff]')?.addEventListener('click', async () => { if (await confirmBox('Tirar a chave? O YouTube continua a ser lido pela página pública.', 'Tirar')) save({ youtube_key: '' }); });
    dlg.el.querySelector('[data-ig]').addEventListener('submit', (e) => { e.preventDefault(); save({ ig_user_id: e.target.uid.value, ig_token: e.target.tok.value }); });
  });
}
