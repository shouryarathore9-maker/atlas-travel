import mongoose from 'mongoose';
import { AIRCRAFT_KEYS } from '../services/aircraft.js';
import { sandboxScope } from './plugins/sandboxScope.js';

const airportSchema = new mongoose.Schema(
  { code: { type: String, required: true, uppercase: true }, city: { type: String, required: true }, airport: String },
  { _id: false },
);

const cabinSchema = new mongoose.Schema(
  {
    capacity: { type: Number, required: true, min: 0 }, // seats on sale (configuration minus airline-blocked seats)
    sold: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

// One dated departure of a Service. Prices, fare tiers, seat fees and meals are NOT stored here:
// they come from the airline's rate card and policies whenever the flight is priced
// (architecture.md §12). Flights without a serviceId are one-offs (only tests create those).
const flightSchema = new mongoose.Schema({
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
  date: { type: String, default: null }, // YYYY-MM-DD departure date (IST)
  aircraftConfig: { type: String, enum: AIRCRAFT_KEYS, required: true },
  airline: { type: String, required: true },
  flightNumber: { type: String, required: true },
  aircraftType: { type: String, default: 'Airbus A320neo' },
  origin: { type: airportSchema, required: true },
  destination: { type: airportSchema, required: true },
  departureTime: { type: Date, required: true },
  arrivalTime: { type: Date, required: true },
  durationMinutes: { type: Number, required: true },
  stops: { type: Number, default: 0, min: 0 },
  cabins: {
    economy: { type: cabinSchema, required: true },
    business: { type: cabinSchema, default: null },
  },
  // One bounded array of taken ∪ airline-blocked seats (never a document per seat).
  seatMap: {
    unavailableSeats: { type: [String], default: [] },
    blockedSeats: { type: [String], default: [] },
  },
  status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
  salesStopped: { type: Boolean, default: false },
  scheduleChange: {
    type: new mongoose.Schema({ previousDeparture: Date, previousArrival: Date, changedAt: Date }, { _id: false }),
    default: null,
  },
  cancellationJob: {
    type: new mongoose.Schema({ state: { type: String, enum: ['pending', 'done'] }, reason: String, startedAt: Date, processed: Number }, { _id: false }),
    default: null,
  },
  checkInSeq: { type: Number, default: 0 },
  rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
});

flightSchema.plugin(sandboxScope);
flightSchema.index({ 'origin.code': 1, 'destination.code': 1, departureTime: 1 });
flightSchema.index({ supplierId: 1, departureTime: 1 });
flightSchema.index(
  { sandboxId: 1, serviceId: 1, date: 1 },
  { unique: true, partialFilterExpression: { serviceId: { $type: 'objectId' } } },
);
flightSchema.index({ 'cancellationJob.state': 1 }, { partialFilterExpression: { 'cancellationJob.state': 'pending' } });

export default mongoose.model('Flight', flightSchema);
