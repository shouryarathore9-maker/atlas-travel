import jwt from 'jsonwebtoken';
import Supplier from '../models/Supplier.js';
import User, { MANAGER_ROLES } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';

export const AUTH_COOKIE = 'atlas_token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Same-origin cookie. `Secure` on Vercel (every deployment is HTTPS; Vercel sets VERCEL=1)
// and in any production run; off for plain-http local development.
export function cookieOptions() {
  const https = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: https,
    sameSite: 'lax',
    maxAge: SEVEN_DAYS_MS,
    path: '/',
  };
}

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export const SUSPENDED_MESSAGE = 'Your organisation’s Atlas account is suspended. Please contact Atlas support.';

// A manager of a suspended supplier is locked out, including sessions that were already open.
export async function managerSuspended(user) {
  if (!MANAGER_ROLES.includes(user?.role) || !user.supplierId) return false;
  const supplier = await Supplier.findById(user.supplierId, { status: 1 }).lean();
  return supplier?.status === 'suspended';
}

function clearSession(res) {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(AUTH_COOKIE, options);
}

export async function requireAuth(req, res, next) {
  // Under /api/sandbox the sandbox session has already identified the (sandbox-only) account.
  if (req.sandboxUser) {
    req.user = req.sandboxUser;
    return next();
  }
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw new HttpError(401, 'Please sign in to continue.', 'UNAUTHENTICATED');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.', 'UNAUTHENTICATED');
  }

  // Re-read the user so deleted accounts and role changes take effect immediately.
  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, 'Please sign in to continue.', 'UNAUTHENTICATED');
  if (await managerSuspended(user)) {
    clearSession(res);
    throw new HttpError(403, SUSPENDED_MESSAGE, 'SUPPLIER_SUSPENDED');
  }
  req.user = user;
  next();
}

// Like requireAuth, but an anonymous or expired session just leaves req.user unset.
export async function optionalAuth(req, res, next) {
  if (req.sandboxUser) {
    req.user = req.sandboxUser;
    return next();
  }
  const token = req.cookies?.[AUTH_COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub);
      if (user && (await managerSuspended(user))) {
        clearSession(res);
        req.user = null;
      } else {
        req.user = user;
      }
    } catch {
      req.user = null;
    }
  }
  next();
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'This area is for administrators only.', 'FORBIDDEN');
  next();
}
