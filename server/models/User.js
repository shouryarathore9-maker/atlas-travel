import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

export const ROLES = ['traveler', 'airline_manager', 'hotel_manager', 'admin'];
export const MANAGER_ROLES = ['airline_manager', 'hotel_manager'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: '' },
    countryCode: { type: String, default: '+91' },
    role: { type: String, enum: ROLES, default: 'traveler' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null }, // managers only
    savedTravellers: [{ _id: false, name: String, ageCategory: String }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

userSchema.plugin(sandboxScope);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    phone: this.phone,
    countryCode: this.countryCode,
    role: this.role,
    supplierId: this.supplierId ? String(this.supplierId) : null,
    savedTravellers: this.savedTravellers,
  };
};

export default mongoose.model('User', userSchema);
