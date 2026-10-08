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
import { HttpError } from '../utils/httpError.js';
import { pagination } from '../utils/query.js';

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
  const suppliers = await Supplier.find({}, { name: 1, kind: 1, code: 1 }).sort({ kind: 1, name: 1 }).lean();
  res.json({ suppliers });
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
