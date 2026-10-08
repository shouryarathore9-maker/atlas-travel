// Admin console (prd.md → Admin console). Admin oversees the platform; it does not edit supplier
// inventory, prices or refunds (the Phase 1 inventory editor moved to the supplier console).
import mongoose from 'mongoose';
import { z } from 'zod';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import Supplier from '../models/Supplier.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { analytics } from '../services/analytics.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../utils/httpError.js';
import { addDays, todayIstString } from '../utils/dates.js';
import { dateString, pagination } from '../utils/query.js';

export const auditQuerySchema = z.object({
  supplierId: z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid supplier').optional(),
  actorRole: z.enum(['admin', 'airline_manager', 'hotel_manager']).optional(),
  action: z.string().trim().max(60).optional(),
  ...pagination,
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listAudit(req, res) {
  const { supplierId, actorRole, action, page, limit } = req.validated.query;
  const filter = {
    ...(supplierId && { supplierId }),
    ...(actorRole && { actorRole }),
    ...(action && { action: new RegExp(`^${escapeRegex(action)}`) }),
  };
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  const suppliers = await Supplier.find({ _id: { $in: [...new Set(items.map((i) => i.supplierId).filter(Boolean))] } }, { name: 1 }).lean();
  const names = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  res.json({
    items: items.map((i) => ({ ...i, supplierName: i.supplierId ? names[i.supplierId] || null : null })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function listSuppliers(req, res) {
  const suppliers = await Supplier.find({}, { name: 1, kind: 1, code: 1, status: 1, suspension: 1 }).sort({ kind: 1, name: 1 }).lean();
  const [managers, upcoming] = await Promise.all([
    User.find({ supplierId: { $in: suppliers.map((s) => s._id) } }, { name: 1, email: 1, supplierId: 1 }).lean(),
    Booking.aggregate([
      { $match: { status: 'confirmed', 'travelDates.start': { $gte: new Date() }, supplierId: { $in: suppliers.map((s) => s._id) } } },
      { $group: { _id: '$supplierId', n: { $sum: 1 } } },
    ]),
  ]);
  const managerOf = Object.fromEntries(managers.map((m) => [String(m.supplierId), { name: m.name, email: m.email }]));
  const upcomingOf = Object.fromEntries(upcoming.map((u) => [String(u._id), u.n]));
  res.json({
    suppliers: suppliers.map((s) => ({
      ...s,
      status: s.status || 'active',
      manager: managerOf[String(s._id)] || null,
      upcomingBookings: upcomingOf[String(s._id)] || 0,
    })),
  });
}

// ---------- Suspend / reactivate a supplier ----------

export const suspendSchema = z.object({ reason: z.string().trim().min(5, 'Give a short reason (at least 5 characters)').max(300) });

async function setSupplierStatus(req, status, reason = '') {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'We could not find that supplier.', 'NOT_FOUND');
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw new HttpError(404, 'We could not find that supplier.', 'NOT_FOUND');
  const current = supplier.status || 'active';
  if (current === status) {
    throw new HttpError(409, status === 'suspended' ? `${supplier.name} is already suspended.` : `${supplier.name} is already active.`, 'NO_CHANGE');
  }
  const before = { status: current, reason: supplier.suspension?.reason || '' };
  supplier.status = status;
  supplier.suspension = status === 'suspended' ? { reason, at: new Date(), by: req.user.name } : { reason: '', at: null, by: '' };
  await supplier.save();
  await audit(req, {
    action: status === 'suspended' ? 'supplier.suspend' : 'supplier.reactivate',
    target: { type: 'supplier', id: supplier._id, label: supplier.name },
    supplierId: supplier._id,
    before,
    after: { status, reason },
  });
  return supplier;
}

export async function suspendSupplier(req, res) {
  const supplier = await setSupplierStatus(req, 'suspended', req.validated.body.reason);
  res.json({ supplier: { _id: supplier._id, name: supplier.name, status: supplier.status, suspension: supplier.suspension } });
}

export async function reactivateSupplier(req, res) {
  const supplier = await setSupplierStatus(req, 'active');
  res.json({ supplier: { _id: supplier._id, name: supplier.name, status: supplier.status, suspension: supplier.suspension } });
}

// ---------- Analytics ----------

export const MAX_ANALYTICS_DAYS = 180;
export const analyticsSchema = z
  .object({
    range: z.enum(['7', '30', '90', '180', 'custom']).default('30'),
    from: dateString.optional(),
    to: dateString.optional(),
    product: z.enum(['all', 'flight', 'hotel']).default('all'),
    supplierId: z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid supplier').optional(),
  })
  .transform((q) => {
    const today = todayIstString();
    if (q.range !== 'custom') return { ...q, to: today, from: addDays(today, -(Number(q.range) - 1)) };
    return { ...q, from: q.from || addDays(today, -29), to: q.to && q.to < today ? q.to : today };
  })
  .refine((q) => q.from <= q.to, { message: 'The start must be on or before the end', path: ['from'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) < MAX_ANALYTICS_DAYS * 864e5, { message: `Choose at most ${MAX_ANALYTICS_DAYS} days`, path: ['from'] });

export async function getAnalytics(req, res) {
  const { from, to, product, supplierId } = req.validated.query;
  res.json(await analytics({ from, to, product: product === 'all' ? null : product, supplierId }));
}

// ---------- Users (read-only) ----------
// prd.md → Admin console → Users: every account, searchable, with its bookings and tickets. No edits —
// admin oversees accounts, it doesn't change them. Seeded history accounts are hidden unless asked for.

const HISTORY_EMAIL = /@history\.atlas\.invalid$/;

export const adminUsersSchema = z.object({
  q: z.string().trim().max(80).optional().default(''),
  role: z.enum(['traveler', 'airline_manager', 'hotel_manager', 'admin']).optional(),
  seeded: z.enum(['true', 'false']).optional().default('false'),
  ...pagination,
});

export async function listUsers(req, res) {
  const { q, role, seeded, page, limit } = req.validated.query;
  const filter = {
    ...(role && { role }),
    ...(seeded !== 'true' && { email: { $not: HISTORY_EMAIL } }),
    ...(q && { $or: [{ email: new RegExp(escapeRegex(q.toLowerCase())) }, { name: new RegExp(escapeRegex(q), 'i') }] }),
  };
  const [items, total] = await Promise.all([
    User.find(filter, { name: 1, email: 1, role: 1, supplierId: 1, createdAt: 1 }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const ids = items.map((u) => u._id);
  const [counts, suppliers] = await Promise.all([
    Booking.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]),
    Supplier.find({ _id: { $in: items.map((u) => u.supplierId).filter(Boolean) } }, { name: 1 }).lean(),
  ]);
  const bookingsOf = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  const supplierOf = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  res.json({
    items: items.map((u) => ({ ...u, bookings: bookingsOf[String(u._id)] || 0, supplierName: u.supplierId ? supplierOf[String(u.supplierId)] || null : null })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function getUser(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'We could not find that account.', 'NOT_FOUND');
  const user = await User.findById(req.params.id, { passwordHash: 0 }).lean();
  if (!user) throw new HttpError(404, 'We could not find that account.', 'NOT_FOUND');
  const [bookings, bookingCount, tickets, supplier] = await Promise.all([
    Booking.find({ userId: user._id }, { bookingReference: 1, type: 1, itemSummary: 1, travelDates: 1, status: 1, 'fareBreakdown.total': 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(20).lean(),
    Booking.countDocuments({ userId: user._id }),
    Ticket.find({ travellerId: user._id }, { bookingReference: 1, subject: 1, status: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(20).lean(),
    user.supplierId ? Supplier.findById(user.supplierId, { name: 1, kind: 1, status: 1 }).lean() : null,
  ]);
  res.json({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      savedTravellers: (user.savedTravellers || []).length,
    },
    supplier,
    bookings,
    bookingCount,
    tickets,
  });
}

// ---------- Bookings (read-only) and special requests ----------

export const adminBookingsSchema = z.object({
  q: z.string().trim().max(80).optional().default(''),
  status: z.enum(['confirmed', 'cancelled']).optional(),
  type: z.enum(['flight', 'hotel']).optional(),
  supplierId: z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid supplier').optional(),
  ...pagination,
});

export async function listBookings(req, res) {
  const { q, status, type, supplierId, page, limit } = req.validated.query;
  const filter = {
    ...(status && { status }),
    ...(type && { type }),
    ...(supplierId && { supplierId }),
    ...(q && (/^AT[A-Z0-9]{6}$/i.test(q) ? { bookingReference: q.toUpperCase() } : { $or: [{ 'contact.email': q.toLowerCase() }, { pnr: q.toUpperCase() }] })),
  };
  const [items, total] = await Promise.all([
    Booking.find(filter, { travellers: 0, pricing: 0 }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);
  const suppliers = await Supplier.find({ _id: { $in: items.map((b) => b.supplierId).filter(Boolean) } }, { name: 1 }).lean();
  const names = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  res.json({ items: items.map((b) => ({ ...b, supplierName: names[String(b.supplierId)] || null })), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function getBooking(req, res) {
  const key = String(req.params.ref);
  const booking = await Booking.findOne(mongoose.isValidObjectId(key) ? { _id: key } : { bookingReference: key.toUpperCase() }).lean();
  if (!booking) throw new HttpError(404, 'We could not find that booking.', 'NOT_FOUND');
  const [payments, tickets, supplier, user] = await Promise.all([
    Payment.find({ $or: [{ bookingId: booking._id }, { _id: booking.paymentId }] }).lean(),
    Ticket.find({ bookingId: booking._id }).lean(),
    booking.supplierId ? Supplier.findById(booking.supplierId, { name: 1, kind: 1 }).lean() : null,
    User.findById(booking.userId, { name: 1, email: 1 }).lean(),
  ]);
  res.json({ booking, payments, tickets, supplier, account: user });
}

export async function listSpecialRequests(req, res) {
  const items = await Booking.find({ 'specialRequest.text': { $exists: true, $ne: '' } }, { bookingReference: 1, itemSummary: 1, specialRequest: 1, supplierId: 1, travelDates: 1, status: 1 })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const suppliers = await Supplier.find({ _id: { $in: items.map((b) => b.supplierId).filter(Boolean) } }, { name: 1 }).lean();
  const names = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  res.json({ items: items.map((b) => ({ ...b, supplierName: names[String(b.supplierId)] || null })) });
}
