import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { HttpError } from '../utils/httpError.js';

// The bell polls this, so it's one indexed count plus the latest 20.
export async function listNotifications(req, res) {
  const userId = req.user._id;
  const [notifications, unread] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  res.json({ notifications, unread });
}

export async function unreadCount(req, res) {
  res.json({ unread: await Notification.countDocuments({ userId: req.user._id, readAt: null }) });
}

export async function markRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Notification not found', 'NOT_FOUND');
  // Scoped to the recipient: someone else's notification id behaves like a missing one.
  const result = await Notification.updateOne({ _id: req.params.id, userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  if (!result.matchedCount && !(await Notification.exists({ _id: req.params.id, userId: req.user._id }))) {
    throw new HttpError(404, 'Notification not found', 'NOT_FOUND');
  }
  res.json({ ok: true });
}

export async function markAllRead(req, res) {
  await Notification.updateMany({ userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
}
