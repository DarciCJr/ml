const REDIRECT_URI = new URL('callback.html', location.href).href;
document.getElementById('redirect').textContent = REDIRECT_URI;

const saved = JSON.parse(localStorage.getItem('ml_cfg') || '{}');
if (saved.clientId) document.getElementById('clientId').value = saved.clientId;
if (saved.site) document.getElementById('site').value = saved.site;
if (saved.pkce === false) document.getElementById('pkce').checked = false;

function randomString(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return base64url(a);
}

function base64url(buf) {
  const bin = String.fromCharCode(...new Uint8Array(buf));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function challenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clientId = document.getElementById('clientId').value.trim();
  const site = document.getElementById('site').value;
  const usePkce = document.getElementById('pkce').checked;

  localStorage.setItem('ml_cfg', JSON.stringify({ clientId, site, pkce: usePkce }));

  const state = randomString(16);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    state
  });

  const session = { clientId, state, redirectUri: REDIRECT_URI };

  if (usePkce) {
    const verifier = randomString(32);
    session.verifier = verifier;
    params.set('code_challenge', await challenge(verifier));
    params.set('code_challenge_method', 'S256');
  }

  sessionStorage.setItem('ml_auth', JSON.stringify(session));
  location.href = `${site}/authorization?${params.toString()}`;
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy');
  if (!btn) return;
  const el = document.querySelector(btn.dataset.copy);
  const text = el.value !== undefined ? el.value : el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = old; }, 1500);
  });
});
