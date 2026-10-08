import mongoose from 'mongoose';
import { AIRCRAFT_KEYS } from '../services/aircraft.js';
import { sandboxScope } from './plugins/sandboxScope.js';

const airportSchema = new mongoose.Schema(
  { code: { type: String, required: true, uppercase: true }, city: { type: String, required: true }, airport: String },
  { _id: false },
);

const fareOptionSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    cabinBaggageKg: { type: Number, default: 7 },
    checkinBaggageKg: { type: Number, default: 15 },
    cancellationPolicy: {
      freeUntilHoursBeforeDeparture: { type: Number, default: 0 },
      feeAfterCutoff: { type: Number, default: 0 },
    },
    dateChangeFee: { type: Number, default: 0 },
    seatsAvailable: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

// One dated departure of a Service (see Service.js). Flights without a serviceId are one-offs
// (only tests create those).
const flightSchema = new mongoose.Schema({
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
  date: { type: String, default: null }, // YYYY-MM-DD departure date (IST)
  aircraftConfig: { type: String, enum: [...AIRCRAFT_KEYS, null], default: null },
  status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
  salesStopped: { type: Boolean, default: false },
  airline: { type: String, required: true },
  flightNumber: { type: String, required: true },
  aircraftType: { type: String, default: 'Airbus A320neo' },
  origin: { type: airportSchema, required: true },
  destination: { type: airportSchema, required: true },
  departureTime: { type: Date, required: true },
  arrivalTime: { type: Date, required: true },
  durationMinutes: { type: Number, required: true },
  stops: { type: Number, default: 0, min: 0 },
  fareOptions: { type: [fareOptionSchema], validate: (v) => v.length > 0 },
  mealOptions: [{ _id: false, name: String, price: Number, isVeg: Boolean }],
  seatMap: {
    rows: { type: Number, default: 30 },
    columns: { type: Number, default: 6 },
    unavailableSeats: { type: [String], default: [] },
    seatPricing: {
      window: { type: Number, default: 0 },
      aisle: { type: Number, default: 0 },
      middle: { type: Number, default: 0 },
    },
  },
  rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
});

flightSchema.plugin(sandboxScope);
flightSchema.index({ 'origin.code': 1, 'destination.code': 1, departureTime: 1 });
flightSchema.index(
  { sandboxId: 1, serviceId: 1, date: 1 },
  { unique: true, partialFilterExpression: { serviceId: { $type: 'objectId' } } },
);

export default mongoose.model('Flight', flightSchema);
