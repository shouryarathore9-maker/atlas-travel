import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { isManager } from '../lib/roles.js';

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  // Already on the homepage? Scroll now — re-clicking the same #hash wouldn't trigger a route change.
  function scrollToSection(id) {
    if (location.pathname !== '/') return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const onAuthPage =['/login', '/signup'].includes(location.pathname);
  const signInHref = onAuthPage ? `/login${location.search}` : `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <header className="nav">
      <div className="container nav-inner">
        <div className="nav-left">
          <Link to="/" className="logo" aria-label="Atlas home">
            Atlas
          </Link>
          <nav className="nav-explore" aria-label="Explore">
            <Link to="/#destinations" className="nav-link" onClick={() => scrollToSection('destinations')}>
              Destinations
            </Link>
            <Link to="/#best-hotels" className="nav-link" onClick={() => scrollToSection('best-hotels')}>
              Stays
            </Link>
          </nav>
        </div>
        <nav className="nav-links" aria-label="Account">
          {user && <NotificationBell />}
          {user?.role === 'traveler' && (
            <NavLink to="/bookings" className="nav-link">
              My trips
            </NavLink>
          )}
          {isManager(user) && (
            <NavLink to="/supplier" className="nav-link">
              <span className="hide-phone">Supplier </span>console
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className="nav-link">
              <span className="hide-phone">Admin </span>console
            </NavLink>
          )}
          {user ? (
            <>
              {/* Travellers are greeted by first name; staff accounts are named after their airline or hotel. */}
              <span className="nav-user" title={user.name}>
                {user.role === 'traveler' ? `Hi, ${user.name.split(' ')[0]}` : user.name}
              </span>
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
