import mongoose from 'mongoose';

// A lease-style lock so a scheduled job never runs twice at the same time
// (Vercel Cron can occasionally deliver the same run more than once).
const jobLockSchema = new mongoose.Schema(
  { _id: { type: String }, lockedUntil: { type: Date, required: true } },
  { versionKey: false },
);

const JobLock = mongoose.model('JobLock', jobLockSchema, 'joblocks');

// Returns true if the lock was taken. If a previous holder crashed, its lease simply expires.
export async function acquireLock(name, ttlMs, now = new Date()) {
  try {
    await JobLock.findOneAndUpdate(
      { _id: name, lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // document exists and is still locked
    throw err;
  }
}

export async function releaseLock(name) {
  await JobLock.updateOne({ _id: name }, { $set: { lockedUntil: new Date(0) } });
}

export default JobLock;
