import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { homeFor, isManager, ROLE_NOTICES } from '../lib/roles.js';
import { Spinner } from './States.jsx';

// role: 'admin' | 'manager' (airline or hotel) | 'traveler' | undefined (any signed-in user)
function allowed(user, role) {
  if (!role) return true;
  if (role === 'manager') return isManager(user);
  return user.role === role;
}

export default function ProtectedRoute({ children, role }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Spinner label="Checking your session…" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!allowed(user, role)) {
    const home = homeFor(user);
    return <Navigate to={home === location.pathname ? '/' : home} replace state={{ notice: ROLE_NOTICES[role] }} />;
  }
  return children;
}
