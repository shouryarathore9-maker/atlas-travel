import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Footer from './components/Footer.jsx';
import Nav from './components/Nav.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { Spinner } from './components/States.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';

const FlightResults = lazy(() => import('./pages/FlightResults.jsx'));
const HotelResults = lazy(() => import('./pages/HotelResults.jsx'));
const FlightDetail = lazy(() => import('./pages/FlightDetail.jsx'));
const HotelDetail = lazy(() => import('./pages/HotelDetail.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Confirmation = lazy(() => import('./pages/Confirmation.jsx'));
const MyBookings = lazy(() => import('./pages/MyBookings.jsx'));
const Login = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Signup })));
const AdminList = lazy(() => import('./pages/admin/AdminList.jsx'));
const FlightForm = lazy(() => import('./pages/admin/FlightForm.jsx'));
const HotelForm = lazy(() => import('./pages/admin/HotelForm.jsx'));

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
      <Suspense fallback={<Spinner />}>
        <Outlet />
      </Suspense>
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
          <Route path="/checkout" element={authed(<Checkout />)} />
          <Route path="/bookings" element={authed(<MyBookings />)} />
          <Route path="/bookings/:reference/confirmation" element={authed(<Confirmation />)} />
          <Route path="/admin" element={<Navigate to="/admin/flights" replace />} />
          <Route path="/admin/flights" element={authed(<AdminList resource="flights" key="flights" />, 'admin')} />
          <Route path="/admin/flights/new" element={authed(<FlightForm />, 'admin')} />
          <Route path="/admin/flights/:id" element={authed(<FlightForm />, 'admin')} />
          <Route path="/admin/hotels" element={authed(<AdminList resource="hotels" key="hotels" />, 'admin')} />
          <Route path="/admin/hotels/new" element={authed(<HotelForm />, 'admin')} />
          <Route path="/admin/hotels/:id" element={authed(<HotelForm />, 'admin')} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
