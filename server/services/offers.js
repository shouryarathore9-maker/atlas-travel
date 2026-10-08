// Offer rules (prd.md → Offers; Workflow 20): one offer per booking, a typed code replaces an
// automatic offer, the bigger automatic discount wins (tie: platform-funded), the discount only
// touches the base fare / room charges, and a redemption counts only when payment succeeds.
import Booking from '../models/Booking.js';
import Offer from '../models/Offer.js';
import User from '../models/User.js';
import { todayIstString } from '../utils/dates.js';
import { notifySupplier, notifyUsers } from './notify.js';

export const FIRST_BOOKINGS_LIMIT = 3;
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function discountFor(offer, eligible) {
  const raw = offer.discountType === 'percent' ? Math.floor((eligible * offer.value) / 100) : offer.value;
  const capped = offer.discountType === 'percent' && offer.maxDiscount ? Math.min(raw, offer.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, Math.floor(eligible)));
}

export function describeDiscount(offer) {
  if (offer.discountType === 'flat') return `${inr(offer.value)} off`;
  return `${offer.value}% off${offer.maxDiscount ? `, up to ${inr(offer.maxDiscount)}` : ''}`;
}

// Paid bookings that count towards "your first 3 bookings": supplier-cancelled ones don't.
export async function paidBookingCount(userId) {
  return Booking.countDocuments({ userId, $nor: [{ status: 'cancelled', 'cancellation.by': 'supplier' }] });
}

/**
 * Why an offer can't be used on this booking, or null if it can.
 * ctx: { product: 'flight'|'hotel', supplierId, eligible, paidCount, today }
 */
export function ineligibility(offer, ctx) {
  if (offer.status === 'paused') return 'This offer is paused right now.';
  if (offer.status === 'exhausted') return 'This offer has been fully used.';
  if (offer.status === 'expired' || ctx.today > offer.validTo) return 'This offer has ended.';
  if (ctx.today < offer.validFrom) return 'This offer hasn’t started yet.';
  if (offer.redemptionLimit != null && offer.redemptions >= offer.redemptionLimit) return 'This offer has been fully used.';
  const wanted = ctx.product === 'flight' ? 'flights' : 'hotels';
  if (offer.scope !== 'both' && offer.scope !== wanted) return `This offer is for ${offer.scope}.`;
  if (offer.funder === 'supplier' && String(offer.supplierId) !== String(ctx.supplierId)) {
    return `This offer is only for ${offer.supplierName || 'another airline or hotel'}.`;
  }
  if (ctx.eligible < (offer.minSpend || 0)) return `Spend at least ${inr(offer.minSpend)} to use this offer.`;
  if (offer.firstBookingsOnly && ctx.paidCount >= FIRST_BOOKINGS_LIMIT) return 'This offer is for your first 3 bookings on Atlas.';
  return null;
}

const asApplied = (offer, discount, how) => ({
  offerId: offer._id,
  code: offer.code,
  title: offer.title,
  summary: describeDiscount(offer),
  amount: discount,
  funder: offer.funder,
  supplierId: offer.supplierId,
  how, // 'code' | 'auto'
});

/**
 * Picks the offer for a booking.
 * @returns {{ applied: object|null, codeError: string|null }}
 */
export async function chooseOffer({ code, product, supplierId, eligible, userId, now = Date.now() }) {
  const today = todayIstString(now);
  const paidCount = userId ? await paidBookingCount(userId) : 0;
  const ctx = { product, supplierId, eligible, paidCount, today };

  let codeError = null;
  if (code) {
    const offer = await Offer.findOne({ code: code.trim().toUpperCase() }).lean();
    if (!offer) codeError = 'We don’t recognise that code.';
    else {
      codeError = ineligibility(offer, ctx);
      if (!codeError) return { applied: asApplied(offer, discountFor(offer, eligible), 'code'), codeError: null };
    }
  }

  const autos = await Offer.find({ auto: true, status: 'active', validFrom: { $lte: today }, validTo: { $gte: today } }).lean();
  let best = null;
  for (const offer of autos) {
    if (ineligibility(offer, ctx)) continue;
    const discount = discountFor(offer, eligible);
    if (!discount) continue;
    if (!best || discount > best.discount || (discount === best.discount && offer.funder === 'platform' && best.offer.funder !== 'platform')) {
      best = { offer, discount };
    }
  }
  return { applied: best ? asApplied(best.offer, best.discount, 'auto') : null, codeError };
}

async function notifyCreator(offer, { type, title, body }) {
  if (offer.funder === 'supplier') await notifySupplier(offer.supplierId, { type, title, body, link: '/supplier/offers' });
  else {
    const admins = await User.find({ role: 'admin' }, { _id: 1 }).lean();
    await notifyUsers(
      admins.map((a) => a._id),
      { type, title, body, link: '/admin/offers' },
    );
  }
}

// Counts one redemption atomically; returns false if the offer stopped being usable meanwhile
// (so two travellers racing for the last redemption: exactly one gets it).
export async function claimRedemption(offerId) {
  const claimed = await Offer.findOneAndUpdate(
    {
      _id: offerId,
      status: 'active',
      $or: [{ redemptionLimit: null }, { $expr: { $lt: ['$redemptions', '$redemptionLimit'] } }],
    },
    { $inc: { redemptions: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!claimed) return false;
  if (claimed.redemptionLimit != null && claimed.redemptions >= claimed.redemptionLimit) {
    const updated = await Offer.findOneAndUpdate({ _id: offerId, status: 'active', endNotified: { $ne: true } }, { $set: { status: 'exhausted', endNotified: true } }).lean();
    if (updated) await notifyCreator(claimed, { type: 'offer.exhausted', title: `Offer fully used · ${claimed.title}`, body: `All ${claimed.redemptionLimit} redemptions have been used.` });
  }
  return true;
}

// Supplier cancellations give the redemption back (traveller cancellations don't).
export async function restoreRedemption(offerId, now = Date.now()) {
  const offer = await Offer.findOneAndUpdate({ _id: offerId, redemptions: { $gt: 0 } }, { $inc: { redemptions: -1 } }, { returnDocument: 'after' }).lean();
  if (offer?.status === 'exhausted' && offer.validTo >= todayIstString(now)) {
    await Offer.updateOne({ _id: offerId, status: 'exhausted' }, { $set: { status: 'active', endNotified: false } });
  }
  return Boolean(offer);
}

// Daily job: offers past their end date become expired; their creators are told once.
export async function expireOffers({ now = Date.now() } = {}) {
  const today = todayIstString(now);
  const ended = await Offer.find({ status: { $in: ['active', 'paused'] }, validTo: { $lt: today } }).lean();
  for (const offer of ended) {
    const updated = await Offer.findOneAndUpdate({ _id: offer._id, status: { $in: ['active', 'paused'] } }, { $set: { status: 'expired', endNotified: true } }).lean();
    if (updated && !offer.endNotified) await notifyCreator(offer, { type: 'offer.expired', title: `Offer ended · ${offer.title}`, body: `It ran until ${offer.validTo} with ${offer.redemptions} redemptions.` });
  }
  return ended.length;
}
