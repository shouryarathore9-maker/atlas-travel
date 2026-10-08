import mongoose from 'mongoose';
import { currentContext } from '../../utils/context.js';

// Isolation between real data and visitor sandboxes, enforced on every query of a sandboxable model.
//
// Inside a request, every read and write is constrained to the request's sandboxId (null for real
// data), so a real request can never see a sandbox document and a sandbox request can never see or
// change a real one — even if a controller forgets to filter, or a visitor sends a real id.
// A query that names a *different* sandboxId than its context is a bug and throws.
// Outside a request (seed scripts, tests, the daily job) nothing is injected.
//
// Note: Model.bulkWrite() is not covered by query middleware — request code that uses it must
// put `sandboxId` into each operation's filter itself.

const QUERY_OPS = [
  'countDocuments',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'deleteMany',
  'deleteOne',
  'replaceOne',
  'updateMany',
  'updateOne',
];

const same = (a, b) => String(a ?? null) === String(b ?? null);

export function sandboxScope(schema) {
  schema.add({
    sandboxId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    sandboxExpiresAt: { type: Date, default: null },
  });
  // Backstop: sandbox documents expire on their own even if every cleanup path fails.
  schema.index(
    { sandboxExpiresAt: 1 },
    { expireAfterSeconds: 0, partialFilterExpression: { sandboxExpiresAt: { $type: 'date' } } },
  );

  schema.pre(QUERY_OPS, function scopeQuery() {
    const ctx = currentContext();
    if (!ctx) return;
    const filter = this.getFilter();
    if ('sandboxId' in filter && !same(filter.sandboxId, ctx.sandboxId)) {
      throw new Error('Sandbox scope violation: query names a different sandbox than its request');
    }
    this.where({ sandboxId: ctx.sandboxId });
  });

  schema.pre('aggregate', function scopeAggregate() {
    const ctx = currentContext();
    if (!ctx) return;
    this.pipeline().unshift({ $match: { sandboxId: ctx.sandboxId } });
  });

  // New documents inherit the request's sandbox (and its expiry).
  schema.pre('validate', function stampDocument() {
    const ctx = currentContext();
    if (!ctx || !this.isNew) return;
    this.sandboxId = ctx.sandboxId;
    this.sandboxExpiresAt = ctx.sandboxExpiresAt ?? null;
  });

  schema.pre('insertMany', function stampMany(docs) {
    const ctx = currentContext();
    if (!ctx) return;
    for (const doc of Array.isArray(docs) ? docs : [docs]) {
      doc.sandboxId = ctx.sandboxId;
      doc.sandboxExpiresAt = ctx.sandboxExpiresAt ?? null;
    }
  });
}
