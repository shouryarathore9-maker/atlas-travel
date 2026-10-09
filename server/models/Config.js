import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

// Platform settings edited by admin: the commission schedule ('commission'; services/commission.js),
// the legacy single rate it replaced ('commissionRate') and the pricing limits ('pricingLimits').
const configSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
});

configSchema.plugin(sandboxScope);
configSchema.index({ sandboxId: 1, key: 1 }, { unique: true });

const Config = mongoose.model('Config', configSchema);

export const DEFAULT_COMMISSION_RATE = 0.1;

export default Config;
