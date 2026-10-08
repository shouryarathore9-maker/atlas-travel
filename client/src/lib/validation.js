export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors server/utils/names.js: letters in any script plus spaces, apostrophes, hyphens and dots.
export const NAME_MAX = 80;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
export function nameError(value, emptyMessage = 'Enter the full name as on ID') {
  const name = value.trim();
  if (!name) return emptyMessage;
  if (name.length < 2) return 'Enter the full name as on ID';
  if (name.length > NAME_MAX) return `Names can be at most ${NAME_MAX} characters`;
  if (!NAME_PATTERN.test(name)) return 'Use letters only — spaces, apostrophes, hyphens and dots are fine';
  return null;
}

export function validateSignup({ name, email, password, phone }) {
  const errors = {};
  const nameProblem = nameError(name, 'Enter your name');
  if (nameProblem) errors.name = nameProblem;
  if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address';
  if (password.length < 8) errors.password = 'Use at least 8 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Include at least one letter and one number';
  if (phone && !/^\d{10}$/.test(phone)) errors.phone = 'Enter a 10-digit mobile number';
  return errors;
}

// First or last name on its own (Phase 2): the same rule, 1–40 characters.
export const NAME_PART_MAX = 40;
export function namePartError(value, label) {
  const name = value.trim();
  if (!name) return `Enter the ${label}`;
  if (name.length > NAME_PART_MAX) return `At most ${NAME_PART_MAX} characters`;
  if (!NAME_PATTERN.test(name)) return 'Use letters only — spaces, apostrophes, hyphens and dots are fine';
  return null;
}

// "  ravi   KUMAR " and "Ravi Kumar" are the same person (mirrors the server's duplicate check).
export const normaliseName = (first, last) => `${first} ${last}`.trim().replace(/\s+/g, ' ').toLowerCase();

// Traveller/guest details at checkout. Optional fields (special requests) are never required.
export function validateDetails(details) {
  const errors = {};
  const seen = new Map();
  details.people.forEach((p, i) => {
    const first = namePartError(p.firstName, 'first name');
    const last = namePartError(p.lastName, 'last name');
    if (first) errors[`people.${i}.firstName`] = first;
    if (last) errors[`people.${i}.lastName`] = last;
    if (!first && !last) {
      const key = normaliseName(p.firstName, p.lastName);
      if (seen.has(key)) errors[`people.${i}.lastName`] = 'Two travellers have the same name. Add a middle name or suffix (e.g. Jr.) to tell them apart.';
      else seen.set(key, i);
    }
  });
  if (!EMAIL_RE.test(details.email.trim())) errors.email = 'Enter a valid email address';
  if (!/^\d{10}$/.test(details.phone.trim())) errors.phone = 'Enter a 10-digit mobile number';
  if ((details.specialRequest || '').length > 500) errors.specialRequest = 'At most 500 characters';
  return errors;
}

// Mirrors server computeRefund(): full refund before the cutoff, otherwise total minus fee.
export function estimateRefund(booking, now = new Date()) {
  const total = booking.fareBreakdown.total;
  const { freeUntil, feeAfterCutoff = 0 } = booking.policySnapshot || {};
  if (freeUntil && now <= new Date(freeUntil)) return total;
  return Math.max(0, total - feeAfterCutoff);
}

export const isCancellable = (b, now = new Date()) => b.status === 'confirmed' && new Date(b.travelDates.start) > now;
