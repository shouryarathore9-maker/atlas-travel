import Notification, { NOTIFICATIONS_PER_USER } from '../models/Notification.js';
import User, { MANAGER_ROLES } from '../models/User.js';

// In-app notifications. Failures here are logged, never thrown: a missed notification must not
// undo a booking or a cancellation that has already happened.

export async function notifyUsers(userIds, { type, title, body = '', link = '' }) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (!ids.length) return;
  try {
    await Notification.insertMany(ids.map((userId) => ({ userId, type, title, body, link })));
  } catch (err) {
    console.error('notify failed', type, err.message);
  }
}

export const notifyUser = (userId, message) => notifyUsers([userId], message);

// Notifies the manager account(s) of a supplier.
export async function notifySupplier(supplierId, message) {
  if (!supplierId) return;
  const managers = await User.find({ supplierId, role: { $in: MANAGER_ROLES } }, { _id: 1 }).lean();
  await notifyUsers(
    managers.map((m) => m._id),
    message,
  );
}

// Daily job: keeps at most NOTIFICATIONS_PER_USER per user (the TTL index handles age).
export async function trimNotifications() {
  const heavy = await Notification.aggregate([
    { $group: { _id: '$userId', n: { $sum: 1 } } },
    { $match: { n: { $gt: NOTIFICATIONS_PER_USER } } },
  ]);
  let removed = 0;
  for (const { _id: userId } of heavy) {
    const keep = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(NOTIFICATIONS_PER_USER).select('_id').lean();
    const result = await Notification.deleteMany({ userId, _id: { $nin: keep.map((n) => n._id) } });
    removed += result.deletedCount;
  }
  return removed;
}
