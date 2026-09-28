import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import { AUTH_COOKIE, cookieOptions, signToken } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('atlas-timing-guard', 10);

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must include a letter')
    .regex(/\d/, 'Password must include a number'),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter a 10-digit mobile number')
    .optional()
    .or(z.literal('')),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(128),
});

function startSession(res, user) {
  res.cookie(AUTH_COOKIE, signToken(user), cookieOptions());
}

export async function register(req, res) {
  const { name, email, password, phone } = req.validated.body;
  if (await User.exists({ email })) {
    throw new HttpError(409, 'An account with this email already exists. Try signing in instead.', 'EMAIL_TAKEN');
  }
  const user = await User.create({ name, email, phone: phone || '', passwordHash: await bcrypt.hash(password, 10) });
  startSession(res, user);
  res.status(201).json({ user: user.toPublic() });
}

export async function login(req, res) {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email });
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
  startSession(res, user);
  res.json({ user: user.toPublic() });
}

export function logout(req, res) {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(AUTH_COOKIE, options);
  res.json({ ok: true });
}

// 200 with user: null when signed out, so the SPA's session check never logs a console error.
export function me(req, res) {
  res.json({ user: req.user ? req.user.toPublic() : null });
}
