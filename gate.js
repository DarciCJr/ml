// Portão de senha compartilhado.
// O corpo da página é publicado apenas cifrado (AES-256-GCM, chave via PBKDF2).
// Sem a senha não há conteúdo a ler — nem no código-fonte.
(() => {
  const cfg = document.currentScript.dataset;   // data-payload, data-script
  const KEY = 'ml_gate_key';

  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('main');
    main.innerHTML = `
      <section id="gate">
        <h1>Área restrita</h1>
        <p class="lead">Conteúdo criptografado. Informe a senha para descriptografar.</p>
        <form id="gateForm">
          <label>Senha
            <input type="password" id="password" required autocomplete="current-password" autofocus>
          </label>
          <button type="submit" id="submit">Abrir</button>
        </form>
        <div id="gateError" class="box err" hidden></div>
      </section>`;

    const form = document.getElementById('gateForm');
    const errorEl = document.getElementById('gateError');
    const btn = document.getElementById('submit');

    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

    async function decrypt(p, password) {
      const km = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
      );
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: b64(p.kdf.salt), iterations: p.kdf.iterations, hash: p.kdf.hash },
        km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );
      const out = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64(p.cipher.iv) }, key, b64(p.data)
      );
      return new TextDecoder().decode(out);
    }

    function reveal(html) {
      main.innerHTML = html;
      if (cfg.script) {
        const s = document.createElement('script');
        s.src = `${cfg.script}?v=${window.ML_VERSAO || Date.now()}`;
        document.body.appendChild(s);
      }
    }

    async function unlock(password, silent = false) {
      errorEl.hidden = true;
      btn.disabled = true;
      btn.textContent = 'Descriptografando…';
      try {
        const res = await fetch(`${cfg.payload}?v=${window.ML_VERSAO || Date.now()}`,
        { cache: 'no-store' });
        if (!res.ok) throw new Error('fetch');
        const html = await decrypt(await res.json(), password);
        sessionStorage.setItem(KEY, password);
        reveal(html);
      } catch (err) {
        sessionStorage.removeItem(KEY);
        if (!silent) {
          errorEl.textContent = err.message === 'fetch'
            ? 'Não foi possível carregar o conteúdo cifrado.'
            : 'Senha incorreta.';
          errorEl.hidden = false;
        }
        btn.disabled = false;
        btn.textContent = 'Abrir';
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      unlock(document.getElementById('password').value);
    });

    // Senha já informada nesta aba (sobrevive ao redirect do OAuth).
    const remembered = sessionStorage.getItem(KEY);
    if (remembered) unlock(remembered, true);
  });
})();
