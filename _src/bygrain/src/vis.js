import { esc, state, initials } from './lib.js';
import { loadPeople } from './tasks.js';

// "Quem pode ver" de uma ferramenta (boards.visible_to). Vazio = toda a equipa do projeto.
// Quem a criou e quem gere o projeto vê sempre (a base de dados garante isto).
export async function visField(sel = []) {
  const people = (await loadPeople()).filter((x) => x.id !== state.user?.id);
  const some = (sel || []).length > 0;
  return `<fieldset class="vis-f"><legend>Quem pode ver</legend>
    <div class="vis-opts"><label><input type="radio" name="vis" value="all" ${some ? '' : 'checked'}> Toda a equipa</label><label><input type="radio" name="vis" value="some" ${some ? 'checked' : ''}> Só algumas pessoas</label></div>
    <div class="vis-people" data-visppl ${some ? '' : 'hidden'}>
      ${people.length ? people.map((x) => `<label class="vis-p"><input type="checkbox" name="vis_ids" value="${x.id}" ${(sel || []).includes(x.id) ? 'checked' : ''}><span class="avatar sm" style="--c:${esc(x.color || '#888')}">${esc(initials(x.display_name))}</span><span>${esc(x.display_name)}${x.job ? `<small class="muted"> · ${esc(x.job)}</small>` : ''}</span></label>`).join('') : '<p class="muted small">Ainda não há mais ninguém na equipa.</p>'}
      <p class="muted small">Tu e quem gere o projeto veem sempre.</p>
    </div></fieldset>`;
}
export function bindVis(form) {
  const box = form.querySelector('[data-visppl]');
  form.querySelectorAll('[name=vis]').forEach((r) => r.addEventListener('change', () => { box.hidden = form.querySelector('[name=vis]:checked').value !== 'some'; }));
}
// null = toda a equipa
export function readVis(form) {
  if (form.querySelector('[name=vis]:checked')?.value !== 'some') return null;
  const ids = [...form.querySelectorAll('[name=vis_ids]:checked')].map((x) => x.value);
  if (state.user?.id) ids.push(state.user.id);
  return [...new Set(ids)];
}
