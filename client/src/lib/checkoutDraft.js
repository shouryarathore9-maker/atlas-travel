// The in-progress booking lives in sessionStorage so it survives the login redirect and a refresh,
// but not a new tab or a closed browser.
const KEY = 'atlas.checkout';

export function saveDraft(draft) {
  const idempotencyKey =
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, idempotencyKey, savedAt: Date.now() }));
  } catch {
    /* storage unavailable — checkout will show its empty state */
  }
}

export function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function updateDraft(patch) {
  const draft = loadDraft();
  if (!draft) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, ...patch }));
  } catch {
    /* ignore */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
