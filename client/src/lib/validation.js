export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup({ name, email, password, phone }) {
  const errors = {};
  if (!name.trim()) errors.name = 'Enter your name';
  if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address';
  if (password.length < 8) errors.password = 'Use at least 8 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Include at least one letter and one number';
  if (phone && !/^\d{10}$/.test(phone)) errors.phone = 'Enter a 10-digit mobile number';
  return errors;
}

// Traveller/guest details at checkout. Optional fields (special requests) are never required.
export function validateDetails(details) {
  const errors = {};
  details.people.forEach((p, i) => {
    if (p.name.trim().length < 2) errors[`people.${i}.name`] = 'Enter the full name as on ID';
  });
  if (!EMAIL_RE.test(details.email.trim())) errors.email = 'Enter a valid email address';
  if (!/^\d{10}$/.test(details.phone.trim())) errors.phone = 'Enter a 10-digit mobile number';
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
