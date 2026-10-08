import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// A platform cancellation template (prd.md → Cancellation Templates). Admin edits apply to future
// bookings only — bookings keep the terms frozen in their policySnapshot.
// (typeKey '$type' because the fee object has its own field called "type".)
const templateSchema = new mongoose.Schema(
  {
    key: { $type: String, required: true },
    kind: { $type: String, enum: ['flight', 'hotel'], required: true },
    name: { $type: String, required: true },
    freeWindow: {
      $type: new mongoose.Schema({ unit: { $type: String, enum: ['hours', 'days'] }, value: Number }, { _id: false, typeKey: '$type' }),
      default: null,
    },
    fee: {
      type: { $type: String, enum: ['flat', 'oneNight', 'all'], required: true },
      amount: { $type: Number, default: 0 },
    },
    updatedAt: { $type: Date, default: Date.now },
  },
  { typeKey: '$type' },
);

templateSchema.plugin(sandboxScope);
templateSchema.index({ sandboxId: 1, key: 1 }, { unique: true });

export default mongoose.model('CancellationTemplate', templateSchema);
