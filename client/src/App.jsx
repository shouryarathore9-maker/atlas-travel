import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Footer from './components/Footer.jsx';
import Nav from './components/Nav.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { Spinner } from './components/States.jsx';
import FlightDetail from './pages/FlightDetail.jsx';
import FlightResults from './pages/FlightResults.jsx';
import Home from './pages/Home.jsx';
import HotelDetail from './pages/HotelDetail.jsx';
import HotelResults from './pages/HotelResults.jsx';
import NotFound from './pages/NotFound.jsx';

// Browse pages (above) are small and on the critical path, so they ship in the main bundle.
// Signed-in and admin pages load on demand.
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Confirmation = lazy(() => import('./pages/Confirmation.jsx'));
const MyBookings = lazy(() => import('./pages/MyBookings.jsx'));
const Login = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Signup })));
// Consoles (Phase 2) are only loaded by managers and admins.
const SupplierConsole = lazy(() => import('./pages/supplier/SupplierConsole.jsx'));
const SupplierOverview = lazy(() => import('./pages/supplier/SupplierOverview.jsx'));
const Services = lazy(() => import('./pages/supplier/Services.jsx'));
const ServiceForm = lazy(() => import('./pages/supplier/ServiceForm.jsx'));
const Departures = lazy(() => import('./pages/supplier/Departures.jsx'));
const HotelProperty = lazy(() => import('./pages/supplier/HotelProperty.jsx'));
const AdminConsole = lazy(() => import('./pages/admin/AdminConsole.jsx'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog.jsx'));

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0); // pages handle their own #anchors
  }, [pathname, hash]);
  return null;
}

function Shell() {
  return (
    <>
      <Nav />
      {/* Full-height wrapper keeps the footer below the fold while pages load (prevents layout shift). */}
      <div className="shell-main">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </div>
      <Footer />
    </>
  );
}

const authed = (el, role) => <ProtectedRoute role={role}>{el}</ProtectedRoute>;

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ScrollToTop />
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Home />
              <Footer />
            </>
          }
        />
        <Route element={<Shell />}>
          <Route path="/flights" element={<FlightResults />} />
          <Route path="/flights/:id" element={<FlightDetail />} />
          <Route path="/hotels" element={<HotelResults />} />
          <Route path="/hotels/:id" element={<HotelDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/checkout" element={authed(<Checkout />, 'traveler')} />
          <Route path="/bookings" element={authed(<MyBookings />, 'traveler')} />
          <Route path="/bookings/:reference/confirmation" element={authed(<Confirmation />, 'traveler')} />
          <Route path="/supplier" element={authed(<SupplierConsole />, 'manager')}>
            <Route index element={<SupplierOverview />} />
            <Route path="services" element={<Services />} />
            <Route path="services/new" element={<ServiceForm />} />
            <Route path="services/:id" element={<ServiceForm key="edit" />} />
            <Route path="departures" element={<Departures />} />
            <Route path="hotel" element={<HotelProperty />} />
          </Route>
          <Route path="/admin" element={authed(<AdminConsole />, 'admin')}>
            <Route index element={<Navigate to="/admin/audit" replace />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
