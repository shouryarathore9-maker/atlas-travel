// Settlement statements (prd.md → Settlement; stories #37 and #41). Managers see and query their own;
// admin sees all, resolves queries (no change, or an adjustment carried to the next statement) and
// marks statements paid with a mock reference. Statement lines are never edited.
import mongoose from 'mongoose';
import { z } from 'zod';
import Adjustment from '../models/Adjustment.js';
import Statement from '../models/Statement.js';
import Supplier from '../models/Supplier.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { audit } from '../services/audit.js';
import { notifySupplier, notifyUsers } from '../services/notify.js';
import { useSandboxQuota } from '../services/sandbox.js';
import { periodLabel } from '../services/settlement.js';
import { HttpError } from '../utils/httpError.js';
import { pagination } from '../utils/query.js';

const notFound = () => new HttpError(404, 'We could not find that statement.', 'NOT_FOUND');
const summary = ({ lines: _lines, ...s }) => ({ ...s, label: periodLabel(s.period) });

// The statement queries raised on a statement, for its detail view.
const queriesFor = (statementId) =>
  Ticket.find({ type: 'statement_query', statementId }, { bookingReference: 1, status: 1, resolution: 1, messages: 1, createdAt: 1 }).sort({ createdAt: 1 }).lean();

async function detail(statement) {
  const [queries, pending] = await Promise.all([
    queriesFor(statement._id),
    Adjustment.find({ supplierId: statement.supplierId, statementId: null }).sort({ createdAt: 1 }).lean(),
  ]);
  return { statement: { ...statement, label: periodLabel(statement.period) }, queries, pendingAdjustments: pending };
}

// ---------- Supplier ----------

export async function supplierStatements(req, res) {
  const statements = await Statement.find({ supplierId: req.supplierId }, { lines: 0 }).sort({ period: -1 }).limit(60).lean();
  res.json({ statements: statements.map(summary) });
}

async function ownStatement(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const statement = await Statement.findOne({ _id: req.params.id, supplierId: req.supplierId }).lean();
  if (!statement) throw notFound();
  return statement;
}

export async function supplierStatement(req, res) {
  res.json(await detail(await ownStatement(req)));
}

export const querySchema = z.object({ note: z.string().trim().min(10, 'Tell Atlas what looks wrong (at least 10 characters)').max(1000, 'At most 1,000 characters') });

export async function queryLine(req, res) {
  const statement = await ownStatement(req);
  const ref = String(req.params.ref).toUpperCase().slice(0, 12);
  const line = statement.lines.find((l) => l.bookingReference === ref);
  if (!line) throw new HttpError(404, 'That booking isn’t on this statement.', 'NOT_FOUND');
  if (await Ticket.exists({ type: 'statement_query', statementId: statement._id, bookingReference: ref, status: { $ne: 'resolved' } })) {
    throw new HttpError(409, 'There’s already an open query on this line.', 'QUERY_EXISTS');
  }
  await useSandboxQuota('docs');
  const ticket = await Ticket.create({
    type: 'statement_query',
    bookingId: line.bookingId,
    bookingReference: ref,
    supplierId: req.supplierId,
    statementId: statement._id,
    subject: `${periodLabel(statement.period)} statement · ${ref}`,
    messages: [{ authorRole: 'supplier', authorName: req.supplier.name, body: req.validated.body.note }],
  });
  const admins = await User.find({ role: 'admin' }, { _id: 1 }).lean();
  await notifyUsers(
    admins.map((a) => a._id),
    { type: 'statement.query', title: `Statement query from ${req.supplier.name} · ${ref}`, body: req.validated.body.note.slice(0, 140), link: `/admin/tickets/${ticket._id}` },
  );
  await audit(req, { action: 'statement.query', target: { type: 'statement', id: statement._id, label: `${periodLabel(statement.period)} · ${ref}` } });
  res.status(201).json({ ticket: ticket.toObject() });
}

// ---------- Admin ----------

export const adminStatementsSchema = z.object({
  supplierId: z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid supplier').optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  status: z.enum(['ready', 'paid']).optional(),
  ...pagination,
});

export async function adminStatements(req, res) {
  const { supplierId, period, status, page, limit } = req.validated.query;
  const filter = { ...(supplierId && { supplierId }), ...(period && { period }), ...(status && { status }) };
  const [items, total, periods] = await Promise.all([
    Statement.find(filter, { lines: 0 }).sort({ period: -1, 'totals.net': -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Statement.countDocuments(filter),
    Statement.distinct('period'),
  ]);
  const suppliers = await Supplier.find({ _id: { $in: items.map((s) => s.supplierId) } }, { name: 1 }).lean();
  const names = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  res.json({
    items: items.map((s) => ({ ...summary(s), supplierName: names[String(s.supplierId)] || null })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    periods: periods.sort().reverse().map((p) => ({ period: p, label: periodLabel(p) })),
  });
}

async function anyStatement(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const statement = await Statement.findById(req.params.id).lean();
  if (!statement) throw notFound();
  return statement;
}

export async function adminStatement(req, res) {
  const statement = await anyStatement(req);
  const supplier = await Supplier.findById(statement.supplierId, { name: 1, kind: 1 }).lean();
  res.json({ ...(await detail(statement)), supplier });
}

export const markPaidSchema = z.object({
  paymentRef: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,30}$/, 'Use 6–30 letters, digits or dashes, e.g. ATLPAY-2026-0042'),
});

export async function markPaid(req, res) {
  const statement = await anyStatement(req);
  if (statement.status === 'paid') throw new HttpError(409, 'This statement is already marked as paid.', 'ALREADY_PAID');
  const { paymentRef } = req.validated.body;
  const paidAt = new Date();
  const result = await Statement.updateOne({ _id: statement._id, status: 'ready' }, { $set: { status: 'paid', paidAt, paymentRef, paidBy: req.user.name } });
  if (!result.modifiedCount) throw new HttpError(409, 'This statement is already marked as paid.', 'ALREADY_PAID');
  await notifySupplier(statement.supplierId, {
    type: 'statement.paid',
    title: `Your ${periodLabel(statement.period)} statement has been paid`,
    body: `₹${Math.round(statement.totals.net).toLocaleString('en-IN')} · reference ${paymentRef} (simulated)`,
    link: `/supplier/statements/${statement._id}`,
  });
  await audit(req, {
    action: 'statement.mark_paid',
    target: { type: 'statement', id: statement._id, label: periodLabel(statement.period) },
    supplierId: statement.supplierId,
    before: { status: 'ready' },
    after: { status: 'paid', paymentRef },
  });
  res.json({ statement: { ...summary(statement), status: 'paid', paidAt, paymentRef, paidBy: req.user.name } });
}

export const resolveSchema = z
  .object({
    outcome: z.enum(['no_change', 'adjustment']),
    amount: z.number().int('Use whole rupees').min(-1000000).max(1000000).optional(),
    note: z.string().trim().min(3, 'Add a short note for the supplier').max(300),
  })
  .refine((r) => r.outcome === 'no_change' || (r.amount !== undefined && r.amount !== 0), { message: 'Enter the adjustment amount (positive if Atlas owes the supplier more)', path: ['amount'] });

export async function resolveQuery(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'We could not find that ticket.', 'NOT_FOUND');
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw new HttpError(404, 'We could not find that ticket.', 'NOT_FOUND');
  if (ticket.type !== 'statement_query') throw new HttpError(400, 'Only statement queries are resolved this way.', 'NOT_ALLOWED');
  if (ticket.status === 'resolved') throw new HttpError(409, 'This query is already resolved.', 'TICKET_CLOSED');
  const { outcome, amount, note } = req.validated.body;
  const statement = await Statement.findById(ticket.statementId, { period: 1 }).lean();

  let adjustment = null;
  if (outcome === 'adjustment') {
    adjustment = await Adjustment.create({ supplierId: ticket.supplierId, amount, note, ticketId: ticket._id, bookingReference: ticket.bookingReference, fromStatementId: ticket.statementId });
  }
  const now = new Date();
  ticket.messages.push({ authorRole: 'admin', authorName: 'Atlas support', body: outcome === 'adjustment' ? `Adjustment of ₹${amount.toLocaleString('en-IN')} on your next statement: ${note}` : `No change: ${note}` });
  ticket.status = 'resolved';
  ticket.resolution = { kind: outcome, amount: adjustment ? amount : 0, note };
  ticket.updatedAt = now;
  ticket.closedAt = now;
  await ticket.save();

  await notifySupplier(ticket.supplierId, {
    type: 'statement.query_answered',
    title: `Statement query answered · ${ticket.bookingReference}`,
    body: outcome === 'adjustment' ? `An adjustment of ₹${amount.toLocaleString('en-IN')} will appear on your next statement.` : 'No change to the statement.',
    link: statement ? `/supplier/statements/${statement._id}` : '/supplier/statements',
  });
  await audit(req, {
    action: outcome === 'adjustment' ? 'statement.adjustment' : 'statement.query_resolved',
    target: { type: 'ticket', id: ticket._id, label: `Query ${ticket.bookingReference}` },
    supplierId: ticket.supplierId,
    after: { outcome, amount: adjustment ? amount : 0, note },
  });
  res.json({ ticket: { ...ticket.toObject(), canReply: false } });
}
