const API_BASE = import.meta.env.VITE_API_URL || '/api';

let accessToken = localStorage.getItem('fo_access') || '';
let refreshToken = localStorage.getItem('fo_refresh') || '';

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('fo_access', access);
  localStorage.setItem('fo_refresh', refresh);
}

export function clearTokens() {
  accessToken = '';
  refreshToken = '';
  localStorage.removeItem('fo_access');
  localStorage.removeItem('fo_refresh');
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccess(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      'No se pudo conectar con la API. Arranca el backend con npm run dev:api (puerto 4200) y el front con npm run dev:web (puerto 5180).'
    );
  }
  const isAuthForm = path.startsWith('/auth/login') || path.startsWith('/auth/register');
  if (res.status === 401 && retry && !isAuthForm) {
    const ok = await refreshAccess();
    if (ok) return api<T>(path, options, false);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : data.message || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}
