// Account roles (prd.md → Stakeholders).
export const MANAGER_ROLES = ['airline_manager', 'hotel_manager'];
export const isManager = (user) => MANAGER_ROLES.includes(user?.role);
export const isStaff = (user) => isManager(user) || user?.role === 'admin';

// Where a user lands after signing in when they didn't come from a specific page.
export function homeFor(user) {
  if (user?.role === 'admin') return '/admin';
  if (isManager(user)) return '/supplier';
  return '/';
}

// The notice shown when a signed-in user opens a page meant for another role.
export const ROLE_NOTICES = {
  admin: 'That area is for administrators only.',
  manager: 'That area is for airline and hotel managers only.',
  traveler: 'Staff accounts can’t book trips. Sign in with a traveller account to book.',
};
