import Supplier from '../models/Supplier.js';
import { MANAGER_ROLES } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';

// Supplier console: airline or hotel managers only. Attaches the manager's own supplier — every
// supplier query is then filtered by req.supplierId, so another supplier's ids simply aren't found.
export async function managerOnly(req, res, next) {
  if (!MANAGER_ROLES.includes(req.user?.role) || !req.user.supplierId) {
    throw new HttpError(403, 'That area is for airline and hotel managers only.', 'FORBIDDEN');
  }
  const supplier = await Supplier.findById(req.user.supplierId).lean();
  if (!supplier) throw new HttpError(403, 'Your account isn’t linked to an airline or hotel.', 'FORBIDDEN');
  req.supplier = supplier;
  req.supplierId = supplier._id;
  next();
}

export function airlineOnly(req, res, next) {
  if (req.supplier?.kind !== 'airline') throw new HttpError(404, 'Not found', 'NOT_FOUND');
  next();
}

export function hotelOnly(req, res, next) {
  if (req.supplier?.kind !== 'hotel') throw new HttpError(404, 'Not found', 'NOT_FOUND');
  next();
}
