import AuditLog from '../models/AuditLog.js';

// One entry per staff action (never one per affected booking — pass `count` instead).
// `before` / `after` are plain snapshots of only the fields that changed hands.
export async function audit(req, { action, target, before = null, after = null, count = null }) {
  await AuditLog.create({
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    supplierId: req.supplierId ?? null,
    action,
    target,
    before,
    after,
    count,
  });
}

// Keeps audit snapshots small and JSON-friendly.
export function snapshot(doc, fields) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return Object.fromEntries(fields.map((f) => [f, plain[f] ?? null]));
}
