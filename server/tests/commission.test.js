// Commission defaults per product, per-supplier overrides (from next month), adjustments in detail:
// several lines per query, standalone adjustments, negative months carried forward, and analytics.
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import Adjustment from '../models/Adjustment.js';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import Notification from '../models/Notification.js';
import Statement from '../models/Statement.js';
import { entryAt, rateFor, scheduleChange } from '../services/commission.js';
import { closeStatements, istPeriod, periodStart, shiftPeriod } from '../services/settlement.js';
import { todayIstString } from '../utils/dates.js';
import { loggedInAgent, supplierWithManager } from './helpers.js';

let seq = 0;
// ₹10,000 commissionable, ₹12,000 total.
function flightDoc(supplierId, end, type = 'flight') {
  return {
    userId: new mongoose.Types.ObjectId(),
    supplierId,
    type,
    itemId: new mongoose.Types.ObjectId(),
    bookingReference: `ATCM${String(++seq).padStart(4, '0')}`,
    travelDates: { start: new Date(end.getTime() - 2 * 3600e3), end },
    itemSummary: { title: 'Delhi → Mumbai', subtitle: 'Test' },
    selection: type === 'hotel' ? { roomTypeName: 'Deluxe', rooms: 1 } : {},
    fareBreakdown: { base: 10000, seatCharges: 0, mealCharges: 0, infantFees: 0, breakfast: 0, addons: 0, discounts: 0, taxes: 2000, total: 12000 },
    status: 'confirmed',
  };
}

const thisPeriod = istPeriod();
const nextPeriod = shiftPeriod(thisPeriod, 1);
const closeAt = (period) => periodStart(shiftPeriod(period, 1)).getTime() + 30 * 3600e3;
const inside = (period) => new Date(periodStart(period).getTime() + 3600e3);

describe('commission schedule (pure)', () => {
  it('a change applies from next month, and setting the current rate again cancels it', () => {
    const now = Date.now();
    const list = [{ from: '2000-01', rate: 0.1 }];
    const changed = scheduleChange(list, 0.12, now);
    expect(entryAt(changed, thisPeriod).rate).toBe(0.1);
    expect(entryAt(changed, nextPeriod).rate).toBe(0.12);
    expect(scheduleChange(changed, 0.1, now)).toEqual(list);
    expect(scheduleChange(changed, 0.14, now)).toEqual([...list, { from: nextPeriod, rate: 0.14 }]);
  });

  it('an override wins over the product default; a null override means the default', () => {
    const schedule = { flight: [{ from: '2000-01', rate: 0.05 }], hotel: [{ from: '2000-01', rate: 0.15 }] };
    expect(rateFor(schedule, { kind: 'hotel' }, thisPeriod)).toEqual({ rate: 0.15, source: 'default' });
    expect(rateFor(schedule, { kind: 'airline', commissionOverrides: [{ from: '2000-01', rate: 0.02 }] }, thisPeriod)).toEqual({ rate: 0.02, source: 'override' });
    expect(rateFor(schedule, { kind: 'airline', commissionOverrides: [{ from: '2000-01', rate: 0.02 }, { from: nextPeriod, rate: null }] }, nextPeriod)).toEqual({ rate: 0.05, source: 'default' });
  });
});

describe('per-supplier commission', () => {
  it('admin sets an override from next month; statements use the rate in force for their month', async () => {
    const { supplier, agent } = await supplierWithManager('airline');
    const other = await supplierWithManager('airline', { name: 'SpiceJet', code: 'SG' });
    const admin = await loggedInAgent({ role: 'admin' });

    await admin.put(`/api/admin/suppliers/${supplier._id}/commission`).send({ rate: 0.5 }).expect(400); // guard rail
    await agent.put(`/api/admin/suppliers/${supplier._id}/commission`).send({ rate: 0.08 }).expect(403);
    await admin.put(`/api/admin/suppliers/${new mongoose.Types.ObjectId()}/commission`).send({ rate: 0.08 }).expect(404);
    const res = (await admin.put(`/api/admin/suppliers/${supplier._id}/commission`).send({ rate: 0.08 }).expect(200)).body;
    expect(res.commission).toMatchObject({ current: { rate: 0.1, source: 'default' }, upcoming: { rate: 0.08, source: 'override', from: nextPeriod } });

    // Audit: who, old and new; the manager is told and sees it read-only.
    const entry = await AuditLog.findOne({ action: 'commission.override' }).lean();
    expect(entry).toMatchObject({ actorRole: 'admin', supplierId: supplier._id, before: { rate: 0.1, source: 'default' }, after: { rate: 0.08, source: 'override' } });
    expect(await Notification.countDocuments({ type: 'commission.changed' })).toBe(1);
    const mine = (await agent.get('/api/supplier/statements').expect(200)).body;
    expect(mine.commission).toMatchObject({ current: { rate: 0.1 }, upcoming: { rate: 0.08, from: nextPeriod } });

    // Product default changes don't touch the overridden supplier's next month.
    await admin.put('/api/admin/settings/commission').send({ flight: 0.05, hotel: 0.15 }).expect(200);
    expect(await Notification.countDocuments({ type: 'commission.changed' })).toBe(2); // only the other airline

    // This month closes at the old rate; next month at the override (and the other airline at the new default).
    await Booking.create([flightDoc(supplier._id, inside(thisPeriod)), flightDoc(supplier._id, inside(nextPeriod)), flightDoc(other.supplier._id, inside(nextPeriod))]);
    await closeStatements({ now: closeAt(thisPeriod) });
    await closeStatements({ now: closeAt(nextPeriod) });
    const rates = await Statement.find({}, { supplierId: 1, period: 1, commissionRate: 1, 'totals.commission': 1 }).sort({ period: 1 }).lean();
    expect(rates.map((s) => [String(s.supplierId) === String(supplier._id) ? 'own' : 'other', s.period, s.commissionRate, s.totals.commission])).toEqual(
      expect.arrayContaining([
        ['own', thisPeriod, 0.1, 1000],
        ['own', nextPeriod, 0.08, 800],
        ['other', nextPeriod, 0.05, 500],
      ]),
    );

    // Switching back to the default is also scheduled, and a frozen statement never changes.
    await admin.put(`/api/admin/suppliers/${supplier._id}/commission`).send({ rate: null }).expect(200);
    expect((await Statement.findOne({ supplierId: supplier._id, period: thisPeriod }).lean()).commissionRate).toBe(0.1);
  });
});

describe('adjustments', () => {
  it('one query can be resolved with several lines; they land on the next statement below commission', async () => {
    const { supplier, agent } = await supplierWithManager('airline');
    const [booking] = await Booking.create([flightDoc(supplier._id, inside(thisPeriod))]);
    await closeStatements({ now: closeAt(thisPeriod) });
    const statement = await Statement.findOne({ supplierId: supplier._id }).lean();
    const query = await agent.post(`/api/supplier/statements/${statement._id}/lines/${booking.bookingReference}/query`).send({ note: 'Two charges here look wrong.' }).expect(201);
    const admin = await loggedInAgent({ role: 'admin' });
    const lines = [
      { amount: 300, note: 'Meal refunded at the airport' },
      { amount: -100, note: 'Seat fee charged twice' },
    ];
    await admin.post(`/api/admin/tickets/${query.body.ticket._id}/resolve`).send({ outcome: 'adjustment', note: 'Both corrected', adjustments: [...lines, ...lines, ...lines] }).expect(400); // at most 5
    await admin.post(`/api/admin/tickets/${query.body.ticket._id}/resolve`).send({ outcome: 'adjustment', note: 'Both corrected', adjustments: [{ amount: 0, note: 'Nothing' }] }).expect(400);
    await admin.post(`/api/admin/tickets/${query.body.ticket._id}/resolve`).send({ outcome: 'adjustment', note: 'Both corrected', adjustments: lines }).expect(200);
    expect(await Adjustment.countDocuments({ ticketId: query.body.ticket._id })).toBe(2);
    // The manager sees what's coming.
    expect((await agent.get('/api/supplier/statements').expect(200)).body.pendingAdjustments).toHaveLength(2);

    await closeStatements({ now: closeAt(nextPeriod) });
    const next = await Statement.findOne({ supplierId: supplier._id, period: nextPeriod }).lean();
    expect(next.lines.map((l) => [l.kind, l.net, l.note])).toEqual([
      ['adjustment', 300, 'Meal refunded at the airport'],
      ['adjustment', -100, 'Seat fee charged twice'],
    ]);
    expect(next.totals).toMatchObject({ adjustments: 200, commission: 0, net: 200, atlasTake: -200 });
  });

  it('admin adds a standalone adjustment; the booking must be that supplier’s', async () => {
    const { supplier } = await supplierWithManager('hotel');
    const other = await supplierWithManager('airline');
    const [own] = await Booking.create([flightDoc(supplier._id, inside(thisPeriod), 'hotel')]);
    const [theirs] = await Booking.create([flightDoc(other.supplier._id, inside(thisPeriod))]);
    const admin = await loggedInAgent({ role: 'admin' });
    const body = { supplierId: String(supplier._id), amount: 250, note: 'Late check-out fee waived by Atlas support' };
    await admin.post('/api/admin/adjustments').send({ ...body, bookingReference: theirs.bookingReference }).expect(400);
    await admin.post('/api/admin/adjustments').send({ ...body, note: '' }).expect(400);
    await other.agent.post('/api/admin/adjustments').send(body).expect(403);
    await admin.post('/api/admin/adjustments').send({ ...body, bookingReference: own.bookingReference.toLowerCase() }).expect(201);
    const pending = (await admin.get('/api/admin/statements').expect(200)).body.pendingAdjustments;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ amount: 250, bookingReference: own.bookingReference, createdBy: expect.any(String) });
    expect(await AuditLog.countDocuments({ action: 'statement.adjustment' })).toBe(1);
  });

  it('a month that ends below zero is carried forward, can’t be marked paid, and opens the next statement', async () => {
    const { supplier } = await supplierWithManager('airline');
    const admin = await loggedInAgent({ role: 'admin' });
    await Booking.create([flightDoc(supplier._id, inside(thisPeriod))]); // net 12,000 − 1,000 commission
    await admin.post('/api/admin/adjustments').send({ supplierId: String(supplier._id), amount: -15000, note: 'Overpaid on an earlier statement' }).expect(201);
    await closeStatements({ now: closeAt(thisPeriod) });
    const carried = await Statement.findOne({ supplierId: supplier._id, period: thisPeriod }).lean();
    expect(carried).toMatchObject({ status: 'carried', totals: { net: -4000, adjustments: -15000 } });
    await admin.post(`/api/admin/statements/${carried._id}/mark-paid`).send({ paymentRef: 'ATLPAY-0001' }).expect(409);
    expect(await Adjustment.countDocuments({ kind: 'balance' })).toBe(1);
    await closeStatements({ now: closeAt(thisPeriod) }); // re-run: still one balance
    expect(await Adjustment.countDocuments({ kind: 'balance' })).toBe(1);

    await Booking.create([flightDoc(supplier._id, inside(nextPeriod))]);
    await closeStatements({ now: closeAt(nextPeriod) });
    const next = await Statement.findOne({ supplierId: supplier._id, period: nextPeriod }).lean();
    expect(next.lines[0]).toMatchObject({ kind: 'balance', net: -4000, atlasTake: 0 });
    expect(next).toMatchObject({ status: 'ready', totals: { balance: -4000, net: 11000 - 4000 } });
  });

  it('analytics count an adjustment against net revenue in its statement’s month', async () => {
    const { supplier } = await supplierWithManager('airline');
    const admin = await loggedInAgent({ role: 'admin' });
    const end = inside(thisPeriod);
    await Booking.create([flightDoc(supplier._id, end)]);
    await admin.post('/api/admin/adjustments').send({ supplierId: String(supplier._id), amount: 400, note: 'Goodwill refund paid by the airline' }).expect(201);
    const today = todayIstString();
    const range = { range: 'custom', from: `${thisPeriod}-01`, to: today };
    const before = (await admin.get('/api/admin/analytics').query(range).expect(200)).body.kpis.current.netRevenue;
    await closeStatements({ now: closeAt(thisPeriod) });
    const after = (await admin.get('/api/admin/analytics').query(range).expect(200)).body.kpis.current.netRevenue;
    expect(before - after).toBe(400);
  });
});
