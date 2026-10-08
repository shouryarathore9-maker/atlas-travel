// Offers: public browsing (prd.md → Offers page / About this offer), supplier offers for their own
// items, and platform offers + the kill switch for admin (Workflow 18). No approval step; edits apply
// to future bookings only; a redeemed offer can be paused but not deleted. All staff changes audited.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import Offer from '../models/Offer.js';
import Supplier from '../models/Supplier.js';
import { audit, snapshot } from '../services/audit.js';
import { describeDiscount, FIRST_BOOKINGS_LIMIT } from '../services/offers.js';
import { hiddenSupplierFilter, isSuspended } from '../services/suppliers.js';
import { todayIstString } from '../utils/dates.js';
import { HttpError } from '../utils/httpError.js';
import { dateString, pagination } from '../utils/query.js';
import { slugify } from '../seed/generate.js';

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const OFFER_ARTWORK = ['welcome', 'plane-sky', 'wing-sunset', 'plane-landing', 'business-cabin', 'luggage', 'summer-kit', 'gift', 'marigold', 'diya', 'kites', 'holi-colours', 'breakfast-tray', 'room-keys'];
export const OFFER_IMAGES = OFFER_ARTWORK.map((n) => `/images/seed/offers/${n}.jpg`);

// Plain-language terms generated from the offer's rules (never free-form legal text).
export function offerTerms(o) {
  const target = o.scope === 'both' ? 'flights and hotels' : o.scope;
  return [
    `One offer per booking; offers can’t be combined.`,
    `Applies to the ${o.scope === 'hotels' ? 'room charges' : o.scope === 'flights' ? 'base fare' : 'base fare (flights) or room charges (hotels)'} only — never to taxes, seats, meals, infant fees or breakfast.`,
    ...(o.funder === 'supplier' ? [`Valid only on ${o.supplierName}${o.scope === 'flights' ? ' flights' : ''}.`] : [`Valid on all ${target} on Atlas.`]),
    ...(o.minSpend ? [`Minimum spend of ${inr(o.minSpend)} on the eligible amount.`] : []),
    ...(o.firstBookingsOnly ? [`For your first ${FIRST_BOOKINGS_LIMIT} bookings on Atlas (bookings an airline or hotel cancelled don’t count).`] : []),
    `Valid for bookings made from ${o.validFrom} to ${o.validTo} (India time).`,
    ...(o.redemptionLimit ? [`Limited to ${o.redemptionLimit} bookings in total.`] : []),
    'If the offer ends before you pay, the total is recalculated and shown to you before any payment is taken.',
    'Refunds are calculated on the amount you actually paid. If you cancel, the offer isn’t given back; if the airline or hotel cancels, it is.',
    'The offer may be paused at any time.',
  ];
}

export function publicOffer(o) {
  return {
    _id: o._id,
    slug: o.slug,
    code: o.code,
    auto: o.auto,
    title: o.title,
    summary: o.summary,
    description: o.description,
    image: o.image,
    scope: o.scope,
    discount: describeDiscount(o),
    minSpend: o.minSpend,
    validFrom: o.validFrom,
    validTo: o.validTo,
    firstBookingsOnly: o.firstBookingsOnly,
    supplierName: o.funder === 'supplier' ? o.supplierName : null,
    status: o.status,
    terms: offerTerms(o),
  };
}

const activeFilter = (today) => ({ status: 'active', validFrom: { $lte: today }, validTo: { $gte: today } });

// ---------- Public ----------

export const publicListSchema = z.object({ product: z.enum(['flights', 'hotels']).optional(), limit: z.coerce.number().int().min(1).max(50).default(50) });

export async function listPublicOffers(req, res) {
  const { product, limit } = req.validated.query;
  // A suspended supplier's own offers leave the public list with its listings.
  const filter = { ...activeFilter(todayIstString()), ...(product && { scope: { $in: [product, 'both'] } }), ...(await hiddenSupplierFilter()) };
  const offers = await Offer.find(filter).sort({ funder: 1, validTo: 1 }).limit(limit).lean();
  res.json({ offers: offers.map(publicOffer) });
}

export async function getPublicOffer(req, res) {
  const offer = await Offer.findOne({ slug: String(req.params.slug).slice(0, 80) }).lean();
  if (!offer) throw new HttpError(404, 'We could not find that offer.', 'NOT_FOUND');
  const today = todayIstString();
  const suspended = offer.supplierId ? isSuspended(await Supplier.findById(offer.supplierId, { status: 1 }).lean()) : false;
  const live = !suspended && offer.status === 'active' && offer.validFrom <= today && offer.validTo >= today;
  // An ended, paused or used-up offer says so and shows no code.
  res.json({ offer: { ...publicOffer(offer), live, code: live ? offer.code : null } });
}

// ---------- Create / edit (supplier and admin) ----------

const offerInput = z
  .object({
    title: z.string().trim().min(3).max(80),
    summary: z.string().trim().min(3).max(140),
    description: z.string().trim().max(600).default(''),
    image: z.enum(OFFER_IMAGES, { error: 'Pick an image from the gallery' }),
    auto: z.boolean(),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,16}$/, 'Codes are 4–16 letters and digits').nullable().optional(),
    scope: z.enum(['flights', 'hotels', 'both']),
    discountType: z.enum(['percent', 'flat']),
    value: z.number().int().min(1),
    maxDiscount: z.number().int().min(1).max(100000).nullable().optional(),
    minSpend: z.number().int().min(0).max(1000000).default(0),
    validFrom: dateString,
    validTo: dateString,
    redemptionLimit: z.number().int().min(1).max(100000).nullable().optional(),
    firstBookingsOnly: z.boolean().default(false),
  })
  .superRefine((o, ctx) => {
    if (!o.auto && !o.code) ctx.addIssue({ code: 'custom', path: ['code'], message: 'A code offer needs a code' });
    if (o.discountType === 'percent' && o.value > 90) ctx.addIssue({ code: 'custom', path: ['value'], message: 'At most 90% off' });
    if (o.discountType === 'percent' && !o.maxDiscount) ctx.addIssue({ code: 'custom', path: ['maxDiscount'], message: 'Percent offers need a maximum discount' });
    if (o.discountType === 'flat' && o.value > 50000) ctx.addIssue({ code: 'custom', path: ['value'], message: 'At most ₹50,000 off' });
    if (o.validTo < o.validFrom) ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'The end date must be on or after the start date' });
  });

export const offerInputSchema = offerInput;
export const offerListSchema = z.object({ status: z.enum(['active', 'paused', 'expired', 'exhausted']).optional(), funder: z.enum(['platform', 'supplier']).optional(), ...pagination });

const AUDIT_FIELDS = ['title', 'code', 'auto', 'scope', 'discountType', 'value', 'maxDiscount', 'minSpend', 'validFrom', 'validTo', 'redemptionLimit', 'firstBookingsOnly', 'status'];

function statusAfterEdit(offer, input, today) {
  if (offer.status === 'paused') return 'paused';
  if (input.validTo < today) return 'expired';
  if (input.redemptionLimit != null && offer.redemptions >= input.redemptionLimit) return 'exhausted';
  return 'active'; // extending an ended offer, or raising its limit, makes it active again
}

async function create(req, res, { funder }) {
  const input = req.validated.body;
  if (funder === 'supplier' && input.scope !== (req.supplier.kind === 'airline' ? 'flights' : 'hotels')) {
    throw new HttpError(400, `Your offers can only apply to your own ${req.supplier.kind === 'airline' ? 'flights' : 'hotel'}.`, 'VALIDATION_ERROR');
  }
  if (input.code && (await Offer.exists({ code: input.code }))) throw new HttpError(409, 'That code is already in use. Choose another.', 'DUPLICATE');
  const today = todayIstString();
  const offer = await Offer.create({
    ...input,
    code: input.auto ? null : input.code,
    maxDiscount: input.discountType === 'percent' ? input.maxDiscount : null,
    slug: `${slugify(input.title)}-${crypto.randomBytes(3).toString('hex')}`,
    funder,
    supplierId: funder === 'supplier' ? req.supplierId : null,
    supplierName: funder === 'supplier' ? req.supplier.name : null,
    status: input.validTo < today ? 'expired' : 'active',
    createdBy: req.user._id,
  });
  await audit(req, { action: 'offer.create', target: { type: 'offer', id: offer._id, label: offer.title }, after: snapshot(offer, AUDIT_FIELDS) });
  res.status(201).json({ offer });
}

async function update(req, res, offer) {
  const input = req.validated.body;
  if (offer.funder === 'supplier' && input.scope !== offer.scope) throw new HttpError(400, 'A supplier offer keeps its scope.', 'VALIDATION_ERROR');
  if (input.code && input.code !== offer.code && (await Offer.exists({ code: input.code }))) throw new HttpError(409, 'That code is already in use. Choose another.', 'DUPLICATE');
  const before = snapshot(offer, AUDIT_FIELDS);
  offer.set({ ...input, code: input.auto ? null : input.code, maxDiscount: input.discountType === 'percent' ? input.maxDiscount : null });
  offer.status = statusAfterEdit(offer, input, todayIstString());
  if (offer.status === 'active') offer.endNotified = false;
  await offer.save();
  await audit(req, { action: 'offer.update', target: { type: 'offer', id: offer._id, label: offer.title }, before, after: snapshot(offer, AUDIT_FIELDS) });
  res.json({ offer });
}

async function setPaused(req, res, offer, paused) {
  const before = { status: offer.status };
  if (paused && offer.status === 'active') offer.status = 'paused';
  else if (!paused && offer.status === 'paused') offer.status = statusAfterEdit({ ...offer.toObject(), status: 'active' }, offer, todayIstString());
  else return res.json({ offer });
  await offer.save();
  const killSwitch = req.user.role === 'admin' && offer.funder === 'supplier';
  await audit(req, { action: paused ? (killSwitch ? 'offer.kill_switch' : 'offer.pause') : 'offer.resume', target: { type: 'offer', id: offer._id, label: offer.title }, before, after: { status: offer.status } });
  res.json({ offer });
}

async function list(req, res, base) {
  const { status, funder, page, limit } = req.validated.query;
  const filter = { ...base, ...(status && { status }), ...(funder && { funder }) };
  const [items, total] = await Promise.all([Offer.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Offer.countDocuments(filter)]);
  res.json({ items: items.map((o) => ({ ...o, discount: describeDiscount(o) })), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

const loadOffer = async (id, filter = {}) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Offer not found', 'NOT_FOUND');
  const offer = await Offer.findOne({ _id: id, ...filter });
  if (!offer) throw new HttpError(404, 'Offer not found', 'NOT_FOUND');
  return offer;
};

// Supplier: own offers only.
export const supplierOffers = {
  list: (req, res) => list(req, res, { supplierId: req.supplierId }),
  get: async (req, res) => res.json({ offer: await loadOffer(req.params.id, { supplierId: req.supplierId }) }),
  create: (req, res) => create(req, res, { funder: 'supplier' }),
  update: async (req, res) => update(req, res, await loadOffer(req.params.id, { supplierId: req.supplierId })),
  pause: async (req, res) => setPaused(req, res, await loadOffer(req.params.id, { supplierId: req.supplierId }), true),
  resume: async (req, res) => setPaused(req, res, await loadOffer(req.params.id, { supplierId: req.supplierId }), false),
};

// Admin: all offers; creates and edits platform offers; pauses or resumes any offer (the kill switch).
export const adminOffers = {
  list: (req, res) => list(req, res, {}),
  get: async (req, res) => res.json({ offer: await loadOffer(req.params.id) }),
  create: (req, res) => create(req, res, { funder: 'platform' }),
  update: async (req, res) => update(req, res, await loadOffer(req.params.id, { funder: 'platform' })),
  pause: async (req, res) => setPaused(req, res, await loadOffer(req.params.id), true),
  resume: async (req, res) => setPaused(req, res, await loadOffer(req.params.id), false),
};

// Redemptions and discount cost, by funder (admin) or for one supplier.
export async function offerStats(match) {
  const rows = await Offer.aggregate([{ $match: match }, { $group: { _id: '$funder', offers: { $sum: 1 }, redemptions: { $sum: '$redemptions' } } }]);
  return rows;
}
