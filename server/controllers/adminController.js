// Admin console (prd.md → Admin console). Admin oversees the platform; it does not edit supplier
// inventory, prices or refunds (the Phase 1 inventory editor moved to the supplier console).
import mongoose from 'mongoose';
import { z } from 'zod';
import AuditLog from '../models/AuditLog.js';
import Supplier from '../models/Supplier.js';
import { pagination } from '../utils/query.js';

export const auditQuerySchema = z.object({
  supplierId: z.string().refine((id) => mongoose.isValidObjectId(id), 'Invalid supplier').optional(),
  actorRole: z.enum(['admin', 'airline_manager', 'hotel_manager']).optional(),
  action: z.string().trim().max(60).optional(),
  ...pagination,
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listAudit(req, res) {
  const { supplierId, actorRole, action, page, limit } = req.validated.query;
  const filter = {
    ...(supplierId && { supplierId }),
    ...(actorRole && { actorRole }),
    ...(action && { action: new RegExp(`^${escapeRegex(action)}`) }),
  };
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  const suppliers = await Supplier.find({ _id: { $in: [...new Set(items.map((i) => i.supplierId).filter(Boolean))] } }, { name: 1 }).lean();
  const names = Object.fromEntries(suppliers.map((s) => [String(s._id), s.name]));
  res.json({
    items: items.map((i) => ({ ...i, supplierName: i.supplierId ? names[i.supplierId] || null : null })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function listSuppliers(req, res) {
  const suppliers = await Supplier.find({}, { name: 1, kind: 1, code: 1 }).sort({ kind: 1, name: 1 }).lean();
  res.json({ suppliers });
}
