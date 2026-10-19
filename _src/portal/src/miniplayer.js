import { sb, esc, ICON, signedUrl } from './lib.js';
import { layout, fmtT } from './music.js';
import { scriptMode } from './modules.js';

// Mini leitor da música (Studio, videoclipes): acompanha-te por todas as páginas do projeto, num cantinho.
// Tocar/pausa, recuar e avançar 5 s, barra com as secções do seguimento (clicar salta para esse momento),
// e numa secção: "Tocar esta secção". Recolhe-se num botão redondo. Ao sair do projeto, pára.

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor" stroke="none"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v4h4"/><text x="12" y="15.2" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">5</text></svg>';
const FWD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4h-4"/><text x="12" y="15.2" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">5</text></svg>';
const TOSEC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14"/><path d="M10 6.5v11l9-5.5z" fill="currentColor" stroke="none"/></svg>';
const KEY = 'portal-mp-min';

let cur = null;

function stop() {
  if (!cur) return;
  cur.audio.pause(); cur.audio.src = ''; cur.el.remove();
  document.removeEventListener('play', cur.onOtherPlay, true);
  window.removeEventListener('hashchange', cur.onHash);
  cur = null;
}

export async function miniPlayer(p, { page, sub, base }) {
  const ok = p && !p.is_central && p.music?.audio_path && !scriptMode(p);
  if (!ok) { if (cur && cur.pid !== p?.id) stop(); else if (cur && !p?.music?.audio_path) stop(); return; }
  if (cur && cur.pid === p.id && cur.path === p.music.audio_path) { cur.context(page, sub, base); return; }
  stop();
  const url = await signedUrl(p.music.audio_path);
  if (!url) return;
  const audio = new Audio(); audio.preload = 'metadata'; audio.src = url;
  const el = document.createElement('div');
  el.className = 'mp';
  let min = true; try { min = localStorage.getItem(KEY) !== '0'; } catch { /* nada */ }
  const st = { scenes: [], L: null, sec: null, base };
  el.innerHTML = `
    <button type="button" class="mp-fab" data-mpopen title="Música: ${esc(p.music.audio_name || 'a música do clipe')}" aria-label="Abrir o leitor da música">${ICON.music}<i class="mp-dot" aria-hidden="true"></i></button>
    <div class="mp-card" role="region" aria-label="Leitor da música">
      <div class="mp-row">
        <button type="button" class="mp-b" data-mpback title="Recuar 5 segundos" aria-label="Recuar 5 segundos">${BACK}</button>
        <button type="button" class="mp-b mp-main" data-mpplay title="Tocar" aria-label="Tocar">${PLAY}</button>
        <button type="button" class="mp-b" data-mpfwd title="Avançar 5 segundos" aria-label="Avançar 5 segundos">${FWD}</button>
        <div class="mp-mid"><div class="mp-top"><span class="mp-sec" data-mpsecname>${esc(p.music.audio_name || 'Música')}</span><span class="mp-time" data-mptime>0:00</span></div>
          <div class="mp-track" data-mptrack role="slider" tabindex="0" aria-label="Posição na música" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="mp-segs" data-mpsegs></div><i class="mp-fill" data-mpfill></i><i class="mp-head" data-mphead></i></div></div>
        <button type="button" class="mp-b" data-mpsec hidden title="Tocar esta secção desde o início" aria-label="Tocar esta secção">${TOSEC}</button>
        <button type="button" class="mp-b sm" data-mpmin title="Recolher" aria-label="Recolher o leitor">${ICON.minus}</button>
      </div>
    </div>`;
  document.body.append(el);
  const $ = (s) => el.querySelector(s);
  const setMin = (v) => { min = v; el.classList.toggle('min', v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* nada */ } };
  setMin(min);
  const total = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : st.L?.total || 0);
  const secAt = (t) => st.L?.items.find((x) => x.a != null && t >= x.a && t < x.b);
  const paint = () => {
    const T = total(), t = audio.currentTime || 0, pc = T ? Math.min(100, t / T * 100) : 0;
    $('[data-mpfill]').style.width = `${pc}%`; $('[data-mphead]').style.left = `${pc}%`;
    $('[data-mptrack]').setAttribute('aria-valuenow', String(Math.round(pc)));
    $('[data-mptime]').textContent = `${fmtT(t)}${T ? ' / ' + fmtT(T) : ''}`;
    const s = secAt(t); $('[data-mpsecname]').textContent = s ? (s.s.heading || 'Secção') : (p.music.audio_name || 'Música');
    const playing = !audio.paused;
    $('[data-mpplay]').innerHTML = playing ? PAUSE : PLAY; $('[data-mpplay]').title = playing ? 'Pausa' : 'Tocar'; $('[data-mpplay]').setAttribute('aria-label', playing ? 'Pausa' : 'Tocar');
    el.classList.toggle('playing', playing);
  };
  const segs = () => {
    const T = total(); const box = $('[data-mpsegs]');
    box.innerHTML = T && st.L ? st.L.items.filter((x) => x.a != null && x.b > x.a).map((x) => `<span style="left:${(x.a / T * 100).toFixed(2)}%;width:${((x.b - x.a) / T * 100).toFixed(2)}%;--c:${esc(x.col)}" title="${esc(x.s.heading || '')} · ${fmtT(x.a)}"></span>`).join('') : '';
  };
  const play = () => { document.querySelectorAll('audio, video').forEach((x) => x !== audio && x.pause()); audio.play().catch(() => {}); };
  $('[data-mpplay]').addEventListener('click', () => (audio.paused ? play() : audio.pause()));
  $('[data-mpback]').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 5); paint(); });
  $('[data-mpfwd]').addEventListener('click', () => { audio.currentTime = Math.min(total() || 1e9, audio.currentTime + 5); paint(); });
  $('[data-mpmin]').addEventListener('click', () => setMin(true));
  $('[data-mpopen]').addEventListener('click', () => setMin(false));
  $('[data-mpsec]').addEventListener('click', () => { if (st.sec?.a == null) return; audio.currentTime = st.sec.a; play(); });
  // barra: clicar ou arrastar para saltar; setas do teclado
  const track = $('[data-mptrack]');
  const seekAt = (x) => { const r = track.getBoundingClientRect(); const T = total(); if (!T) return; audio.currentTime = Math.max(0, Math.min(T, (x - r.left) / r.width * T)); paint(); };
  track.addEventListener('pointerdown', (e) => { seekAt(e.clientX); track.setPointerCapture(e.pointerId); const mv = (ev) => seekAt(ev.clientX); const up = () => { track.removeEventListener('pointermove', mv); track.removeEventListener('pointerup', up); }; track.addEventListener('pointermove', mv); track.addEventListener('pointerup', up); });
  track.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); paint(); e.preventDefault(); } if (e.key === 'ArrowRight') { audio.currentTime += 5; paint(); e.preventDefault(); } if (e.key === ' ') { e.preventDefault(); audio.paused ? play() : audio.pause(); } });
  ['timeupdate', 'play', 'pause', 'ended', 'seeked'].forEach((ev) => audio.addEventListener(ev, paint));
  audio.addEventListener('loadedmetadata', () => { segs(); paint(); });
  // se tocares outro áudio/vídeo na página (o leitor grande do seguimento, o pre-vis…), este pára
  const onOtherPlay = (e) => { if (e.target !== audio && (e.target instanceof HTMLMediaElement)) audio.pause(); };
  document.addEventListener('play', onOtherPlay, true);
  const onHash = () => { if (!location.hash.startsWith(`#/p/${p.id}`)) stop(); };
  window.addEventListener('hashchange', onHash);

  const context = async (page2, sub2, base2) => {
    st.base = base2;
    const { data } = await sb.from('scenes').select('id, heading, starts_at, ends_at, color, position').eq('project_id', p.id).order('position');
    if (cur?.audio !== audio) return;
    st.scenes = data || []; st.L = layout(st.scenes, p.music?.duration);
    st.sec = page2 === 'seguimento' && sub2 ? st.L.items.find((x) => x.s.id === sub2) || null : null;
    const b = $('[data-mpsec]'); b.hidden = !(st.sec && st.sec.a != null);
    if (!b.hidden) b.title = `Tocar «${st.sec.s.heading || 'esta secção'}» desde o início (${fmtT(st.sec.a)})`;
    segs(); paint();
  };
  cur = { pid: p.id, path: p.music.audio_path, el, audio, onOtherPlay, onHash, context };
  context(page, sub, base);
}
