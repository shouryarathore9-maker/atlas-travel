import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError } from '../utils/httpError.js';

export const AUTH_COOKIE = 'atlas_token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    maxAge: SEVEN_DAYS_MS,
    path: '/',
  };
}

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export async function requireAuth(req, res, next) {
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
  req.user = user;
  next();
}

// Like requireAuth, but an anonymous or expired session just leaves req.user unset.
export async function optionalAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(payload.sub);
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
