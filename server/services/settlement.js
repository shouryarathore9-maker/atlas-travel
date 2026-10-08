// Monthly settlement (prd.md → Settlement; Workflow 13). The daily job closes the previous IST month
// for every supplier with activity: one frozen statement each, built from bookings that haven't been
// settled yet, plus adjustments from resolved queries. Re-running is safe — a statement is unique per
// supplier and month, and every booking and adjustment is marked with the statement it landed on.
import Adjustment from '../models/Adjustment.js';
import Booking from '../models/Booking.js';
import { getCommissionRate } from '../models/Config.js';
import Statement, { MAX_STATEMENT_LINES } from '../models/Statement.js';
import { IST_OFFSET_MS } from '../utils/dates.js';
import { notifySupplier } from './notify.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 'YYYY-MM' of the IST month containing `now`. */
export function istPeriod(now = Date.now()) {
  return new Date(new Date(now).getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}
export function shiftPeriod(period, months) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}
/** Midnight IST on the 1st of the period. */
export const periodStart = (period) => new Date(Date.parse(`${period}-01T00:00:00Z`) - IST_OFFSET_MS);
export function periodLabel(period) {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// ---------- Lines ----------

// Commission applies to base fare + seats + meals (flights) or room charges + breakfast (hotels).
// Taxes and infant fees pass through to the supplier untouched.
function commissionable(b) {
  const f = b.fareBreakdown;
  return b.type === 'flight' ? f.base + (f.seatCharges || 0) + (f.mealCharges || 0) : f.base + (f.breakfast || 0);
}

const describe = (b) => [b.itemSummary?.title, b.itemSummary?.subtitle].filter(Boolean).join(' · ');
const zero = { discountPlatform: 0, discountSupplier: 0, refunds: 0, commission: 0, net: 0, atlasTake: 0 };

/** The statement line for one booking at a commission rate (null if it has nothing to settle). */
export function bookingLine(b, rate) {
  const f = b.fareBreakdown;
  const base = { bookingId: b._id, bookingReference: b.bookingReference, description: describe(b), funder: b.offer?.funder || null };

  if (b.status === 'confirmed') {
    const discount = f.discounts || 0;
    const gross = f.total + discount; // what the trip cost before the offer
    const c = commissionable(b);
    if (discount && b.offer?.funder === 'supplier') {
      // Supplier-funded: the discount comes off the supplier's side; commission on the discounted amount.
      const commission = Math.round(rate * (c - discount));
      return { ...base, kind: 'completed', date: b.travelDates.end, gross, ...zero, discountSupplier: discount, commission, net: gross - discount - commission, atlasTake: commission };
    }
    // No offer, or platform-funded: the supplier is paid as if there were no offer; Atlas absorbs the discount.
    const commission = Math.round(rate * c);
    return { ...base, kind: 'completed', date: b.travelDates.end, gross, ...zero, discountPlatform: discount, commission, net: gross - commission, atlasTake: commission - discount };
  }

  const cancelled = b.cancellation || {};
  if (cancelled.by === 'supplier') {
    // For information: the traveller was refunded in full and nobody earns anything.
    return { ...base, kind: 'supplier_cancelled', date: cancelled.cancelledAt, gross: f.total, ...zero, refunds: cancelled.refundAmount ?? f.total };
  }
  const fee = cancelled.feeRetained || 0;
  if (fee <= 0) return null;
  // Traveller cancellation with a retained fee: the supplier keeps the fee, commission applies to it.
  const commission = Math.round(rate * fee);
  return { ...base, kind: 'cancellation_fee', date: cancelled.cancelledAt, gross: f.total, ...zero, refunds: cancelled.refundAmount || 0, commission, net: fee - commission, atlasTake: commission };
}

export function adjustmentLine(a) {
  return {
    bookingId: null,
    adjustmentId: a._id,
    bookingReference: a.bookingReference,
    kind: 'adjustment',
    date: a.createdAt,
    description: 'Adjustment from a resolved query',
    funder: null,
    gross: 0,
    ...zero,
    net: a.amount,
    atlasTake: -a.amount,
    note: a.note,
  };
}

export function totalsOf(lines) {
  const sum = (k) => lines.reduce((s, l) => s + (l[k] || 0), 0);
  return {
    lines: lines.length,
    gross: sum('gross'),
    discountPlatform: sum('discountPlatform'),
    discountSupplier: sum('discountSupplier'),
    refunds: sum('refunds'),
    commission: sum('commission'),
    net: sum('net'),
    atlasTake: sum('atlasTake'),
  };
}

// Everything that's due by `cutoff` and not on a statement yet: trips that ended, traveller
// cancellations that kept a fee, and supplier cancellations (shown as zero lines).
export function dueFilter(cutoff) {
  return {
    supplierId: { $ne: null },
    settlement: null,
    $or: [
      { status: 'confirmed', 'travelDates.end': { $lt: cutoff } },
      { status: 'cancelled', 'cancellation.cancelledAt': { $lt: cutoff }, $or: [{ 'cancellation.by': 'supplier' }, { 'cancellation.feeRetained': { $gt: 0 } }] },
    ],
  };
}

const markSettled = (statement, bookingIds, adjustmentIds) =>
  Promise.all([
    bookingIds.length && Booking.updateMany({ _id: { $in: bookingIds }, settlement: null }, { $set: { settlement: { statementId: statement._id, period: statement.period } } }),
    adjustmentIds.length && Adjustment.updateMany({ _id: { $in: adjustmentIds }, statementId: null }, { $set: { statementId: statement._id } }),
  ]);

/**
 * Creates one supplier's statement for `period` (or finishes marking an existing one).
 * @returns the statement, and whether it was created by this call.
 */
export async function buildStatement(supplierId, period, { rate, isSynthetic = false, createdAt = new Date() } = {}) {
  const existing = await Statement.findOne({ supplierId, period }).lean();
  if (existing) {
    // A previous run may have stopped between creating the statement and marking its bookings.
    await markSettled(existing, existing.lines.map((l) => l.bookingId).filter(Boolean), existing.lines.map((l) => l.adjustmentId).filter(Boolean));
    return { statement: existing, created: false };
  }
  const cutoff = periodStart(shiftPeriod(period, 1));
  const [bookings, adjustments] = await Promise.all([
    Booking.find({ ...dueFilter(cutoff), supplierId }).sort({ 'travelDates.end': 1 }).limit(MAX_STATEMENT_LINES).lean(),
    Adjustment.find({ supplierId, statementId: null }).sort({ createdAt: 1 }).lean(),
  ]);
  const bookingLines = bookings.map((b) => bookingLine(b, rate)).filter(Boolean);
  const lines = [...bookingLines, ...adjustments.map(adjustmentLine)];
  if (!lines.length) return { statement: null, created: false };
  lines.sort((a, b) => new Date(a.date) - new Date(b.date));

  let statement;
  try {
    statement = await Statement.create({ supplierId, period, commissionRate: rate, lines, totals: totalsOf(lines), isSynthetic, createdAt });
  } catch (err) {
    if (err.code === 11000) return buildStatement(supplierId, period, { rate, isSynthetic, createdAt }); // a parallel run won
    throw err;
  }
  await markSettled(statement, bookings.map((b) => b._id), adjustments.map((a) => a._id));
  return { statement: statement.toObject(), created: true };
}

/**
 * Daily job step: on or after the 1st (IST), closes the previous month for every supplier with
 * something due. Bookings missed in earlier months (e.g. a month of failed runs) land here too.
 */
export async function closeStatements({ now = Date.now(), notify = true, isSynthetic = false } = {}) {
  const period = shiftPeriod(istPeriod(now), -1);
  const cutoff = periodStart(istPeriod(now));
  const [fromBookings, fromAdjustments] = await Promise.all([
    Booking.distinct('supplierId', dueFilter(cutoff)),
    Adjustment.distinct('supplierId', { statementId: null }),
  ]);
  const supplierIds = [...new Set([...fromBookings, ...fromAdjustments].map(String))];
  if (!supplierIds.length) return { period, created: 0 };
  const rate = await getCommissionRate();
  let created = 0;
  for (const supplierId of supplierIds) {
    const result = await buildStatement(supplierId, period, { rate, isSynthetic, createdAt: new Date(now) });
    if (!result.created) continue;
    created += 1;
    if (notify) {
      await notifySupplier(supplierId, {
        type: 'statement.ready',
        title: `Your ${periodLabel(period)} statement is ready`,
        body: `Net owed to you: ₹${Math.round(result.statement.totals.net).toLocaleString('en-IN')}`,
        link: `/supplier/statements/${result.statement._id}`,
      });
    }
  }
  return { period, created };
}
