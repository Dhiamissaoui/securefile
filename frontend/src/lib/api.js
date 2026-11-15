let csrfToken = null;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setCsrfToken(token) {
  csrfToken = token || null;
}

function emitUnauthorized() {
  window.dispatchEvent(new CustomEvent('sf:unauthorized'));
}

export async function api(path, { method = 'GET', body, form, headers = {}, skipAuthEvent = false } = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { ...headers },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (form) opts.body = form;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    opts.headers['X-CSRF-Token'] = csrfToken;
  }

  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Serveur injoignable. Vérifiez que le backend est démarré.');
  }

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const err = payload?.error || {};
    if (res.status === 401 && !skipAuthEvent) emitUnauthorized();
    throw new ApiError(res.status, err.code || 'ERROR', err.message || 'Une erreur est survenue.', err.details);
  }
  return payload;
}

export async function downloadFile(path, fallbackName) {
  const res = await fetch(`/api${path}`, { credentials: 'include' });
  if (!res.ok) {
    let message = 'Téléchargement impossible.';
    try {
      const data = await res.json();
      message = data?.error?.message || message;
    } catch {
      /* ignore */
    }
    if (res.status === 401) emitUnauthorized();
    throw new ApiError(res.status, 'DOWNLOAD', message);
  }
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName || 'fichier';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { name, integrity: res.headers.get('x-integrity-status') };
}
