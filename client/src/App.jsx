import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Footer from './components/Footer.jsx';
import Nav from './components/Nav.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { Spinner } from './components/States.jsx';
import { startProgressNow } from './lib/progress.js';
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
const DepartureDetail = lazy(() => import('./pages/supplier/DepartureDetail.jsx'));
const Reservations = lazy(() => import('./pages/supplier/Reservations.jsx'));
const Pricing = lazy(() => import('./pages/supplier/Pricing.jsx'));
const Policies = lazy(() => import('./pages/supplier/Policies.jsx'));
const SupplierRequests = lazy(() => import('./pages/supplier/Requests.jsx'));
const SupplierTicket = lazy(() => import('./pages/supplier/SupplierTicket.jsx'));
const SupplierOffers = lazy(() => import('./pages/supplier/SupplierOffers.jsx'));
const SupplierStatements = lazy(() => import('./pages/supplier/Statements.jsx').then((m) => ({ default: m.Statements })));
const SupplierStatement = lazy(() => import('./pages/supplier/Statements.jsx').then((m) => ({ default: m.StatementDetail })));
const AdminConsole = lazy(() => import('./pages/admin/AdminConsole.jsx'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics.jsx'));
const AdminBookings = lazy(() => import('./pages/admin/AdminBookings.jsx'));
const AdminBookingDetail = lazy(() => import('./pages/admin/AdminBookingDetail.jsx'));
const AdminTickets = lazy(() => import('./pages/admin/AdminTickets.jsx'));
const AdminTicket = lazy(() => import('./pages/admin/AdminTicket.jsx'));
const AdminSpecialRequests = lazy(() => import('./pages/admin/AdminSpecialRequests.jsx'));
const AdminOffers = lazy(() => import('./pages/admin/AdminOffers.jsx'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx'));
const AdminSuppliers = lazy(() => import('./pages/admin/AdminSuppliers.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx').then((m) => ({ default: m.AdminUsers })));
const AdminUser = lazy(() => import('./pages/admin/AdminUsers.jsx').then((m) => ({ default: m.AdminUser })));
const AdminSettlement = lazy(() => import('./pages/admin/AdminSettlement.jsx').then((m) => ({ default: m.AdminSettlement })));
const AdminStatement = lazy(() => import('./pages/admin/AdminSettlement.jsx').then((m) => ({ default: m.AdminStatement })));
const OfferEditor = lazy(() => import('./pages/OfferEditor.jsx'));
const Documents = lazy(() => import('./pages/Documents.jsx'));
const HelpTicket = lazy(() => import('./pages/HelpTicket.jsx'));
const SavedTravellers = lazy(() => import('./pages/SavedTravellers.jsx'));
const OffersPage = lazy(() => import('./pages/Offers.jsx').then((m) => ({ default: m.OffersPage })));
const OfferDetail = lazy(() => import('./pages/Offers.jsx').then((m) => ({ default: m.OfferDetail })));
const AuditLog = lazy(() => import('./pages/admin/AuditLog.jsx'));

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0); // pages handle their own #anchors
  }, [pathname, hash]);
  return null;
}

// Shown while a page's code downloads: the branded loader plus the top progress bar at once.
function RouteFallback() {
  useEffect(() => startProgressNow(), []);
  return <Spinner />;
}

function Shell() {
  return (
    <>
      <Nav />
      {/* Full-height wrapper keeps the footer below the fold while pages load (prevents layout shift). */}
      <div className="shell-main">
        <Suspense fallback={<RouteFallback />}>
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
      <ProgressBar />
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
          <Route path="/bookings/:reference/documents" element={authed(<Documents />, 'traveler')} />
          <Route path="/help/:id" element={authed(<HelpTicket />, 'traveler')} />
          <Route path="/travellers" element={authed(<SavedTravellers />, 'traveler')} />
          <Route path="/offers" element={<OffersPage />} />
          <Route path="/offers/:slug" element={<OfferDetail />} />
          <Route path="/supplier" element={authed(<SupplierConsole />, 'manager')}>
            <Route index element={<SupplierOverview />} />
            <Route path="services" element={<Services />} />
            <Route path="services/new" element={<ServiceForm />} />
            <Route path="services/:id" element={<ServiceForm key="edit" />} />
            <Route path="departures" element={<Departures />} />
            <Route path="departures/:id" element={<DepartureDetail />} />
            <Route path="hotel" element={<HotelProperty />} />
            <Route path="reservations" element={<Reservations />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="policies" element={<Policies />} />
            <Route path="requests" element={<SupplierRequests />} />
            <Route path="tickets/:id" element={<SupplierTicket />} />
            <Route path="offers" element={<SupplierOffers />} />
            <Route path="statements" element={<SupplierStatements />} />
            <Route path="statements/:id" element={<SupplierStatement />} />
            <Route path="offers/new" element={<OfferEditor scope="supplier" />} />
            <Route path="offers/:id" element={<OfferEditor scope="supplier" key="edit" />} />
          </Route>
          <Route path="/admin" element={authed(<AdminConsole />, 'admin')}>
            <Route index element={<Navigate to="/admin/analytics" replace />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="bookings" element={<AdminBookings />} />
            <Route path="bookings/:ref" element={<AdminBookingDetail />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="tickets/:id" element={<AdminTicket />} />
            <Route path="special-requests" element={<AdminSpecialRequests />} />
            <Route path="offers" element={<AdminOffers />} />
            <Route path="offers/new" element={<OfferEditor scope="admin" />} />
            <Route path="offers/:id" element={<OfferEditor scope="admin" key="edit" />} />
            <Route path="suppliers" element={<AdminSuppliers />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:id" element={<AdminUser />} />
            <Route path="settlement" element={<AdminSettlement />} />
            <Route path="settlement/:id" element={<AdminStatement />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
