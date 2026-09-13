const form = document.getElementById('gateForm');
const errorEl = document.getElementById('error');
const submitBtn = document.getElementById('submit');

const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function decrypt(payload, password) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBytes(payload.kdf.salt),
      iterations: payload.kdf.iterations,
      hash: payload.kdf.hash
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.cipher.iv) },
    key,
    b64ToBytes(payload.data)
  );
  return new TextDecoder().decode(plaintext);
}

function fail(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function reveal(html) {
  document.getElementById('gate').hidden = true;
  const article = document.getElementById('content');
  article.innerHTML = html;
  article.hidden = false;
  document.getElementById('backlink').hidden = false;
  sessionStorage.setItem('vantagens_ok', '1');
}

async function unlock(password, { silent = false } = {}) {
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Descriptografando…';
  try {
    const res = await fetch('vantagens.enc.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('fetch');
    const html = await decrypt(await res.json(), password);
    reveal(html);
    sessionStorage.setItem('vantagens_key', password);
  } catch (err) {
    if (!silent) {
      fail(err.message === 'fetch'
        ? 'Não foi possível carregar o conteúdo cifrado.'
        : 'Senha incorreta.');
    }
    sessionStorage.removeItem('vantagens_key');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Abrir';
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  unlock(document.getElementById('password').value);
});

// Reabre sem repetir a senha dentro da mesma aba.
const remembered = sessionStorage.getItem('vantagens_key');
if (remembered) unlock(remembered, { silent: true });
