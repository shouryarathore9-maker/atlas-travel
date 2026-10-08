// The API is always same-origin: Vite proxies /api in development; on Vercel the same
// project serves /api. Relative URLs keep the httpOnly auth cookie first-party.
const BASE_URL = '';

export class ApiError extends Error {
  constructor(status, { message, code, details } = {}, body = {}) {
    super(message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details || [];
    this.body = body;
  }

  // { "travellers.0.name": "Enter the full name", ... }
  get fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

// Uploads raw bytes (an image) with their content type; same error handling as api().
export async function uploadBlob(path, blob) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': blob.type }, body: blob });
  } catch {
    throw new ApiError(0, { message: 'We could not reach Atlas. Check your connection and try again.', code: 'NETWORK' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error, data);
  return data;
}

export async function api(path, { method = 'GET', body, query, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}${toQuery(query)}`, {
      method,
      signal,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { message: 'We could not reach Atlas. Check your connection and try again.', code: 'NETWORK' });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error, data);
  return data;
}
