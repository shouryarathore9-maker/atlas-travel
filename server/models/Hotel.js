import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

const roomTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    occupancy: { adults: { type: Number, default: 2 }, children: { type: Number, default: 0 } },
    bedType: { type: String, default: 'King bed' },
    amenities: [String],
    breakfastIncluded: { type: Boolean, default: false },
    price: { type: Number, required: true, min: 0 }, // per room, per night
    taxesAndFees: { type: Number, default: 0 }, // per room, per night
    // Deviation from architecture.md (freeUntilDate): a relative cutoff works for any stay date.
    cancellationPolicy: {
      freeUntilDaysBeforeCheckIn: { type: Number, default: 1 },
      feeAfterCutoff: { type: Number, default: 0 },
    },
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
