import jwt from 'jsonwebtoken';
import Sandbox, { SANDBOX_IDLE_MS, SANDBOX_MAX_MS } from '../models/Sandbox.js';
import User from '../models/User.js';
import { endSandbox } from '../services/sandbox.js';
import { runWithContext } from '../utils/context.js';
import { HttpError } from '../utils/httpError.js';

// A sandbox session has its own cookie, used only by /api/sandbox/* routes. The real routes never read
// it, and the sandbox routes never read the real session cookie (architecture.md §14).
export const SANDBOX_COOKIE = 'atlas_sandbox';
const AUDIENCE = 'atlas-sandbox';

export function sandboxCookieOptions() {
  const https = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure: https, sameSite: 'lax', maxAge: SANDBOX_MAX_MS, path: '/api/sandbox' };
}

export function setSandboxCookie(res, sandboxId, userId) {
  res.cookie(SANDBOX_COOKIE, jwt.sign({ sid: String(sandboxId), uid: String(userId) }, process.env.JWT_SECRET, { audience: AUDIENCE, expiresIn: '2h' }), sandboxCookieOptions());
}

export function clearSandboxCookie(res) {
  const { maxAge: _maxAge, ...options } = sandboxCookieOptions();
  res.clearCookie(SANDBOX_COOKIE, options);
}

const ended = () => new HttpError(401, 'Your demo has ended. Start a new one from the footer.', 'SANDBOX_ENDED');

/** Reads the sandbox cookie (or null), without failing. */
export function readSandboxToken(req) {
  const token = req.cookies?.[SANDBOX_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { audience: AUDIENCE });
  } catch {
    return null;
  }
}

/**
 * Loads the visitor's sandbox, ends it if it's idle or past its 2 hours, keeps it alive, and runs the
 * rest of the request inside that sandbox's data scope with the sandbox account as `req.sandboxUser`.
 */
export async function sandboxSession(req, res, next) {
  const payload = readSandboxToken(req);
  if (!payload) throw ended();
  const now = Date.now();
  const sandbox = await Sandbox.findById(payload.sid).lean();
  if (!sandbox || sandbox.expiresAt <= new Date(now) || sandbox.lastSeenAt <= new Date(now - SANDBOX_IDLE_MS)) {
    if (sandbox) await endSandbox(sandbox._id);
    clearSandboxCookie(res);
    throw ended();
  }
  if (now - new Date(sandbox.lastSeenAt).getTime() > 60 * 1000) await Sandbox.updateOne({ _id: sandbox._id }, { $set: { lastSeenAt: new Date(now) } });
  await runWithContext({ sandboxId: sandbox._id, sandboxExpiresAt: sandbox.expiresAt }, async () => {
    const user = await User.findById(payload.uid);
    if (!user) throw ended();
    req.sandbox = sandbox;
    req.sandboxUser = user;
    next();
  });
}
