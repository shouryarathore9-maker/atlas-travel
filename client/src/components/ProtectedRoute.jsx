import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { Spinner } from './States.jsx';

export default function ProtectedRoute({ children, role }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Spinner label="Checking your session…" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/" replace state={{ notice: 'That area is for administrators only.' }} />;
  }
  return children;
}
