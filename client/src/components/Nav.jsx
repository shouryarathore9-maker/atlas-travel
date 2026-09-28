import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const onAuthPage = ['/login', '/signup'].includes(location.pathname);
  const signInHref = onAuthPage ? `/login${location.search}` : `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <header className="nav">
      <div className="container nav-inner">
        <div className="nav-left">
          <Link to="/" className="logo" aria-label="Atlas home">
            Atlas
          </Link>
          <nav className="nav-explore" aria-label="Explore">
            <Link to="/#destinations" className="nav-link">
              Destinations
            </Link>
            <Link to="/?tab=hotels#search" className="nav-link">
              Stays
            </Link>
          </nav>
        </div>
        <nav className="nav-links" aria-label="Account">
          {user && (
            <NavLink to="/bookings" className="nav-link">
              My trips
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className="nav-link">
              Admin
            </NavLink>
          )}
          {user ? (
            <>
              <span className="nav-user">Hi, {user.name.split(' ')[0]}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <Link to={signInHref} className="nav-link nav-signin">
              <Icon name="guest" size={20} /> Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
