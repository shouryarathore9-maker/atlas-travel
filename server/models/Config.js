import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// Platform settings edited by admin (currently the commission rate).
const configSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
});

configSchema.plugin(sandboxScope);
configSchema.index({ sandboxId: 1, key: 1 }, { unique: true });

const Config = mongoose.model('Config', configSchema);

export const DEFAULT_COMMISSION_RATE = 0.1;

export async function getCommissionRate() {
  const doc = await Config.findOne({ key: 'commissionRate' }).lean();
  return doc ? Number(doc.value) : DEFAULT_COMMISSION_RATE;
}

export default Config;
