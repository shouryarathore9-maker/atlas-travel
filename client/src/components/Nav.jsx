import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import { SandboxBanner } from './Sandbox.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { isManager } from '../lib/roles.js';

// Laptop: explore links beside the logo, account links on the right.
// Phone (design.md → Phone layouts → Header): logo, the bell and a menu button; the menu opens a
// panel under the header with the same links — nothing is hidden without a way to reach it.
export default function Nav() {
  const { user, status, logout, sandbox } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Any navigation closes the menu.
  useEffect(() => setMenuOpen(false), [location.pathname, location.hash]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/');
  }

  // Already on the homepage? Scroll now — re-clicking the same #hash wouldn't trigger a route change.
  function scrollToSection(id) {
    setMenuOpen(false);
    if (location.pathname !== '/') return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const onAuthPage = ['/login', '/signup'].includes(location.pathname);
  const signInHref = onAuthPage ? `/login${location.search}` : `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  const explore = (
    <>
      <Link to="/#destinations" className="nav-link" onClick={() => scrollToSection('destinations')}>
        Destinations
      </Link>
      <Link to="/#offers" className="nav-link" onClick={() => scrollToSection('offers')}>
        Offers
      </Link>
      <Link to="/#best-hotels" className="nav-link" onClick={() => scrollToSection('best-hotels')}>
        Stays
      </Link>
    </>
  );
  const roleLinks = (
    <>
      {user?.role === 'traveler' && (
        <NavLink to="/bookings" className="nav-link">
          My trips
        </NavLink>
      )}
      {user?.role === 'traveler' && (
        <NavLink to="/travellers" className="nav-link">
          Saved travellers
        </NavLink>
      )}
      {isManager(user) && (
        <NavLink to="/supplier" className="nav-link">
          Supplier console
        </NavLink>
      )}
      {user?.role === 'admin' && (
        <NavLink to="/admin" className="nav-link">
          Admin console
        </NavLink>
      )}
    </>
  );
  const greeting = user && (user.role === 'traveler' ? `Hi, ${user.name.split(' ')[0]}` : user.name);
  const signOut = user && (
    <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
      {sandbox ? 'Leave demo' : 'Sign out'}
    </button>
  );
  const signIn = (
    <Link to={signInHref} className="nav-link nav-signin">
      <Icon name="guest" size={20} /> Sign in
    </Link>
  );

  return (
    <>
      <SandboxBanner />
      <header className="nav">
        <div className="container nav-inner">
          <div className="nav-left">
            <Link to="/" className="logo" aria-label="Atlas home">
              Atlas
            </Link>
            <nav className="nav-explore" aria-label="Explore">
              {explore}
            </nav>
          </div>
          <div className="nav-right">
            {user && status === 'ready' && <NotificationBell />}
            <nav className="nav-links" aria-label="Account">
              {roleLinks}
              {user ? (
                <>
                  {/* Travellers are greeted by first name; staff accounts are named after their airline or hotel. */}
                  <span className="nav-user" title={user.name}>
                    {greeting}
                  </span>
                  {signOut}
                </>
              ) : (
                signIn
              )}
            </nav>
            <button type="button" className="icon-btn nav-menu-btn" aria-expanded={menuOpen} aria-controls="nav-menu" aria-label={menuOpen ? 'Close menu' : 'Menu'} onClick={() => setMenuOpen((o) => !o)}>
              <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="nav-menu" id="nav-menu">
            <nav className="container nav-menu-inner" aria-label="Menu">
              {explore}
              {user && <hr className="nav-menu-rule" />}
              {roleLinks}
              <hr className="nav-menu-rule" />
              {user ? (
                <div className="nav-menu-account">
                  <span className="small muted">{greeting}</span>
                  {signOut}
                </div>
              ) : (
                signIn
              )}
            </nav>
          </div>
        )}
      </header>
      {menuOpen && <button type="button" className="nav-menu-scrim" aria-label="Close menu" tabIndex={-1} onClick={() => setMenuOpen(false)} />}
    </>
  );
}
