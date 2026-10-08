// "₹12,345" with Indian digit grouping (used in notification text).
export function formatInr(amount) {
  return `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;
}
