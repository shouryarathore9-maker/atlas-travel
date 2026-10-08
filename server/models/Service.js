import mongoose from 'mongoose';
import { AIRCRAFT_KEYS } from '../services/aircraft.js';
import { sandboxScope } from './plugins/sandboxScope.js';

const airportSchema = new mongoose.Schema(
  { code: { type: String, required: true, uppercase: true }, city: { type: String, required: true }, airport: String },
  { _id: false },
);

// A recurring flight. The daily job materialises its dated departures (Flight documents)
// inside the 60-day booking window.
const serviceSchema = new mongoose.Schema({
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  airline: { type: String, required: true },
  flightNumber: { type: String, required: true },
  origin: { type: airportSchema, required: true },
  destination: { type: airportSchema, required: true },
  aircraftConfig: { type: String, enum: AIRCRAFT_KEYS, required: true },
  departureMinute: { type: Number, required: true, min: 0, max: 1439 }, // minutes after midnight, IST
  durationMinutes: { type: Number, required: true, min: 20, max: 900 },
  stops: { type: Number, default: 0, min: 0, max: 2 },
  daysOfWeek: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
  startDate: { type: String, required: true }, // YYYY-MM-DD (IST)
  endDate: { type: String, default: null },
  status: { type: String, enum: ['active', 'discontinued'], default: 'active' },
  rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
});

serviceSchema.plugin(sandboxScope);
serviceSchema.index({ sandboxId: 1, supplierId: 1, flightNumber: 1 }, { unique: true });

export default mongoose.model('Service', serviceSchema);
