import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { HttpError } from '../utils/httpError.js';

// Double-tap guard for actions that create something (a ticket, a message, an offer, a service…):
// the same person sending the same request again within a few seconds is refused instead of
// creating a duplicate. Kept in MongoDB (any serverless instance sees it); entries expire on their own.
const WINDOW_SECONDS = 10;

const requestOnceSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  at: { type: Date, default: Date.now, expires: WINDOW_SECONDS },
});
const RequestOnce = mongoose.models.RequestOnce || mongoose.model('RequestOnce', requestOnceSchema);

export async function once(req, res, next) {
  const who = req.user?._id || req.ip;
  const key = crypto.createHash('sha256').update(`${who}|${req.method}|${req.originalUrl}|${JSON.stringify(req.body ?? {})}`).digest('hex');
  // Only a request that succeeded counts: if it was refused (invalid input, a conflict), the same
  // request can be sent again straight away once the problem is fixed.
  const releaseOnError = () =>
    res.on('finish', () => {
      if (res.statusCode >= 400) RequestOnce.deleteOne({ key }).catch(() => {});
    });
  try {
    await RequestOnce.init(); // the unique index must exist before the first insert
    await RequestOnce.create({ key });
    releaseOnError();
    return next();
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  // MongoDB removes expired entries only about once a minute, so check the age here: an entry older
  // than the window (a deliberate repeat) is renewed, a fresh one means a double-tap.
  const renewed = await RequestOnce.findOneAndUpdate({ key, at: { $lt: new Date(Date.now() - WINDOW_SECONDS * 1000) } }, { $set: { at: new Date() } });
  if (!renewed) throw new HttpError(409, 'That was already sent — give it a moment.', 'DUPLICATE_SUBMIT');
  releaseOnError();
  return next();
}
