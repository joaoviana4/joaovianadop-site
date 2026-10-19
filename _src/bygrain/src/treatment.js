import { sb, BUCKET, esc, toast, ICON, fmtDate, confirmBox } from './lib.js';
import { mountReader } from './scriptview.js';

// Tratamento (documentário, dossiês, apresentações): PDFs com várias páginas, lidos página a página.
// Ficam na tabela scripts com kind = 'tratamento' (o guião da ficção continua a ser kind = 'script').

export async function treatmentPage(main, p, base, cleanup) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const { data } = await sb.from('scripts').select('id, version, filename, file_path, is_current, created_at, body, kind').eq('project_id', p.id).eq('kind', 'tratamento').order('version', { ascending: false });
  const list = data || [];
  const cur = list.find((x) => x.is_current) || list[0];
  main.innerHTML = `
    <div class="row between wrap-gap"><div><h1 class="h1 pm-title">Tratamento</h1><p class="muted">O tratamento do projeto, página a página. Carrega uma versão nova sempre que mudar.</p></div>
      ${list.length ? `<button type="button" class="btn primary" data-up>${ICON.plus} Nova versão</button>` : ''}</div>
    ${list.length ? `<div class="sr-head">
      <label class="sr-ver"><span class="muted small">Versão</span><select data-ver aria-label="Versão do tratamento">${list.map((x) => `<option value="${x.id}" ${x.id === cur.id ? 'selected' : ''}>v${x.version} · ${esc(x.filename || 'PDF')} · ${fmtDate(x.created_at)}${x.is_current ? ' · atual' : ''}</option>`).join('')}</select></label>
      <button type="button" class="btn ghost sm" data-use hidden>Marcar como atual</button>
    </div><div data-reader class="sr-wrap"></div>`
    : `<div class="drop-box tr-empty" data-drop><strong>Carrega o tratamento</strong><p class="muted">Um PDF com as páginas que quiseres: tratamento, nota de intenções, dossiê, pitch.</p><div class="row wrap-gap" style="justify-content:center"><button type="button" class="btn primary" data-up>${ICON.open} Escolher PDF</button></div><p class="muted small">Também podes largar o ficheiro aqui.</p></div>`}`;

  let reader = null;
  cleanup?.(() => reader?.destroy());
  const show = (id) => {
    reader?.destroy();
    const v = list.find((x) => x.id === id); const box = main.querySelector('[data-reader]'); if (!v || !box) return;
    reader = mountReader(box, { version: v, pagesIndex: true });
    const use = main.querySelector('[data-use]'); use.hidden = !!v.is_current; use.dataset.id = v.id;
  };
  if (cur) show(cur.id);
  main.querySelector('[data-ver]')?.addEventListener('change', (e) => show(e.target.value));
  main.querySelector('[data-use]')?.addEventListener('click', async (e) => {
    if (!(await confirmBox('Marcar esta versão como a atual?', 'Marcar'))) return;
    await sb.from('scripts').update({ is_current: false }).eq('project_id', p.id).eq('kind', 'tratamento');
    await sb.from('scripts').update({ is_current: true }).eq('id', e.target.dataset.id);
    treatmentPage(main, p, base, cleanup);
  });

  const upload = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return toast('Escolhe um ficheiro PDF.');
    toast('A carregar o tratamento…', 8000);
    const version = (list[0]?.version || 0) + 1;
    const file_path = `${p.id}/tratamento/v${version}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error: e1 } = await sb.storage.from(BUCKET).upload(file_path, file, { contentType: 'application/pdf' });
    if (e1) return toast('Não foi possível carregar: ' + e1.message);
    await sb.from('scripts').update({ is_current: false }).eq('project_id', p.id).eq('kind', 'tratamento');
    const { error } = await sb.from('scripts').insert({ project_id: p.id, kind: 'tratamento', version, filename: file.name, file_path, body: '', is_current: true });
    if (error) return toast(error.message);
    toast(`Tratamento v${version} carregado.`);
    treatmentPage(main, p, base, cleanup);
  };
  const pick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,application/pdf'; i.onchange = () => upload(i.files[0]); i.click(); };
  main.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', pick));
  const drop = main.querySelector('[data-drop]');
  if (drop) {
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files[0]); });
  }
}
