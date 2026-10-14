import { sb, esc, $, signIn, callFn, authPw, MIN_PW, ICON, LOGO, toast } from './lib.js';

// Ecrãs de entrada: fundo azul, grão, linha de scan. Partilhados pelo Studio e pelas Tasks.
// opts.mobile: versão do telemóvel (só login de membro + recuperar).
export function renderAuth(root, { mobile = false, sub = 'studio', onDone } = {}) {
  const st = { screen: 'login', invite: null, email: '', code: '' };

  const shell = (inner) => `
    <main class="auth ${mobile ? 'auth-mobile' : ''}">
      <div class="grain-layer" aria-hidden="true"></div>
      <div class="scan" aria-hidden="true"></div>
      <div class="vignette" aria-hidden="true"></div>
      <div class="auth-center warp">
        <div class="auth-col">
          <h1 class="auth-logo">${LOGO(sub)}</h1>
          ${inner}
        </div>
      </div>
      <footer class="auth-foot">
        <span>byGrain ${esc(sub)} · acesso reservado</span>
        <span class="serif">criatividade &amp; cultura</span>
      </footer>
    </main>`;

  const tabs = (active) => mobile ? '' : `
    <div class="seg" role="tablist">
      <button type="button" role="tab" aria-selected="${active === 'login'}" data-go="login">Iniciar sessão</button>
      <button type="button" role="tab" aria-selected="${active === 'invite'}" data-go="invite">Tenho um código</button>
    </div>`;

  const pwField = (id, label, auto) => `
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="pw-wrap">
        <input id="${id}" name="${id}" type="password" autocomplete="${auto}" required>
        <button type="button" class="pw-eye" data-eye="${id}" aria-label="Mostrar palavra-passe">${ICON.eye}</button>
      </div>
    </div>`;

  const err = '<div class="auth-err" role="alert" hidden></div>';

  const screens = {
    login: () => `
      <form class="auth-form" data-form="login" novalidate>
        ${tabs('login')}
        ${err}
        <div class="field"><label for="ident">Email ou utilizador</label>
          <input id="ident" name="ident" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="nome@exemplo.com ou utilizador" required></div>
        ${pwField('pw', 'Palavra-passe', 'current-password')}
        <button type="button" class="link-btn right" data-go="recover">Esqueci-me da palavra-passe</button>
        <button class="btn cream big" type="submit">Entrar</button>
        <p class="auth-note">${mobile ? 'Mesma conta do byGrain Studio.' : 'As contas de membro são criadas por um administrador da Grain.'}</p>
      </form>`,
    invite: () => `
      <form class="auth-form" data-form="invite" novalidate>
        ${tabs('invite')}
        <p class="auth-lead">Usa o email para onde foi enviado o convite e o código que recebeste.</p>
        ${err}
        <div class="field"><label for="iemail">Email</label>
          <input id="iemail" name="iemail" type="email" autocomplete="email" value="${esc(st.email)}" placeholder="nome@exemplo.com" required></div>
        <div class="field"><label for="icode">Código de convite</label>
          <input id="icode" name="icode" class="code-input" autocomplete="off" spellcheck="false" maxlength="9" value="${esc(st.code)}" placeholder="XXXX-XXXX" required></div>
        <button class="btn cream big" type="submit">Continuar</button>
        <p class="auth-note">Cada código só pode ser usado uma vez. Se já criaste a tua palavra-passe, usa Iniciar sessão.</p>
      </form>`,
    create: () => `
      <form class="auth-form" data-form="create" novalidate>
        <button type="button" class="link-btn back" data-go="invite">${ICON.back} Voltar</button>
        <div class="auth-ok">
          <span class="pill-ok">${ICON.check} Código válido</span>
          <p>Foste convidado para <strong>${esc(st.invite.project)}</strong>. ${st.invite.has_account ? 'Já tens conta com este email: confirma a tua palavra-passe.' : 'Cria a tua palavra-passe para entrar.'}</p>
          <p class="muted">Conta: ${esc(st.email)}</p>
        </div>
        ${err}
        ${st.invite.has_account ? pwField('pw1', 'A tua palavra-passe', 'current-password') : `
          <div class="field"><label for="dname">O teu nome</label><input id="dname" name="dname" autocomplete="name" required></div>
          ${pwField('pw1', 'Cria uma palavra-passe', 'new-password')}
          <div class="field"><label for="pw2">Repete a palavra-passe</label><input id="pw2" name="pw2" type="password" autocomplete="new-password" required></div>
          <ul class="reqs" aria-label="Requisitos da palavra-passe">
            <li data-req="len">${ICON.circle}<span>Pelo menos ${MIN_PW} caracteres</span></li>
            <li data-req="eq">${ICON.circle}<span>As duas palavras-passe são iguais</span></li>
          </ul>`}
        <button class="btn cream big" type="submit">${st.invite.has_account ? 'Entrar no projeto' : 'Criar conta e entrar'}</button>
        <p class="auth-note">Daqui em diante entras com o teu email e esta palavra-passe.</p>
      </form>`,
    recover: () => `
      <form class="auth-form" data-form="recover" novalidate>
        <button type="button" class="link-btn back" data-go="login">${ICON.back} Voltar ao início de sessão</button>
        <h2 class="auth-h2">Recuperar palavra-passe</h2>
        <p class="auth-lead left">Escreve o email da tua conta. Enviamos-te uma ligação para criares uma palavra-passe nova.</p>
        ${err}
        <div class="field"><label for="remail">Email</label><input id="remail" name="remail" type="email" autocomplete="email" required></div>
        <button class="btn cream big" type="submit">Enviar ligação</button>
        <p class="auth-note">Contas criadas só com nome de utilizador: pede a um administrador para mudar a palavra-passe.</p>
      </form>`,
    sent: () => `
      <div class="auth-form">
        <button type="button" class="link-btn back" data-go="login">${ICON.back} Voltar ao início de sessão</button>
        <div class="auth-msg" role="status">Se existir uma conta com este email, a ligação já vai a caminho. Vê também a pasta de spam.</div>
      </div>`,
    newpw: () => `
      <form class="auth-form" data-form="newpw" novalidate>
        <h2 class="auth-h2">Nova palavra-passe</h2>
        ${err}
        ${pwField('pw1', 'Nova palavra-passe', 'new-password')}
        <button class="btn cream big" type="submit">Guardar e entrar</button>
      </form>`,
  };

  function draw() {
    root.innerHTML = shell(screens[st.screen]());
    bind();
  }
  function showErr(msg) { const e = $('.auth-err', root); if (e) { e.textContent = msg; e.hidden = !msg; } }
  function busy(form, on) { const b = form.querySelector('[type=submit]'); if (b) { b.disabled = on; b.dataset.label ??= b.textContent; b.textContent = on ? 'Um momento…' : b.dataset.label; } }

  function bind() {
    root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { st.screen = b.dataset.go; draw(); }));
    root.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
      const i = $('#' + b.dataset.eye, root); const show = i.type === 'password';
      i.type = show ? 'text' : 'password'; b.setAttribute('aria-label', show ? 'Esconder palavra-passe' : 'Mostrar palavra-passe');
      root.querySelectorAll('#pw2').forEach((x) => (x.type = i.type));
    }));
    const code = $('#icode', root);
    code && code.addEventListener('input', () => {
      let v = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
      code.value = v;
    });
    const p1 = $('#pw1', root), p2 = $('#pw2', root);
    const reqs = () => {
      if (!p2) return;
      const ok = { len: p1.value.length >= MIN_PW, eq: p1.value.length > 0 && p1.value === p2.value };
      root.querySelectorAll('[data-req]').forEach((li) => { const g = ok[li.dataset.req]; li.classList.toggle('ok', g); li.firstElementChild.outerHTML = g ? ICON.check : ICON.circle; });
    };
    p1 && p1.addEventListener('input', reqs); p2 && p2.addEventListener('input', reqs);

    const form = root.querySelector('form');
    form && form.addEventListener('submit', async (e) => {
      e.preventDefault(); showErr('');
      const f = Object.fromEntries(new FormData(form));
      busy(form, true);
      try {
        if (form.dataset.form === 'login') {
          if (!f.ident || !f.pw) throw new Error('Preenche o email ou utilizador e a palavra-passe.');
          await signIn(f.ident, f.pw);
          onDone && onDone();
        } else if (form.dataset.form === 'invite') {
          st.email = String(f.iemail || '').trim().toLowerCase(); st.code = String(f.icode || '').trim().toUpperCase();
          if (!st.email || st.code.length < 9) throw new Error('Preenche o email e o código completo.');
          const { data, error } = await sb.rpc('check_invite', { p_email: st.email, p_code: st.code });
          if (error) throw error;
          if (!data) throw new Error('Este código não é válido ou já foi usado. Pede um novo a quem te convidou.');
          st.invite = data; st.screen = 'create'; draw(); return;
        } else if (form.dataset.form === 'create') {
          if (!st.invite.has_account) {
            if (!f.dname?.trim()) throw new Error('Escreve o teu nome.');
            if (f.pw1.length < MIN_PW) throw new Error(`A palavra-passe precisa de pelo menos ${MIN_PW} caracteres.`);
            if (f.pw1 !== f.pw2) throw new Error('As duas palavras-passe não são iguais.');
          }
          await callFn('redeem-invite', { email: st.email, code: st.code, password: authPw(f.pw1), display_name: f.dname?.trim() });
          await sb.auth.signInWithPassword({ email: st.email, password: authPw(f.pw1) });
          onDone && onDone();
        } else if (form.dataset.form === 'recover') {
          if (!f.remail) throw new Error('Escreve o teu email.');
          await sb.auth.resetPasswordForEmail(String(f.remail).trim(), { redirectTo: location.origin + location.pathname });
          st.screen = 'sent'; draw(); return;
        } else if (form.dataset.form === 'newpw') {
          if (f.pw1.length < MIN_PW) throw new Error(`A palavra-passe precisa de pelo menos ${MIN_PW} caracteres.`);
          const { error } = await sb.auth.updateUser({ password: authPw(f.pw1) });
          if (error) throw error;
          toast('Palavra-passe guardada.');
          onDone && onDone();
        }
      } catch (ex) {
        showErr(ex.message || String(ex));
      } finally { busy(form, false); }
    });
  }

  return {
    show(screen = 'login') { st.screen = screen; draw(); },
  };
}
