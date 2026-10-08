// Platform-owned cancellation templates (prd.md → Cancellation Templates). Fare tiers and hotel rate
// plans pick one; the terms are frozen on each booking, so editing a template only affects future bookings.
import CancellationTemplate from '../models/CancellationTemplate.js';

export const DEFAULT_TEMPLATES = [
  { key: 'F-SAVER', kind: 'flight', name: 'Saver', freeWindow: null, fee: { type: 'flat', amount: 3500 } },
  { key: 'F-FLEX24', kind: 'flight', name: 'Flexible 24h', freeWindow: { unit: 'hours', value: 24 }, fee: { type: 'flat', amount: 1500 } },
  { key: 'F-BIZ6', kind: 'flight', name: 'Business 6h', freeWindow: { unit: 'hours', value: 6 }, fee: { type: 'flat', amount: 1000 } },
  { key: 'H-FREE3', kind: 'hotel', name: 'Free until 3 days', freeWindow: { unit: 'days', value: 3 }, fee: { type: 'oneNight', amount: 0 } },
  { key: 'H-FREE2', kind: 'hotel', name: 'Free until 2 days', freeWindow: { unit: 'days', value: 2 }, fee: { type: 'oneNight', amount: 0 } },
  { key: 'H-FREE1', kind: 'hotel', name: 'Free until 1 day', freeWindow: { unit: 'days', value: 1 }, fee: { type: 'oneNight', amount: 0 } },
  { key: 'H-STRICT', kind: 'hotel', name: 'Strict', freeWindow: null, fee: { type: 'oneNight', amount: 0 } },
  { key: 'H-NONREF', kind: 'hotel', name: 'Non-refundable', freeWindow: null, fee: { type: 'all', amount: 0 } },
];

// Templates in the database win; any missing key falls back to its default (so a fresh database works).
export async function loadTemplates() {
  const stored = await CancellationTemplate.find({}).lean();
  const byKey = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.key, t]));
  for (const t of stored) byKey[t.key] = t;
  return byKey;
}

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function describeTemplate(t) {
  if (!t) return '';
  if (t.fee.type === 'all') return 'Non-refundable.';
  const fee = t.fee.type === 'flat' ? `a ${inr(t.fee.amount)} fee` : 'one night’s charge';
  if (!t.freeWindow) return `No free cancellation — cancelling costs ${fee}.`;
  const unit = t.freeWindow.unit === 'hours' ? 'hour' : 'day';
  const when = t.freeWindow.unit === 'hours' ? 'departure' : 'check-in';
  return `Free cancellation until ${t.freeWindow.value} ${unit}${t.freeWindow.value === 1 ? '' : 's'} before ${when}, then ${fee}.`;
}

export const hasFreeWindow = (t) => Boolean(t?.freeWindow && t.fee.type !== 'all');

/**
 * The terms frozen on a booking.
 * @param start      departure time (flights) or check-in midnight IST (hotels), as a Date
 * @param oneNight   one night's charge for one room (hotels)
 * @param total      the amount actually paid (for non-refundable)
 */
export function policySnapshot(t, { start, oneNight = 0, total }) {
  const windowMs = t.freeWindow ? t.freeWindow.value * (t.freeWindow.unit === 'hours' ? 3600e3 : 24 * 3600e3) : 0;
  const fee = t.fee.type === 'flat' ? t.fee.amount : t.fee.type === 'oneNight' ? oneNight : total;
  return {
    templateKey: t.key,
    templateName: t.name,
    terms: describeTemplate(t),
    freeUntil: windowMs > 0 ? new Date(new Date(start).getTime() - windowMs) : null,
    feeAfterCutoff: fee,
    nonRefundable: t.fee.type === 'all',
  };
}
