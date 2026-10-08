import mongoose from 'mongoose';
import { sandboxScope } from './plugins/sandboxScope.js';

export const NOTIFICATION_TTL_DAYS = 90;
export const NOTIFICATIONS_PER_USER = 200;

// In-app notifications (prd.md → Workflow 10). Per recipient, temporary: deleted 90 days after
// creation, and the daily job trims anything beyond 200 per user.
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  title: { type: String, required: true, maxlength: 140 },
  body: { type: String, default: '', maxlength: 500 },
  link: { type: String, default: '' },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, expires: NOTIFICATION_TTL_DAYS * 24 * 3600 },
});

notificationSchema.plugin(sandboxScope);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

export default mongoose.model('Notification', notificationSchema);
