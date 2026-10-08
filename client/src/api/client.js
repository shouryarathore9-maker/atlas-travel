// The API is always same-origin: Vite proxies /api in development; on Vercel the same
// project serves /api. Relative URLs keep the httpOnly auth cookie first-party.
const BASE_URL = '';

// While a visitor sandbox is active every call goes to /api/sandbox/*, where the server serves the same
// routes scoped to the visitor's private copy. `raw` calls (the sandbox lifecycle itself) never switch.
let sandboxMode = false;
// Until the first session check answers, ordinary calls wait — otherwise a page loaded inside a sandbox
// could fetch real data first.
let markModeKnown;
const modeKnown = new Promise((resolve) => {
  markModeKnown = resolve;
});
export const setSandboxMode = (on) => {
  sandboxMode = Boolean(on);
  markModeKnown();
};
export const isSandboxMode = () => sandboxMode;
const apiRoot = (raw) => `${BASE_URL}${!raw && sandboxMode ? '/api/sandbox' : '/api'}`;

// A sandbox that ended on the server (idle, 2-hour limit) drops the app back to the normal site.
function noticeSandboxEnd(data) {
  if (sandboxMode && data?.error?.code === 'SANDBOX_ENDED') {
    sandboxMode = false;
    window.dispatchEvent(new Event('atlas:sandbox-ended'));
  }
}

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
    await modeKnown;
    res = await fetch(`${apiRoot(false)}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': blob.type }, body: blob });
  } catch {
    throw new ApiError(0, { message: 'We could not reach Atlas. Check your connection and try again.', code: 'NETWORK' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    noticeSandboxEnd(data);
    throw new ApiError(res.status, data.error, data);
  }
  return data;
}

// The server refuses an identical request sent again within seconds (a double-tap) with
// DUPLICATE_SUBMIT. The first request is already being handled and will update the page, so the
// duplicate just never settles — no error message for something that worked.
const never = () => new Promise(() => {});

export async function api(path, { method = 'GET', body, query, signal, raw = false } = {}) {
  let res;
  try {
    if (!raw) await modeKnown;
    res = await fetch(`${apiRoot(raw)}${path}${toQuery(query)}`, {
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
  if (!res.ok) {
    noticeSandboxEnd(data);
    if (data.error?.code === 'DUPLICATE_SUBMIT') return never();
    throw new ApiError(res.status, data.error, data);
  }
  return data;
}
