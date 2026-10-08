// Supplier suspension (prd.md → Admin console → Suppliers). A suspended supplier's inventory is hidden
// from search and can't be booked, and its manager can't sign in; existing bookings are untouched.
import Supplier from '../models/Supplier.js';

export const isSuspended = (supplier) => supplier?.status === 'suspended';

/** A filter fragment that leaves out listings of suspended suppliers ({} when there are none). */
export async function hiddenSupplierFilter() {
  const ids = await Supplier.find({ status: 'suspended' }).distinct('_id');
  return ids.length ? { supplierId: { $nin: ids } } : {};
}
