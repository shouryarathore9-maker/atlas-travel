import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// Room prices are NOT stored here: they come from the hotel's rate card (base rate per room type)
// through the pricing engine, night by night. Cancellation terms come from platform templates.
const roomTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    occupancy: { adults: { type: Number, default: 2 }, children: { type: Number, default: 0 } },
    bedType: { type: String, default: 'King bed' },
    amenities: [String],
    breakfastIncluded: { type: Boolean, default: false },
    taxesAndFees: { type: Number, default: 0 }, // fixed, per room, per night
    roomsAvailable: { type: Number, required: true, min: 0 }, // counter: −booking, +cancellation, +after check-out
    roomsTotal: { type: Number, default: null, min: 0 }, // rooms of this type in the hotel (occupancy)
    salesStopped: { type: Boolean, default: false },
  },
  { _id: false },
);

const hotelSchema = new mongoose.Schema({
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
  salesStopped: { type: Boolean, default: false },
  name: { type: String, required: true },
  city: { type: String, required: true, index: true },
  address: String,
  description: String,
  starRating: { type: Number, min: 1, max: 5, required: true },
  amenities: [String],
  photos: [String],
  roomTypes: { type: [roomTypeSchema], validate: (v) => v.length > 0 },
  rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
});

hotelSchema.plugin(sandboxScope);

export default mongoose.model('Hotel', hotelSchema);
