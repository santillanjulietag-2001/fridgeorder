const apiUrlEl = document.getElementById('apiUrl');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const captureBtn = document.getElementById('captureBtn');
const loginSection = document.getElementById('loginSection');
const captureSection = document.getElementById('captureSection');
const userLabel = document.getElementById('userLabel');
const preview = document.getElementById('preview');
const statusEl = document.getElementById('status');

let currentProduct = null;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#ff8a80' : '#c4e17a';
}

async function loadSession() {
  const data = await chrome.storage.local.get(['apiUrl', 'accessToken', 'userName']);
  if (data.apiUrl) apiUrlEl.value = data.apiUrl;
  if (data.accessToken) {
    loginSection.hidden = true;
    captureSection.hidden = false;
    userLabel.textContent = `Conectado: ${data.userName || 'usuario'}`;
    await loadPreview();
  }
}

async function login() {
  const apiUrl = apiUrlEl.value.replace(/\/$/, '');
  setStatus('Entrando…');
  try {
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailEl.value, password: passwordEl.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login fallido');
    await chrome.storage.local.set({
      apiUrl,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userName: data.user.name,
    });
    setStatus('Sesión iniciada');
    await loadSession();
  } catch (e) {
    setStatus(String(e.message || e), true);
  }
}

async function logout() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'userName']);
  loginSection.hidden = false;
  captureSection.hidden = true;
  setStatus('Sesión cerrada');
}

async function loadPreview() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PRODUCT' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      preview.textContent = 'No se pudo leer la página. Recarga el tab e inténtalo.';
      currentProduct = null;
      return;
    }
    currentProduct = res.product;
    preview.innerHTML = `<strong>${res.product.title}</strong><br/>${res.product.store} · ${
      res.product.price != null ? res.product.price.toFixed(2) + ' €' : 'sin precio'
    }`;
  });
}

async function capture() {
  if (!currentProduct) {
    await loadPreview();
  }
  if (!currentProduct) {
    setStatus('No hay producto para capturar', true);
    return;
  }
  const { apiUrl, accessToken } = await chrome.storage.local.get(['apiUrl', 'accessToken']);
  setStatus('Enviando…');
  try {
    const res = await fetch(`${apiUrl}/ingest/product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(currentProduct),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al ingerir');
    setStatus(`Añadido: ${data.item.name}`);
  } catch (e) {
    setStatus(String(e.message || e), true);
  }
}

loginBtn.addEventListener('click', login);
logoutBtn.addEventListener('click', logout);
captureBtn.addEventListener('click', capture);
loadSession();
