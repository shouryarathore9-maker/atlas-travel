// Booking-problem tickets (prd.md → Workflow 5): traveller raises → admin replies, closes or escalates
// to the booking's supplier → supplier replies to the traveller (admin sees everything). Everyone is
// notified of replies meant for them; staff actions are audit-logged. Messages are plain text.
import mongoose from 'mongoose';
import { z } from 'zod';
import Booking from '../models/Booking.js';
import Supplier from '../models/Supplier.js';
import Ticket, { TICKET_MESSAGE_LIMIT } from '../models/Ticket.js';
import User from '../models/User.js';
import { audit } from '../services/audit.js';
import { notifySupplier, notifyUser, notifyUsers } from '../services/notify.js';
import { HttpError } from '../utils/httpError.js';
import { pagination } from '../utils/query.js';

const notFound = () => new HttpError(404, 'We could not find that ticket.', 'NOT_FOUND');
const message = z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(1000, 'At most 1,000 characters');

export const newTicketSchema = z.object({ bookingReference: z.string().trim().toUpperCase().max(12), message });
export const messageSchema = z.object({ message: z.string().trim().min(2, 'Write a reply').max(1000, 'At most 1,000 characters') });
export const escalateSchema = z.object({ message: z.string().trim().max(1000).optional() });

async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'admin' }, { _id: 1 }).lean();
  await notifyUsers(
    admins.map((a) => a._id),
    payload,
  );
}

function addMessage(ticket, role, name, body) {
  if (ticket.messages.length >= TICKET_MESSAGE_LIMIT) throw new HttpError(409, 'This conversation is full. Please open a new ticket.', 'TICKET_FULL');
  ticket.messages.push({ authorRole: role, authorName: name, body });
  ticket.updatedAt = new Date();
}

const view = (t) => ({ ...t, canReply: t.status !== 'closed' && t.status !== 'resolved' });

// ---------- Traveller ----------

export async function createTicket(req, res) {
  const { bookingReference, message: body } = req.validated.body;
  const booking = await Booking.findOne({ bookingReference, userId: req.user._id }).lean();
  if (!booking) throw new HttpError(404, 'We could not find that booking.', 'NOT_FOUND');
  if (await Ticket.exists({ bookingId: booking._id, type: 'booking_problem', status: { $nin: ['closed', 'resolved'] } })) {
    throw new HttpError(409, 'There’s already an open ticket for this booking — reply there instead.', 'TICKET_EXISTS');
  }
  const ticket = await Ticket.create({
    type: 'booking_problem',
    bookingId: booking._id,
    bookingReference: booking.bookingReference,
    supplierId: booking.supplierId,
    travellerId: req.user._id,
    subject: booking.itemSummary.title,
    messages: [{ authorRole: 'traveller', authorName: req.user.name, body }],
  });
  await notifyAdmins({ type: 'ticket.new', title: `New help ticket · ${booking.bookingReference}`, body: body.slice(0, 140), link: `/admin/tickets/${ticket._id}` });
  res.status(201).json({ ticket: view(ticket.toObject()) });
}

export async function myTickets(req, res) {
  const tickets = await Ticket.find({ travellerId: req.user._id }).sort({ updatedAt: -1 }).limit(50).lean();
  res.json({ tickets: tickets.map(view) });
}

async function ownTicket(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const ticket = await Ticket.findOne({ _id: req.params.id, travellerId: req.user._id });
  if (!ticket) throw notFound();
  return ticket;
}

export async function getMyTicket(req, res) {
  res.json({ ticket: view((await ownTicket(req)).toObject()) });
}

export async function travellerReply(req, res) {
  const ticket = await ownTicket(req);
  if (ticket.status === 'closed') throw new HttpError(409, 'This ticket is closed. Open a new one if you still need help.', 'TICKET_CLOSED');
  addMessage(ticket, 'traveller', req.user.name, req.validated.body.message);
  const wasEscalated = ticket.status === 'escalated';
  ticket.status = wasEscalated ? 'escalated' : 'open';
  await ticket.save();
  if (wasEscalated) await notifySupplier(ticket.supplierId, { type: 'ticket.reply', title: `Traveller replied · ${ticket.bookingReference}`, link: `/supplier/tickets/${ticket._id}` });
  await notifyAdmins({ type: 'ticket.reply', title: `Traveller replied · ${ticket.bookingReference}`, link: `/admin/tickets/${ticket._id}` });
  res.json({ ticket: view(ticket.toObject()) });
}

// ---------- Admin ----------

export const adminListSchema = z.object({
  status: z.enum(['open', 'escalated', 'answered', 'closed', 'resolved']).optional(),
  type: z.enum(['booking_problem', 'statement_query']).optional(),
  ...pagination,
});

export async function adminList(req, res) {
  const { status, type, page, limit } = req.validated.query;
  const filter = { ...(status && { status }), ...(type && { type }) };
  const [items, total] = await Promise.all([
    Ticket.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Ticket.countDocuments(filter),
  ]);
  const suppliers = await Supplier.find({ _id: { $in: items.map((t) => t.supplierId).filter(Boolean) } }, { name: 1 }).lean();
  const names = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  res.json({ items: items.map((t) => ({ ...view(t), supplierName: names[String(t.supplierId)] || null })), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function anyTicket(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw notFound();
  return ticket;
}

export async function adminGet(req, res) {
  const ticket = await anyTicket(req);
  const supplier = ticket.supplierId ? await Supplier.findById(ticket.supplierId, { name: 1 }).lean() : null;
  res.json({ ticket: { ...view(ticket.toObject()), supplierName: supplier?.name || null } });
}

const label = (t) => `${t.type === 'booking_problem' ? 'Ticket' : 'Query'} ${t.bookingReference || t._id}`;

export async function adminReply(req, res) {
  const ticket = await anyTicket(req);
  if (ticket.status === 'closed' || ticket.status === 'resolved') throw new HttpError(409, 'This ticket is closed.', 'TICKET_CLOSED');
  addMessage(ticket, 'admin', 'Atlas support', req.validated.body.message);
  ticket.status = 'answered';
  await ticket.save();
  if (ticket.travellerId) await notifyUser(ticket.travellerId, { type: 'ticket.reply', title: `Atlas support replied · ${ticket.bookingReference}`, body: req.validated.body.message.slice(0, 140), link: `/help/${ticket._id}` });
  if (ticket.type === 'statement_query') {
    await notifySupplier(ticket.supplierId, { type: 'ticket.reply', title: `Atlas replied to your statement query · ${ticket.bookingReference}`, body: req.validated.body.message.slice(0, 140), link: `/supplier/tickets/${ticket._id}` });
  }
  await audit(req, { action: 'ticket.reply', target: { type: 'ticket', id: ticket._id, label: label(ticket) } });
  res.json({ ticket: view(ticket.toObject()) });
}

export async function adminClose(req, res) {
  const ticket = await anyTicket(req);
  if (ticket.status !== 'closed') {
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.updatedAt = new Date();
    await ticket.save();
    if (ticket.travellerId) await notifyUser(ticket.travellerId, { type: 'ticket.closed', title: `Help ticket closed · ${ticket.bookingReference}`, link: `/help/${ticket._id}` });
    await audit(req, { action: 'ticket.close', target: { type: 'ticket', id: ticket._id, label: label(ticket) } });
  }
  res.json({ ticket: view(ticket.toObject()) });
}

export async function adminEscalate(req, res) {
  const ticket = await anyTicket(req);
  if (ticket.type !== 'booking_problem' || !ticket.supplierId) throw new HttpError(400, 'Only booking tickets can be escalated to a supplier.', 'NOT_ALLOWED');
  if (ticket.status === 'closed') throw new HttpError(409, 'This ticket is closed.', 'TICKET_CLOSED');
  if (req.validated.body?.message) addMessage(ticket, 'admin', 'Atlas support', req.validated.body.message);
  ticket.status = 'escalated';
  ticket.updatedAt = new Date();
  await ticket.save();
  await notifySupplier(ticket.supplierId, { type: 'ticket.escalated', title: `Ticket escalated to you · ${ticket.bookingReference}`, body: ticket.messages[0]?.body.slice(0, 140), link: `/supplier/tickets/${ticket._id}` });
  if (ticket.travellerId) await notifyUser(ticket.travellerId, { type: 'ticket.escalated', title: `We’ve asked the airline or hotel to help · ${ticket.bookingReference}`, link: `/help/${ticket._id}` });
  await audit(req, { action: 'ticket.escalate', target: { type: 'ticket', id: ticket._id, label: label(ticket) } });
  res.json({ ticket: view(ticket.toObject()) });
}

// ---------- Supplier (escalated tickets and own statement queries, own supplier only) ----------

const visibleToSupplier = (t) => t.type === 'statement_query' || t.status === 'escalated' || t.messages.some((m) => m.authorRole === 'supplier');

export async function supplierList(req, res) {
  const tickets = await Ticket.find({
    supplierId: req.supplierId,
    $or: [{ type: 'booking_problem', status: { $in: ['escalated', 'answered', 'closed'] } }, { type: 'statement_query' }],
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  // Booking tickets only if they were escalated to this supplier at some point.
  res.json({ tickets: tickets.filter(visibleToSupplier).map(view) });
}

async function supplierTicket(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const ticket = await Ticket.findOne({ _id: req.params.id, supplierId: req.supplierId });
  if (!ticket || !visibleToSupplier(ticket)) throw notFound();
  return ticket;
}

export async function supplierGet(req, res) {
  res.json({ ticket: view((await supplierTicket(req)).toObject()) });
}

export async function supplierReply(req, res) {
  const ticket = await supplierTicket(req);
  if (ticket.status === 'closed' || ticket.status === 'resolved') throw new HttpError(409, 'This ticket is closed.', 'TICKET_CLOSED');
  addMessage(ticket, 'supplier', req.supplier.name, req.validated.body.message);
  if (ticket.type === 'statement_query') {
    // A statement query goes back to Atlas support.
    ticket.status = 'open';
    await ticket.save();
    await notifyAdmins({ type: 'ticket.reply', title: `${req.supplier.name} replied · query ${ticket.bookingReference}`, link: `/admin/tickets/${ticket._id}` });
    await audit(req, { action: 'ticket.supplier_reply', target: { type: 'ticket', id: ticket._id, label: label(ticket) } });
    return res.json({ ticket: view(ticket.toObject()) });
  }
  ticket.status = 'answered';
  await ticket.save();
  if (ticket.travellerId) await notifyUser(ticket.travellerId, { type: 'ticket.reply', title: `${req.supplier.name} replied · ${ticket.bookingReference}`, body: req.validated.body.message.slice(0, 140), link: `/help/${ticket._id}` });
  await audit(req, { action: 'ticket.supplier_reply', target: { type: 'ticket', id: ticket._id, label: label(ticket) } });
  res.json({ ticket: view(ticket.toObject()) });
}
