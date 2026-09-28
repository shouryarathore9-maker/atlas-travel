import { describe, expect, it } from 'vitest';
import { validateCard } from '../components/MockPayment.jsx';
import { validateFlightSearch } from '../components/FlightSearchForm.jsx';
import { validateHotelSearch } from '../components/HotelSearchForm.jsx';
import { addDays, todayIst } from '../lib/dates.js';
import { flightBreakdown, roomFits, seatPrice } from '../lib/pricing.js';
import { estimateRefund, isCancellable, validateDetails, validateSignup } from '../lib/validation.js';

const flight = {
  fareOptions: [{ type: 'Flexi', price: 6000 }],
  mealOptions: [{ name: 'Biryani', price: 350 }],
  seatMap: { columns: 6, seatPricing: { window: 350, aisle: 300, middle: 0 } },
};

describe('pricing (mirrors the server)', () => {
  it('prices seats by position', () => {
    expect(seatPrice('12A', flight.seatMap)).toBe(350);
    expect(seatPrice('12C', flight.seatMap)).toBe(300);
    expect(seatPrice('12B', flight.seatMap)).toBe(0);
    expect(seatPrice('', flight.seatMap)).toBe(0);
  });

  it('builds the same breakdown the server test expects', () => {
    expect(flightBreakdown(flight, 'Flexi', [{ seat: '12A', meal: 'Biryani' }])).toMatchObject({ base: 6000, taxes: 720, addons: 700, total: 7420 });
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

  it('requires traveller names and valid contact details', () => {
    const errors = validateDetails({ people: [{ name: 'A' }], email: 'bad', phone: '123' });
    expect(Object.keys(errors)).toEqual(['people.0.name', 'email', 'phone']);
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
