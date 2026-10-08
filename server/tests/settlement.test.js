// Stage 6: monthly settlement statements, funding split, queries and adjustments, mark as paid.
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Config from '../models/Config.js';
import Notification from '../models/Notification.js';
import Statement from '../models/Statement.js';
import { runDailyJob } from '../services/dailyJob.js';
import { bookingLine, closeStatements, istPeriod, periodStart, shiftPeriod } from '../services/settlement.js';
import { loggedInAgent, supplierWithManager } from './helpers.js';

let seq = 0;
// A flight booking: ₹10,000 base, ₹500 seats, ₹300 meals, ₹1,200 taxes; travel ends at `end`.
function flightDoc(supplierId, end, overrides = {}) {
  const discount = overrides.discount || 0;
  return {
    userId: new mongoose.Types.ObjectId(),
    supplierId,
    type: 'flight',
    itemId: new mongoose.Types.ObjectId(),
    bookingReference: `ATST${String(++seq).padStart(4, '0')}`,
    travelDates: { start: new Date(end.getTime() - 2 * 3600e3), end },
    itemSummary: { title: 'Delhi → Mumbai', subtitle: 'IndiGo 6E 204 · Saver' },
    fareBreakdown: { base: 10000, seatCharges: 500, mealCharges: 300, infantFees: 0, breakfast: 0, addons: 800, discounts: discount, taxes: 1200, total: 12000 - discount },
    offer: overrides.funder ? { title: 'Test offer', amount: discount, funder: overrides.funder } : null,
    status: overrides.status || 'confirmed',
    cancellation: overrides.cancellation,
  };
}

describe('statement lines (pure)', () => {
  const end = new Date('2026-09-10T10:00:00Z');
  it('no offer: commission on base + seats + meals, taxes pass through', () => {
    const line = bookingLine(flightDoc(null, end), 0.1);
    expect(line).toMatchObject({ kind: 'completed', gross: 12000, commission: 1080, net: 10920, atlasTake: 1080 });
  });
  it('platform-funded offer: supplier paid as if no offer, Atlas absorbs the discount', () => {
    const line = bookingLine(flightDoc(null, end, { discount: 1500, funder: 'platform' }), 0.1);
    expect(line).toMatchObject({ gross: 12000, discountPlatform: 1500, commission: 1080, net: 10920, atlasTake: -420 });
  });
  it('supplier-funded offer: discount off the supplier side, commission on the discounted amount', () => {
    const line = bookingLine(flightDoc(null, end, { discount: 1000, funder: 'supplier' }), 0.1);
    expect(line).toMatchObject({ gross: 12000, discountSupplier: 1000, commission: 980, net: 10020, atlasTake: 980 });
  });
  it('cancellations: a retained fee is commissioned; supplier cancellations are zero lines; full refunds are skipped', () => {
    const fee = bookingLine(flightDoc(null, end, { status: 'cancelled', cancellation: { by: 'traveller', cancelledAt: end, refundAmount: 8500, feeRetained: 3500 } }), 0.1);
    expect(fee).toMatchObject({ kind: 'cancellation_fee', refunds: 8500, commission: 350, net: 3150 });
    const supplier = bookingLine(flightDoc(null, end, { status: 'cancelled', cancellation: { by: 'supplier', cancelledAt: end, refundAmount: 12000, feeRetained: 0 } }), 0.1);
    expect(supplier).toMatchObject({ kind: 'supplier_cancelled', refunds: 12000, net: 0, commission: 0 });
    expect(bookingLine(flightDoc(null, end, { status: 'cancelled', cancellation: { by: 'traveller', cancelledAt: end, refundAmount: 12000, feeRetained: 0 } }), 0.1)).toBeNull();
  });
});

describe('closing a month', () => {
  // Pretend "now" is the 2nd of next month, so the current month is the one being closed.
  const thisPeriod = istPeriod();
  const closingNow = periodStart(shiftPeriod(thisPeriod, 1)).getTime() + 30 * 3600e3;
  const inPeriod = new Date(periodStart(thisPeriod).getTime() + 3600e3);

  it('creates one frozen statement per supplier, is idempotent, and notifies the manager', async () => {
    const { supplier, agent } = await supplierWithManager('airline');
    const other = await supplierWithManager('airline', { name: 'SpiceJet', code: 'SG' });
    await Booking.create([
      flightDoc(supplier._id, inPeriod),
      flightDoc(supplier._id, inPeriod, { discount: 1500, funder: 'platform' }),
      flightDoc(supplier._id, inPeriod, { status: 'cancelled', cancellation: { by: 'traveller', cancelledAt: inPeriod, refundAmount: 8500, feeRetained: 3500 } }),
      flightDoc(supplier._id, new Date(closingNow + 5 * 864e5)), // not travelled yet
      flightDoc(other.supplier._id, inPeriod),
    ]);
    await Config.create({ key: 'commissionRate', value: 0.12 });

    const first = await closeStatements({ now: closingNow });
    expect(first).toEqual({ period: thisPeriod, created: 2 });
    expect(await closeStatements({ now: closingNow })).toEqual({ period: thisPeriod, created: 0 }); // idempotent
    const statement = await Statement.findOne({ supplierId: supplier._id }).lean();
    expect(statement.commissionRate).toBe(0.12);
    expect(statement.lines.map((l) => l.kind).sort()).toEqual(['cancellation_fee', 'completed', 'completed']);
    expect(statement.totals.net).toBe(statement.lines.reduce((s, l) => s + l.net, 0));
    expect(await Booking.countDocuments({ supplierId: supplier._id, settlement: null })).toBe(1); // the future trip
    expect(await Notification.countDocuments({ type: 'statement.ready' })).toBe(2);

    // The manager sees only their own statements.
    const list = (await agent.get('/api/supplier/statements').expect(200)).body.statements;
    expect(list).toHaveLength(1);
    expect(list[0].lines).toBeUndefined();
    await agent.get(`/api/supplier/statements/${statement._id}`).expect(200);
    const otherStatement = await Statement.findOne({ supplierId: other.supplier._id });
    await agent.get(`/api/supplier/statements/${otherStatement._id}`).expect(404);
  });

  it('query → adjustment on the next statement; mark as paid once; all audit-logged', async () => {
    const { supplier, agent } = await supplierWithManager('airline');
    const [booking] = await Booking.create([flightDoc(supplier._id, inPeriod)]);
    await closeStatements({ now: closingNow });
    const statement = await Statement.findOne({ supplierId: supplier._id }).lean();

    await agent.post(`/api/supplier/statements/${statement._id}/lines/NOPE1234/query`).send({ note: 'This line looks wrong to us' }).expect(404);
    await agent.post(`/api/supplier/statements/${statement._id}/lines/${booking.bookingReference}/query`).send({ note: 'short' }).expect(400);
    const query = await agent.post(`/api/supplier/statements/${statement._id}/lines/${booking.bookingReference}/query`).send({ note: 'The meal charge was refunded to the traveller.' }).expect(201);
    await agent.post(`/api/supplier/statements/${statement._id}/lines/${booking.bookingReference}/query`).send({ note: 'Asking a second time now' }).expect(409);
    expect((await agent.get('/api/supplier/tickets').expect(200)).body.tickets.map((t) => t.type)).toContain('statement_query');

    const admin = await loggedInAgent({ role: 'admin' });
    await admin.post(`/api/admin/tickets/${query.body.ticket._id}/resolve`).send({ outcome: 'adjustment', note: 'Meal refunded' }).expect(400); // amount required
    await agent.post(`/api/admin/tickets/${query.body.ticket._id}/resolve`).send({ outcome: 'no_change', note: 'x' }).expect(403);
    await admin.post(`/api/admin/tickets/${query.body.ticket._id}/resolve`).send({ outcome: 'adjustment', amount: 300, note: 'Meal refunded' }).expect(200);
    await admin.post(`/api/admin/tickets/${query.body.ticket._id}/resolve`).send({ outcome: 'no_change', note: 'Again' }).expect(409);

    // The adjustment lands on the next month's statement, even with no bookings that month.
    const nextNow = periodStart(shiftPeriod(thisPeriod, 2)).getTime() + 30 * 3600e3;
    await closeStatements({ now: nextNow });
    const next = await Statement.findOne({ supplierId: supplier._id, period: shiftPeriod(thisPeriod, 1) }).lean();
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]).toMatchObject({ kind: 'adjustment', net: 300, bookingReference: booking.bookingReference });

    await admin.post(`/api/admin/statements/${statement._id}/mark-paid`).send({ paymentRef: 'x' }).expect(400);
    await admin.post(`/api/admin/statements/${statement._id}/mark-paid`).send({ paymentRef: 'ATLPAY-0001' }).expect(200);
    await admin.post(`/api/admin/statements/${statement._id}/mark-paid`).send({ paymentRef: 'ATLPAY-0002' }).expect(409);
    await agent.post(`/api/admin/statements/${statement._id}/mark-paid`).send({ paymentRef: 'ATLPAY-0003' }).expect(403);
    const list = (await admin.get('/api/admin/statements').query({ supplierId: String(supplier._id) }).expect(200)).body;
    expect(list.items.map((s) => s.status).sort()).toEqual(['paid', 'ready']);
    expect((await Statement.findById(statement._id)).lines).toHaveLength(1); // lines never change

    const actions = (await AuditLog.find({}).lean()).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['statement.query', 'statement.adjustment', 'statement.mark_paid']));
  });

  it('runs as a daily job step', async () => {
    const { supplier } = await supplierWithManager('airline');
    await Booking.create([flightDoc(supplier._id, inPeriod)]);
    const run = await runDailyJob({ now: closingNow });
    expect(run.results.statements).toEqual({ period: thisPeriod, created: 1 });
  });
});
