import { esc } from './lib.js';

// Exportar para PDF: monta um documento limpo (fundo branco, tabela com grupos coloridos) e abre a
// janela de impressão do browser, onde se escolhe "Guardar como PDF". Funciona sem bibliotecas extra.
//
// doc = { title, subtitle, landscape, columns: [{ label, width?, align? }], groups: [{ title, color, note, rows: [[...cells]] }], footer: [[label, value]] }

export function exportPdf(doc) {
  const cols = doc.columns;
  const head = `<tr>${cols.map((c) => `<th style="${c.width ? `width:${c.width};` : ''}${c.align ? `text-align:${c.align};` : ''}">${esc(c.label)}</th>`).join('')}</tr>`;
  const body = doc.groups.map((g) => `${g.title != null ? `<tr class="g" style="--c:${esc(g.color || '#333')}"><td colspan="${cols.length}"><b>${esc(g.title || '—')}</b>${g.note ? `<span>${esc(g.note)}</span>` : ''}${g.right ? `<em>${esc(g.right)}</em>` : ''}</td></tr>` : ''}
    ${g.rows.map((r) => `<tr>${r.map((v, i) => `<td style="${cols[i]?.align ? `text-align:${cols[i].align};` : ''}">${esc(v ?? '')}</td>`).join('')}</tr>`).join('')}`).join('');
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
  @page { size: A4 ${doc.landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 10px/1.35 'Helvetica Neue', Arial, sans-serif; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  h1 { font-size: 18px; margin: 0; } .sub { color: #555; font-size: 11px; margin-top: 2px; }
  .brand { font-weight: 800; font-size: 13px; letter-spacing: -.02em; } .brand small { font-weight: 400; color: #777; font-size: 9px; display: block; text-align: right; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #111; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; padding: 6px 6px; text-align: left; }
  td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; word-wrap: break-word; }
  tr { page-break-inside: avoid; }
  tr.g td { background: var(--c); color: #fff; padding: 6px 8px; border: 0; }
  tr.g b { text-transform: uppercase; letter-spacing: .03em; } tr.g span { margin-left: 14px; opacity: .9; } tr.g em { float: right; font-style: normal; font-weight: 700; }
  tfoot td { border: 0; font-weight: 700; padding-top: 8px; }
  .foot { margin-top: 10px; display: flex; gap: 24px; justify-content: flex-end; font-size: 11px; } .foot b { font-size: 13px; }
</style></head><body>
<header><div><h1>${esc(doc.title)}</h1>${doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : ''}</div><div class="brand">byGrain<small>${new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}</small></div></header>
<table><thead>${head}</thead><tbody>${body}</tbody></table>
${doc.footer?.length ? `<div class="foot">${doc.footer.map(([l, v]) => `<span>${esc(l)} <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
</body></html>`;
  const fr = document.createElement('iframe');
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(fr);
  const d = fr.contentWindow.document;
  d.open(); d.write(html); d.close();
  setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 60000); }, 250);
}
