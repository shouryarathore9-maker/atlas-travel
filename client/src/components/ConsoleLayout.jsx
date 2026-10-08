import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Banner, Spinner } from './States.jsx';

// Shell for the supplier and admin consoles (design.md → Supplier and admin consoles): a console bar
// with the organisation name, a left sidebar on laptop (a scrolling tab row below 1024px), and the page.
export default function ConsoleLayout({ title, eyebrow, links, outletContext }) {
  const location = useLocation();
  const notice = location.state?.notice;
  return (
    <div className="console">
      <div className="console-bar">
        <div className="container">
          <p className="eyebrow">{eyebrow}</p>
          <p className="console-title">{title}</p>
        </div>
      </div>
      <div className="container console-body">
        <nav className="console-nav" aria-label={`${eyebrow} sections`}>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `console-link ${isActive ? 'is-active' : ''}`}>
              {link.icon && <Icon name={link.icon} size={18} />}
              {link.label}
            </NavLink>
          ))}
        </nav>
        <main id="main" className="console-main">
          {notice && (
            <Banner tone="info">
              <p>{notice}</p>
            </Banner>
          )}
          {/* Console pages load on demand; keep the shell on screen while they do. */}
          <Suspense fallback={<Spinner />}>
            <Outlet context={outletContext} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
