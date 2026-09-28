import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: '' },
    countryCode: { type: String, default: '+91' },
    role: { type: String, enum: ['traveler', 'admin'], default: 'traveler' },
    savedTravellers: [{ _id: false, name: String, ageCategory: String }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    phone: this.phone,
    countryCode: this.countryCode,
    role: this.role,
    savedTravellers: this.savedTravellers,
  };
};

export default mongoose.model('User', userSchema);
