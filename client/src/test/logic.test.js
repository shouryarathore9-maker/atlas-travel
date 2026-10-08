import { describe, expect, it } from 'vitest';
import { validateCard } from '../components/MockPayment.jsx';
import { validateFlightSearch } from '../components/FlightSearchForm.jsx';
import { validateHotelSearch } from '../components/HotelSearchForm.jsx';
import { addDays, todayIst } from '../lib/dates.js';
import { flightBreakdown, partyLabel, readParty, roomFits, seatPrice } from '../lib/pricing.js';
import { estimateRefund, isCancellable, validateDetails, validateSignup } from '../lib/validation.js';

// The economy cabin of an A321neo two-class (server/services/aircraft.js).
const seatMap = {
  rows: [5, 6, 12, 15],
  layout: ['A', 'B', 'C', '', 'D', 'E', 'F'],
  extraLegroomRows: [5, 15, 16],
  fees: { window: 350, aisle: 300, middle: 0, extraLegroom: 600 },
};
const meals = [{ name: 'Biryani', price: 350 }];

describe('pricing (mirrors the server)', () => {
  it('prices seats by kind, using the cabin layout', () => {
    expect(seatPrice(seatMap, '12A')).toBe(350);
    expect(seatPrice(seatMap, '12C')).toBe(300); // next to the aisle
    expect(seatPrice(seatMap, '12D')).toBe(300);
    expect(seatPrice(seatMap, '12B')).toBe(0);
    expect(seatPrice(seatMap, '15B')).toBe(600); // extra-legroom row
    expect(seatPrice(seatMap, '')).toBe(0);
  });

  it('builds the same breakdown the server test expects, with infants', () => {
    const tier = { price: 6000 };
    expect(flightBreakdown({ tier, travellers: [{ ageCategory: 'adult', seat: '12A', meal: 'Biryani' }], seatMap, meals, taxRate: 0.12, infantFee: 1500 })).toMatchObject({
      base: 6000,
      taxes: 720,
      seats: 350,
      meals: 350,
      total: 7420,
    });
    const family = [{ ageCategory: 'adult' }, { ageCategory: 'child' }, { ageCategory: 'infant' }];
    expect(flightBreakdown({ tier: { price: 5000 }, travellers: family, seatMap, meals, taxRate: 0.12, infantFee: 1500 })).toMatchObject({ base: 10000, infantFees: 1500, taxes: 1200, total: 12700 });
  });

  it('reads the party from the URL (travellers is the old name for adults)', () => {
    expect(readParty(new URLSearchParams('travellers=2'))).toEqual({ adults: 2, children: 0, infants: 0 });
    expect(readParty(new URLSearchParams('adults=1&infants=3'))).toEqual({ adults: 1, children: 0, infants: 1 });
    expect(partyLabel({ adults: 2, children: 1, infants: 1 })).toBe('2 adults · 1 child · 1 infant');
  });

  it('checks whether rooms can hold the party', () => {
    const room = { occupancy: { adults: 2, children: 1 } };
    expect(roomFits(room, { adults: 3, children: 0, rooms: 2 })).toBe(true);
    expect(roomFits(room, { adults: 3, children: 0, rooms: 1 })).toBe(false);
  });
});

describe('search validation', () => {
  const tomorrow = addDays(todayIst(), 1);

  it('flags the first missing flight field', () => {
    expect(validateFlightSearch({ origin: '', destination: 'BOM', date: tomorrow }).field).toBe('origin');
    expect(validateFlightSearch({ origin: 'DEL', destination: 'DEL', date: tomorrow }).field).toBe('destination');
    expect(validateFlightSearch({ origin: 'DEL', destination: 'BOM', date: tomorrow })).toBeNull();
  });

  it('blocks check-out before check-in', () => {
    const result = validateHotelSearch({ city: 'Mumbai', checkIn: addDays(tomorrow, 2), checkOut: tomorrow, adults: 2, rooms: 1 });
    expect(result).toEqual({ field: 'checkOut', message: 'Check-out must be after check-in' });
  });
});

describe('form validation', () => {
  it('validates signup fields', () => {
    expect(validateSignup({ name: '', email: 'x', password: 'short', phone: '12' })).toEqual({
      name: 'Enter your name',
      email: 'Enter a valid email address',
      password: 'Use at least 8 characters',
      phone: 'Enter a 10-digit mobile number',
    });
    expect(validateSignup({ name: 'Priya', email: 'p@x.in', password: 'Travel2026', phone: '' })).toEqual({});
  });

  it('requires first and last names and valid contact details', () => {
    const errors = validateDetails({ people: [{ firstName: '', lastName: 'R2' }], email: 'bad', phone: '123', specialRequest: '' });
    expect(Object.keys(errors)).toEqual(['people.0.firstName', 'people.0.lastName', 'email', 'phone']);
  });

  it('flags duplicate travellers after normalising names', () => {
    const errors = validateDetails({ people: [{ firstName: 'Ravi', lastName: 'Kumar' }, { firstName: ' ravi ', lastName: 'KUMAR' }], email: 'a@b.in', phone: '9876543210', specialRequest: '' });
    expect(errors['people.1.lastName']).toMatch(/middle name or suffix/);
  });

  it('checks the flight party', () => {
    const tomorrow = addDays(todayIst(), 1);
    expect(validateFlightSearch({ origin: 'DEL', destination: 'BOM', date: tomorrow, adults: 1, infants: 2 }).message).toMatch(/infant needs an adult/);
    expect(validateFlightSearch({ origin: 'DEL', destination: 'BOM', date: tomorrow, adults: 5, children: 5 }).field).toBe('party');
  });

  it('validates card format only', () => {
    expect(validateCard({ number: '4242 4242 4242 4242', expiry: '12/40', cvv: '123', name: 'Priya' })).toEqual({});
    expect(Object.keys(validateCard({ number: '4242', expiry: '01/20', cvv: '1', name: '' }))).toEqual(['number', 'expiry', 'cvv', 'name']);
  });
});

describe('cancellation', () => {
  const future = new Date(Date.now() + 5 * 86400000).toISOString();
  it('refunds in full before the cutoff and minus the fee after', () => {
    const booking = { fareBreakdown: { total: 7000 }, policySnapshot: { freeUntil: future, feeAfterCutoff: 1500 } };
    expect(estimateRefund(booking)).toBe(7000);
    expect(estimateRefund({ ...booking, policySnapshot: { freeUntil: new Date(0).toISOString(), feeAfterCutoff: 1500 } })).toBe(5500);
  });

  it('only allows cancelling confirmed future trips', () => {
    expect(isCancellable({ status: 'confirmed', travelDates: { start: future } })).toBe(true);
    expect(isCancellable({ status: 'cancelled', travelDates: { start: future } })).toBe(false);
    expect(isCancellable({ status: 'confirmed', travelDates: { start: new Date(0).toISOString() } })).toBe(false);
  });
});
