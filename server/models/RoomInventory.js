import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// Hotel rooms night by night (architecture.md §4 → RoomInventory): one document per room type, with a
// date → rooms booked map and a date → stopped map ('YYYY-MM-DD' IST nights). A booking increments
// every night it covers in one conditional update, which fails if any night is full or stopped, so two
// guests can never get the last room. `total` mirrors the room type's roomsTotal on the hotel.
const roomInventorySchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    roomTypeName: { type: String, required: true },
    total: { type: Number, required: true, min: 0 },
    booked: { type: mongoose.Schema.Types.Mixed, default: {} }, // { '2026-10-12': 3 }
    stopSell: { type: mongoose.Schema.Types.Mixed, default: {} }, // { '2026-11-01': true }
  },
  { minimize: false },
);

roomInventorySchema.plugin(sandboxScope);
roomInventorySchema.index({ sandboxId: 1, hotelId: 1, roomTypeName: 1 }, { unique: true });

export default mongoose.model('RoomInventory', roomInventorySchema);
