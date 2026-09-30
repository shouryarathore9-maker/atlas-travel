import RateLimit from '../models/RateLimit.js';

// express-rate-limit Store backed by MongoDB (https://express-rate-limit.mintlify.app/guides/stores).
// Each increment is a single atomic update: if the current window has ended the counter
// restarts at 1 with a fresh reset time, otherwise it goes up by one.
export class MongoRateLimitStore {
  constructor({ prefix }) {
    this.prefix = prefix;
    this.localKeys = false; // counts are shared across processes
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  #id(key) {
    return `${this.prefix}${key}`;
  }

  async increment(key) {
    const now = new Date();
    const windowOpen = { $gt: ['$resetAt', now] };
    const update = [
      {
        $set: {
          hits: { $cond: [windowOpen, { $add: ['$hits', 1] }, 1] },
          resetAt: { $cond: [windowOpen, '$resetAt', new Date(now.getTime() + this.windowMs)] },
        },
      },
    ];
    let doc;
    try {
      doc = await RateLimit.findOneAndUpdate({ _id: this.#id(key) }, update, { upsert: true, returnDocument: 'after', lean: true, updatePipeline: true });
    } catch (err) {
      // Two first-ever requests for the same key can race on the upsert; the loser retries as an update.
      if (err.code !== 11000) throw err;
      doc = await RateLimit.findOneAndUpdate({ _id: this.#id(key) }, update, { returnDocument: 'after', lean: true, updatePipeline: true });
    }
    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }

  async get(key) {
    const doc = await RateLimit.findById(this.#id(key)).lean();
    if (!doc || doc.resetAt <= new Date()) return undefined;
    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }

  async decrement(key) {
    await RateLimit.updateOne({ _id: this.#id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key) {
    await RateLimit.deleteOne({ _id: this.#id(key) });
  }
}
